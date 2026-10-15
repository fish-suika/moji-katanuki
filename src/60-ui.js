
// ===== 画面・操作・進行 =====
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 文節ごとに inline-block の span で包む（'|' が文節の区切り）。言葉の途中では改行されない
function wrapPhrases(text) {
  return String(text).split('|').map(s => '<span class="ph">' + esc(s) + '</span>').join('');
}
function setPh(el, text) { el.innerHTML = wrapPhrases(text); }

const SCREENS = ['scTitle', 'scSelect', 'scGame', 'scResult'];
function show(id) { for (const s of SCREENS) $(s).classList.toggle('on', s === id); G.screen = id; }

let toastTimer = 0;
function toast(msg, bad, ms) {
  const t = $('toast');
  setPh(t, msg);
  t.classList.toggle('bad', !!bad);
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms || 1400);
}

const LEVEL_NAME = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

// ---------- キャンバスの大きさ ----------
const cv = $('cv'), cx2d = cv.getContext('2d');
function layout() {
  const wrap = $('stageWrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const v = G.view;
  v.w = w; v.h = h; v.cx = w / 2; v.cy = h / 2; v.R = Math.min(w, h) / 2 * 0.95; v.dpr = dpr;
}
let resizeTimer = 0;
window.addEventListener('resize', () => {
  if (G.screen !== 'scGame') return;
  layout();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (G.shape && G.color && G.fx && G.screen === 'scGame') { G.tex = bakeCandy(G.color, G.seed, G.view.R, G.view.dpr); G.fx.shards = null; } }, 150);
});

// ---------- ランダム選び ----------
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
async function pickRandom(level) {
  const band = CFG.bands[level], pool = shuffle(CFG.pools[level]);
  let fallback = null;
  for (let i = 0; i < pool.length && i < 14; i++) {
    const r = await makeShape(pool[i]);
    if (!r.ok) continue;
    if (!fallback) fallback = r;
    if (r.shape.stars >= band[0] && r.shape.stars <= band[1]) return r;
  }
  if (fallback) return fallback;
  for (const ch of CFG.pools.normal) { const r = await makeShape(ch); if (r.ok) return r; }
  return null;
}

// ---------- 進行 ----------
async function startRandom(level) {
  $('selMsg').textContent = '文字を選んでいます…';
  const r = await pickRandom(level);
  $('selMsg').textContent = '';
  if (!r) { setPh($('selMsg'), '文字を作れませんでした'); return; }
  G.session = { mode: 'random', level, chars: [r.ch], idx: 0, results: [], first: r };
  beginChar(r);
}
async function startWord(str) {
  const v = validateInput(str);
  if (!v.ok) { setPh($('selMsg'), v.msg); return false; }
  $('selMsg').textContent = '型を作っています…';
  const shapes = [];
  for (const ch of v.chars) {
    const r = await makeShape(ch);
    if (!r.ok) { setPh($('selMsg'), r.msg); return false; }
    shapes.push(r);
  }
  $('selMsg').textContent = '';
  G.session = { mode: 'word', chars: v.chars, idx: 0, results: [] };
  beginChar(shapes[0]);
  return true;
}
async function beginChar(res) {
  const S = G.session;
  if (!res) res = await makeShape(S.chars[S.idx]);
  show('scGame');
  layout();
  G.shape = res.shape;
  G.P = judgeParams(G.view.R);
  G.dig = newDig(G.shape, G.P);
  G.char = res.ch;
  G.color = CANDY[Math.floor(Math.random() * CANDY.length)];
  G.seed = (Math.random() * 1e9) | 0;
  G.over = false; G.needle.vis = false; G.touch = false;
  G.paths = buildPaths(G.shape);
  G.fx = newFx(G.seed);
  G.tex = bakeCandy(G.color, G.seed, G.view.R, G.view.dpr);
  SFX.scrapeStop();
  const total = S.chars.length;
  setPh($('hCh'), (total > 1 ? (S.idx + 1) + '/' + total + '|' : '') + '「' + G.char + '」');
  $('hStars').textContent = stars(G.shape.stars);
  $('hTime').textContent = '0.0 秒';
  $('gauge').firstElementChild.style.width = '0%';
  toast('輪郭の溝に|針を刺して|なぞろう', false, 2200);
}

function handleEvents(evs) {
  if (!evs) return;
  for (const e of evs) {
    if (e.type === 'part') {
      toast(G.shape.nParts > 1 ? '部品が外れた！' : '外れた！', false, 900);
      G.fx.partT[e.index] = G.anim;
      const src = [];
      for (const l of G.shape.parts[e.index].loops) for (let i = 0; i < l.n; i += 2) src.push([l.pts[2 * i], l.pts[2 * i + 1]]);
      const n = reducedMotion() ? FX.powderReduced : FX.powder;
      G.fx.powder.push(...spawnPowder(G.seed + e.index * 101 + G.fx.powder.length, src, n));
      SFX.scrapeStop();
      SFX.part();
    }
    if (e.type === 'clear' && !G.over) {
      G.over = true;
      SFX.scrapeStop();
      toast('抜けた！', false, 900);
      setTimeout(() => showResult(true), FX.clearMs);
    } else if (e.type === 'fail' && !G.over) {
      G.over = true;
      const fp = G.dig.failPos || { x: G.needle.x, y: G.needle.y };
      G.fx.failT = G.anim;
      crackBurst(G.fx.cracks, fp.x, fp.y, 7);
      SFX.shatter();
      toast(e.why === 'out' ? '割れた！|溝の外に出た' : '割れた！|ヒビが満タン', true, 1500);
      setTimeout(() => showResult(false), FX.failMs);
    }
  }
}

