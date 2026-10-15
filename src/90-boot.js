
// ===== 起動・テスト用フック =====
setPh($('ttl'), '文字|型抜き');
setPh($('ttlLead'), '砂糖菓子の文字を|割らないように|針で切り抜こう');
document.querySelectorAll('.auto').forEach(el => setPh(el, el.textContent));
show('scTitle');
requestAnimationFrame(frame);
loadGlyphFonts('あアA').catch(() => { });

// 検証・ブラウザ確認用。針を座標列で動かして判定する、全部切る、など
window.__DEBUG = {
  G, CFG,
  get shape() { return G.shape; },
  get dig() { return G.dig; },
  get screen() { return G.screen; },
  contour() { return G.shape.loops.map(l => ({ hole: l.hole, part: l.part, pts: Array.from(l.pts) })); },
  state() {
    const d = G.dig;
    return d ? { failed: d.failed, why: d.failWhy, cleared: d.cleared, crack: d.crack, down: d.down, progress: d.progress(), partDone: d.partDone.slice(), t: d.t, over: G.over, screen: G.screen } : { screen: G.screen };
  },
  press(x, y) { const r = G.dig.press(x, y); G.needle.x = x; G.needle.y = y; G.needle.vis = true; if (r.ok) act(r.events); return r; },
  move(x, y, dt) { G.needle.x = x; G.needle.y = y; const ev = G.dig.move(x, y, dt || 0.016); act(ev); return ev; },
  release() { G.dig.release(); },
  // 輪郭を順にたどる（speed は速度上限に対する割合）
  trace(speed) {
    const d = G.dig, sp = (speed || 0.5) * d.P.speedLimit;
    for (const part of G.shape.parts) for (const l of part.loops) {
      if (G.over) return this.state();
      const dt = (l.len / l.n) / sp;
      const at = i => [l.pts[2 * (i % l.n)], l.pts[2 * (i % l.n) + 1]];
      this.press(...at(0));
      for (let i = 1; i <= l.n + 4 && d.down; i++) { const p = at(i); this.move(p[0], p[1], dt); }
      d.release();
      d.t += l.len / sp;
    }
    return this.state();
  },
  cutAll() { return this.trace(0.5); },
  startWord, startRandom, beginChar, showResult, showHow, showRecords, leaveGame,
  get rec() { return G.rec; },
  get howSeen() { return G.howSeen; },
  shapeOf: ch => makeShapeSync(ch),
};
