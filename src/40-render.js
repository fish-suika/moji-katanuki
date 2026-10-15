
// ===== 描画（砂糖菓子・溝・針）=====
const CANDY = [
  { fill: '#ffc6da', rim: '#eb97b5', hi: '#ffe9f1', groove: 'rgba(150,60,100,.55)', cutc: '#fffafc' },
  { fill: '#bfe2ff', rim: '#8cbfe8', hi: '#e6f4ff', groove: 'rgba(50,90,150,.5)', cutc: '#fbfdff' },
  { fill: '#fff0a6', rim: '#e8cf6a', hi: '#fffadc', groove: 'rgba(150,115,30,.5)', cutc: '#fffef6' },
];
const G = {
  session: null, shape: null, dig: null, P: null, color: CANDY[0], char: '',
  needle: { x: 0, y: 0, vis: false }, touch: false,
  over: false, view: { w: 300, h: 300, cx: 150, cy: 150, R: 140, dpr: 1 },
  failAt: 0, seed: 1, anim: 0,
};

function loopPath(ctx, l) {
  const p = l.pts, n = l.n;
  ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(p[2 * i], p[2 * i + 1]);
  ctx.closePath();
}
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function drawGame(ctx) {
  const v = G.view;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.clearRect(0, 0, v.w, v.h);
  if (!G.shape || !G.dig) return;
  const dig = G.dig, P = G.P, col = G.color, shape = G.shape;
  ctx.save();
  ctx.translate(v.cx, v.cy);
  ctx.scale(v.R, v.R);
  // 影・板
  ctx.beginPath(); ctx.arc(0.02, 0.045, 1, 0, 6.2832); ctx.fillStyle = 'rgba(90,40,60,.18)'; ctx.fill();
  const g = ctx.createRadialGradient(-0.3, -0.35, 0.1, 0, 0, 1.05);
  g.addColorStop(0, col.hi); g.addColorStop(1, col.fill);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.2832); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 0.035; ctx.strokeStyle = col.rim; ctx.stroke();
  // 溝
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const gw = P.safe * 2;
  shape.parts.forEach((part, pi) => {
    if (dig.partDone[pi]) return;
    ctx.beginPath();
    for (const l of part.loops) loopPath(ctx, l);
    ctx.lineWidth = gw; ctx.strokeStyle = col.groove; ctx.stroke();
    // 切れた溝（明るく）
    ctx.beginPath();
    for (const l of part.loops) {
      const c = dig.cut[l.id], p = l.pts, n = l.n;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (c[i] && c[j]) { ctx.moveTo(p[2 * i], p[2 * i + 1]); ctx.lineTo(p[2 * j], p[2 * j + 1]); }
      }
    }
    ctx.lineWidth = gw * 0.78; ctx.strokeStyle = col.cutc; ctx.stroke();
  });
  // 外れた部品（浮かせて表示）
  shape.parts.forEach((part, pi) => {
    if (!dig.partDone[pi]) return;
    ctx.save();
    ctx.translate(-0.015, -0.025);
    ctx.shadowColor = 'rgba(90,40,60,.45)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    ctx.beginPath();
    for (const l of part.loops) loopPath(ctx, l);
    ctx.fillStyle = col.hi; ctx.fill('evenodd');
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 0.012; ctx.strokeStyle = col.rim; ctx.stroke();
    ctx.restore();
  });
  // 切り残しのヒント
  const hints = (G.over || dig.failed || dig.cleared) ? [] : dig.hints();
  if (hints.length) {
    const a = 0.5 + 0.35 * Math.sin(G.anim * 7);
    ctx.fillStyle = 'rgba(255,215,0,' + a.toFixed(2) + ')';
    ctx.beginPath();
    for (const h of hints) { ctx.moveTo(h[0] + 0.03, h[1]); ctx.arc(h[0], h[1], 0.03, 0, 6.2832); }
    ctx.fill();
  }
  // 割れた表示
  if (dig.failed && dig.failPos) {
    const rr = rnd(G.seed), fp = dig.failPos;
    ctx.strokeStyle = '#4a1d2e'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < 9; k++) {
      let x = fp.x, y = fp.y, a = rr() * 6.2832;
      ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 7; s++) { a += (rr() - 0.5) * 1.1; x += Math.cos(a) * 0.13; y += Math.sin(a) * 0.13; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  ctx.restore();
  // 針（px 座標）
  const nd = G.needle;
  if (nd.vis && !dig.failed) {
    const x = v.cx + nd.x * v.R, y = v.cy + nd.y * v.R;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    // 安全な幅の目安（ごく薄く）
    ctx.beginPath(); ctx.arc(0, 0, P.safe * v.R, 0, 6.2832);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
    const lg = ctx.createLinearGradient(0, 0, 26, -34);
    lg.addColorStop(0, '#8b949c'); lg.addColorStop(0.5, '#f4f7fa'); lg.addColorStop(1, '#a5aeb6');
    ctx.strokeStyle = lg; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(24, -32); ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.arc(26, -35, 4.2, 0, 6.2832); ctx.fillStyle = dig.down ? '#e0608a' : '#c9d0d6'; ctx.fill();
    ctx.restore();
  }
}