function showResult(ok) {
  const S = G.session, dig = G.dig;
  const last = S.idx >= S.chars.length - 1;
  let sc = null;
  if (ok) sc = scoreDig(dig, G.shape, G.P);
  S.results[S.idx] = { ch: G.char, ok, sc, stars: G.shape.stars };
  show('scResult');
  $('rChips').innerHTML = '';
  setPh($('rTitle'), '「' + G.char + '」を' + (ok ? '抜いた！' : '抜けなかった'));
  const rk = $('rank');
  rk.className = ''; rk.textContent = '';
  void rk.offsetWidth;                       // アニメーションをやり直す
  if (ok) {
    rk.className = sc.rank + ' pop'; rk.textContent = sc.rank;
    if (sc.rank === 'S') addSparks(rk);
    SFX.rank(sc.rank);
    $('score').textContent = sc.total + ' 点';
    $('rBd').innerHTML =
      '<span>ていねいさ</span><b>' + sc.pa + ' / ' + CFG.score.wAccuracy + '</b>' +
      '<span>ヒビの少なさ</span><b>' + sc.pc + ' / ' + CFG.score.wCrack + '</b>' +
      '<span>速さ（' + sc.time.toFixed(1) + ' 秒）</span><b>' + sc.ps + ' / ' + CFG.score.wSpeed + '</b>' +
      '<span>難しさ ' + stars(G.shape.stars) + '</span><b>× ' + sc.mult.toFixed(1) + '</b>';
    $('rMsg').textContent = '';
  } else {
    rk.className = 'fail pop'; rk.textContent = '割れた';
    $('score').textContent = '0 点';
    $('rBd').innerHTML = '';
    setPh($('rMsg'), dig.failWhy === 'out' ? '溝の外に|出てしまいました' : 'ヒビが|入りすぎました');
  }
  const b = $('rBtns'); b.innerHTML = '';
  const add = (label, fn, sub) => { const e = document.createElement('button'); e.className = 'btn' + (sub ? ' sub' : ''); e.textContent = label; e.addEventListener('click', fn); b.appendChild(e); };
  add('もう一度', () => beginChar({ ok: true, ch: G.char, shape: G.shape }));
  if (S.mode === 'random') add('次の文字', () => startRandom(S.level), true);
  else if (!last) add('次の文字', () => { S.idx++; beginChar(); });
  else add('結果を見る', showSummary);
  add('文字を選ぶ', toSelect, true);
}

function addSparks(rk) {
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * 6.2832 + 0.3, d = 70 + (i % 3) * 22;
    const sp = document.createElement('span');
    sp.className = 'spark'; sp.textContent = '✦';
    sp.style.setProperty('--dx', Math.round(Math.cos(a) * d) + 'px');
    sp.style.setProperty('--dy', Math.round(Math.sin(a) * d) + 'px');
    sp.style.animationDelay = (0.12 + (i % 4) * 0.05) + 's';
    rk.appendChild(sp);
  }
}

function showSummary() {
  const S = G.session;
  show('scResult');
  let total = 0, cleared = 0;
  for (const r of S.results) if (r) { if (r.ok) { total += r.sc.total; cleared++; } }
  setPh($('rTitle'), '「' + S.chars.join('') + '」の結果');
  const rk = $('rank'); rk.className = ''; rk.textContent = cleared + ' / ' + S.chars.length;
  $('score').textContent = '合計 ' + total + ' 点';
  $('rBd').innerHTML = '';
  $('rChips').innerHTML = S.chars.map((c, i) => {
    const r = S.results[i];
    return '<span class="chip">' + esc(c) + '<small>' + (r && r.ok ? r.sc.rank + ' ' + r.sc.total : '×') + '</small></span>';
  }).join('');
  setPh($('rMsg'), cleared === S.chars.length ? '全部抜けた！' : '抜けた文字は|' + cleared + ' 文字');
  const b = $('rBtns'); b.innerHTML = '';
  const add = (label, fn, sub) => { const e = document.createElement('button'); e.className = 'btn' + (sub ? ' sub' : ''); e.textContent = label; e.addEventListener('click', fn); b.appendChild(e); };
  add('はじめから', () => { S.idx = 0; S.results = []; beginChar(); });
  add('文字を選ぶ', toSelect, true);
}

function toSelect() { show('scSelect'); $('selMsg').textContent = ''; }

