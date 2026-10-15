
// ===== 効果音（WebAudio で生成。外部素材なし）=====
const MUTE_KEY = 'mojiKatanuki.mute';
function loadMuted(st) { try { return !!st && st.getItem(MUTE_KEY) === '1'; } catch (_) { return false; } }
function saveMuted(st, v) { try { if (!st) return false; st.setItem(MUTE_KEY, v ? '1' : '0'); return true; } catch (_) { return false; } }
function getStorage() { try { return window.localStorage || null; } catch (_) { return null; } }

const SFX = {
  ctx: null, master: null, noiseBuf: null, scr: null,
  muted: loadMuted(getStorage()),
  // 最初のユーザー操作で呼ぶ（何度呼んでもよい）
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = b;
      }
      if (this.ctx.state === 'suspended') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => { }); }
    } catch (_) { this.ctx = null; }
  },
  setMuted(v) {
    this.muted = !!v;
    saveMuted(getStorage(), this.muted);
    if (this.master) { try { this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02); } catch (_) { } }
    if (this.muted) this.scrapeStop();
  },
  on() { return !!(this.ctx && !this.muted && this.ctx.state === 'running'); },
  tone(f0, f1, t0, dur, vol, type) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(t0, dur, vol, type, f0, f1, q) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.008, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.02);
  },
  // 削る音：動かしている間だけ鳴るノイズ。速さで高さと大きさが変わる
  scrapeStart() {
    if (!this.on() || this.scr) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
    g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start();
    this.scr = { s, f, g };
  },
  // ratio: 速さ / 速度上限（0 で止まっている）。edge: フチ（ヒビが入っている）か
  scrapeSet(ratio, edge) {
    const r = this.scr;
    if (!r || !this.ctx) return;
    const k = clamp(ratio, 0, 1.4), t = this.ctx.currentTime;
    const vol = k < 0.02 ? 0 : (0.02 + 0.07 * Math.min(1, k)) * (edge ? 1.5 : 1);
    r.g.gain.setTargetAtTime(vol, t, 0.03);
    r.f.frequency.setTargetAtTime(650 + 1700 * k + (edge ? 600 : 0), t, 0.04);
    r.f.Q.setTargetAtTime(edge ? 3 : 1.2, t, 0.05);
  },
  scrapeStop() {
    const r = this.scr;
    if (!r) return;
    this.scr = null;
    try {
      r.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      r.s.stop(this.ctx.currentTime + 0.15);
    } catch (_) { }
  },
  crack() {
    if (!this.on()) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.06, 0.28, 'highpass', 3200, 5000, 0.7);
    this.tone(2100, 900, t, 0.06, 0.1, 'triangle');
  },
  shatter() {
    if (!this.on()) return;
    const t = this.ctx.currentTime;
    this.scrapeStop();
    this.noise(t, 0.5, 0.55, 'lowpass', 7000, 500, 0.7);
    this.tone(170, 48, t, 0.3, 0.55, 'sine');
    for (let i = 0; i < 7; i++) this.noise(t + 0.03 + Math.random() * 0.4, 0.04, 0.22, 'highpass', 2500 + Math.random() * 3000, null, 0.8);
  },
  part() {
    if (!this.on()) return;
    const t = this.ctx.currentTime;
    this.tone(440, 880, t, 0.13, 0.22, 'sine');
    this.tone(660, 1320, t + 0.05, 0.14, 0.15, 'sine');
    this.noise(t, 0.18, 0.1, 'bandpass', 2600, 1800, 1);
  },
  rank(rank) {
    if (!this.on()) return;
    const t = this.ctx.currentTime;
    const seq = { S: [523, 659, 784, 1047], A: [392, 523, 659], B: [392, 523], C: [330] }[rank];
    if (!seq) return;
    seq.forEach((f, i) => this.tone(f, f, t + i * 0.11, 0.28, 0.2, 'triangle'));
    if (rank === 'S') for (let i = 0; i < 4; i++) this.tone(2093 + i * 260, 2093 + i * 260, t + 0.45 + i * 0.07, 0.18, 0.07, 'sine');
  },
  // 心音。strength: 0..1（ヒビが多いほど強く）
  heart(strength) {
    if (!this.on()) return;
    const t = this.ctx.currentTime, v = 0.22 + 0.4 * clamp(strength, 0, 1);
    this.tone(78, 42, t, 0.14, v, 'sine');
    this.tone(70, 40, t + 0.17, 0.14, v * 0.7, 'sine');
  },
};