// ---------- 針の操作 ----------
function setNeedle(e) {
  const r = cv.getBoundingClientRect();
  const v = G.view;
  const off = G.touch ? CFG.touchOffsetPx : 0;
  const px = e.clientX - r.left, py = e.clientY - r.top - off;
  G.needle.x = (px - v.cx) / v.R; G.needle.y = (py - v.cy) / v.R; G.needle.vis = true;
}
let lastT = 0;
function act(evs) {
  handleEvents(evs);
  updateGauge();
  const d = G.dig;
  if (d && G.fx && !d.failed && !d.cleared) {
    if (crackUpdate(G.fx.cracks, G.needle.x, G.needle.y, d.crack) > 0) SFX.crack();
  }
}
function updateGauge() { if (G.dig) $('gauge').firstElementChild.style.width = Math.round(G.dig.crack * 100) + '%'; }

cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }
  G.touch = e.pointerType !== 'mouse';
  setNeedle(e);
  if (!G.dig || G.over) return;
  const r = G.dig.press(G.needle.x, G.needle.y);
  lastT = e.timeStamp;
  if (!r.ok) toast('ここには刺せない', true, 900);
  else { SFX.scrapeStart(); SFX.scrapeSet(0, false); act(r.events); }
});
cv.addEventListener('pointermove', e => {
  e.preventDefault();
  const list = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
  for (const ev of list) {
    setNeedle(ev);
    if (G.dig && G.dig.down && !G.over) {
      const dt = clamp((ev.timeStamp - lastT) / 1000, 1 / 240, 0.1);
      lastT = ev.timeStamp;
      const before = G.dig.crack;
      act(G.dig.move(G.needle.x, G.needle.y, dt));
      if (G.fx) G.fx.lastMove = G.anim;
      if (G.dig.down) SFX.scrapeSet(G.dig.ema / G.P.speedLimit, G.dig.crack > before);
    }
  }
});
const lift = e => { if (G.dig) G.dig.release(); if (G.touch) G.needle.vis = false; SFX.scrapeStop(); };
cv.addEventListener('pointerup', lift);
cv.addEventListener('pointercancel', lift);
cv.addEventListener('pointerleave', e => { if (!G.touch && !(G.dig && G.dig.down)) G.needle.vis = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

// ---------- ボタン ----------
$('bStart').addEventListener('click', toSelect);
$('bBackTitle').addEventListener('click', () => show('scTitle'));
document.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => startRandom(b.dataset.lv)));
$('bGo').addEventListener('click', () => startWord($('inp').value));
$('inp').addEventListener('keydown', e => { if (e.key === 'Enter') startWord($('inp').value); });
$('quit').addEventListener('click', () => { SFX.scrapeStop(); toSelect(); });

// ---------- 音（最初の操作で有効化。♪ でミュート）----------
['pointerdown', 'touchend', 'click', 'keydown'].forEach(n => document.addEventListener(n, () => SFX.unlock(), { capture: true }));
function syncMuteBtn() {
  const b = $('mute');
  b.classList.toggle('off', SFX.muted);
  b.setAttribute('aria-pressed', SFX.muted ? 'true' : 'false');
  b.setAttribute('aria-label', SFX.muted ? '音を出す' : '音を消す');
}
$('mute').addEventListener('click', () => { SFX.unlock(); SFX.setMuted(!SFX.muted); syncMuteBtn(); });
syncMuteBtn();

// ---------- 描画ループ ----------
let vigShown = -1;
function setVignette(a) {
  const o = a <= 0 ? 0 : Math.min(1, a / FX.vigMax * 0.8);
  if (Math.abs(o - vigShown) < 0.01 && !(o === 0 && vigShown !== 0)) return;
  vigShown = o;
  $('vig').style.opacity = o.toFixed(2);
}
let prevT = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - prevT) / 1000 || 0); prevT = t;
  G.anim = t / 1000;
  if (G.screen === 'scGame' && G.dig) {
    if (G.dig.started && !G.over) {
      G.dig.t += dt;
      $('hTime').textContent = G.dig.t.toFixed(1) + ' 秒';
    }
    if (G.fx) {
      stepPowder(G.fx.powder, dt);
      // 針が止まっていたら削る音を消す
      if (G.dig.down && G.anim - G.fx.lastMove > 0.09) SFX.scrapeSet(0, false);
      // 緊張感：ヒビが多いと縁が暗くなり、心音が速くなる
      const live = G.dig.started && !G.over && !G.dig.failed && !G.dig.cleared;
      const cr = live ? G.dig.crack : 0;
      setVignette(vignetteAlpha(cr));
      const hi = live ? heartInterval(cr) : null;
      if (hi !== null && G.anim >= G.fx.beatAt) {
        SFX.heart((cr - FX.heartFrom) / (1 - FX.heartFrom));
        G.fx.beatAt = G.anim + hi;
      }
    }
    drawGame(cx2d);
  } else setVignette(0);
  requestAnimationFrame(frame);
}
