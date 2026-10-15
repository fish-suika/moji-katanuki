
// ===== 描画（砂糖菓子・溝・針・演出）=====
const CANDY = [
  { fill: '#ffc6da', rim: '#eb97b5', hi: '#ffe9f1', groove: 'rgba(150,60,100,.55)', cutc: '#fffafc', tint: '120,50,85' },
  { fill: '#bfe2ff', rim: '#8cbfe8', hi: '#e6f4ff', groove: 'rgba(50,90,150,.5)', cutc: '#fbfdff', tint: '40,70,125' },
  { fill: '#fff0a6', rim: '#e8cf6a', hi: '#fffadc', groove: 'rgba(150,115,30,.5)', cutc: '#fffef6', tint: '130,100,25' },
  { fill: '#c6f0d8', rim: '#8fd1ae', hi: '#eafaf1', groove: 'rgba(40,120,85,.5)', cutc: '#fbfffd', tint: '35,100,70' },
  { fill: '#e0cdf7', rim: '#b79ee0', hi: '#f4ecff', groove: 'rgba(100,70,160,.5)', cutc: '#fdfaff', tint: '85,55,140' },
  { fill: '#ffd9bf', rim: '#eeb08a', hi: '#fff0e4', groove: 'rgba(160,90,45,.5)', cutc: '#fffaf5', tint: '140,75,35' },
];
const G = {
  session: null, shape: null, dig: null, P: null, color: CANDY[0], char: '',
  needle: { x: 0, y: 0, vis: false }, touch: false,
  over: false, view: { w: 300, h: 300, cx: 150, cy: 150, R: 140, dpr: 1 },
  failAt: 0, seed: 1, anim: 0,
  tex: null, paths: null, fx: null,
};

function loopPath(ctx, l) {
  const p = l.pts, n = l.n;
  ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(p[2 * i], p[2 * i + 1]);
  ctx.closePath();
}

// 砂糖菓子の質感を 1 枚のキャンバスに焼く（菓子ごとに 1 回。毎フレームは drawImage だけ）
// 座標は「半径 = 1」で、-1.08..1.08 を 1 枚に収める
const TEX_SPAN = 1.08;
function bakeCandy(col, seed, R, dpr) {
  const px = Math.min(900, Math.max(160, Math.round(2 * TEX_SPAN * R * dpr)));
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d', { willReadFrequently: true });
  const u = px / (2 * TEX_SPAN);
  x.translate(px / 2, px / 2); x.scale(u, u);
  const r = rnd((seed ^ 0x9e3779b9) >>> 0);
  const TAU = 6.2832;
  x.save();
  x.beginPath(); x.arc(0, 0, 1, 0, TAU); x.clip();
  // 下地
  const g = x.createRadialGradient(-0.3, -0.35, 0.1, 0, 0, 1.05);
  g.addColorStop(0, col.hi); g.addColorStop(1, col.fill);
  x.fillStyle = g; x.fillRect(-1.1, -1.1, 2.2, 2.2);
  // ほんのりした凹凸（大きなやわらかい明暗）
  for (let k = 0; k < 16; k++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.9, bx = Math.cos(a) * d, by = Math.sin(a) * d, br = 0.18 + r() * 0.3;
    const lg = x.createRadialGradient(bx, by, 0, bx, by, br);
    const light = k % 2 === 0;
    lg.addColorStop(0, light ? 'rgba(255,255,255,.26)' : 'rgba(' + col.tint + ',.10)');
    lg.addColorStop(1, light ? 'rgba(255,255,255,0)' : 'rgba(' + col.tint + ',0)');
    x.fillStyle = lg; x.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  // 粒（砂糖のつぶ）
  const nDot = Math.min(2400, Math.round(R * dpr * 6));
  for (let k = 0; k < nDot; k++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 1.0, sx = Math.cos(a) * d, sy = Math.sin(a) * d;
    const rad = 0.003 + r() * 0.0065;
    x.fillStyle = r() < 0.55 ? 'rgba(255,255,255,.65)' : 'rgba(' + col.tint + ',.22)';
    x.beginPath(); x.arc(sx, sy, rad, 0, TAU); x.fill();
  }
  x.restore();
  // 縁の厚み（外の輪、明るい面取り、影側の面取り）
  x.lineWidth = 0.05; x.strokeStyle = col.rim;
  x.beginPath(); x.arc(0, 0, 0.975, 0, TAU); x.stroke();
  const lgA = x.createLinearGradient(-0.7, -0.7, 0.7, 0.7);
  lgA.addColorStop(0, 'rgba(255,255,255,.95)'); lgA.addColorStop(0.6, 'rgba(255,255,255,0)');
  x.lineWidth = 0.022; x.strokeStyle = lgA;
  x.beginPath(); x.arc(0, 0, 0.94, 0, TAU); x.stroke();
  const lgB = x.createLinearGradient(-0.7, -0.7, 0.7, 0.7);
  lgB.addColorStop(0.4, 'rgba(' + col.tint + ',0)'); lgB.addColorStop(1, 'rgba(' + col.tint + ',.5)');
  x.lineWidth = 0.024; x.strokeStyle = lgB;
  x.beginPath(); x.arc(0, 0, 0.99, 0, TAU); x.stroke();
  // ざらつき（細かい明暗ノイズ。縁の外の透明部分は触らない）
  const im = x.getImageData(0, 0, px, px), d = im.data;
  let s = ((seed * 2654435761) >>> 0) || 1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s >>> 24) - 128) * 0.15;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(im, 0, 0);
  return c;
}

// 型の各部品の輪郭を Path2D にしておく
function buildPaths(shape) {
  return shape.parts.map(part => {
    const p = new Path2D();
    for (const l of part.loops) loopPath(p, l);
    return p;
  });
}

// 折れ線を、全長の frac だけ描く（ヒビが伸びる表示）
function tracePoly(ctx, pts, frac) {
  if (frac <= 0 || pts.length < 2) return;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total * Math.min(1, frac);
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l <= left) { ctx.lineTo(b[0], b[1]); left -= l; }
    else { const k = left / l; ctx.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); left = 0; }
  }
}
function drawCrackLines(ctx, lines) {
  // lines: [{pts, frac}]
  if (!lines.length) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(0.005, 0.005);
  ctx.beginPath(); for (const L of lines) tracePoly(ctx, L.pts, L.frac);
  ctx.lineWidth = 0.011; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); for (const L of lines) tracePoly(ctx, L.pts, L.frac);
  ctx.lineWidth = 0.0075; ctx.strokeStyle = 'rgba(70,25,45,.9)'; ctx.stroke();
}

// 砂糖菓子の本体（板・溝・外れた部品・ヒビ）。単位空間（半径 = 1）で描く
function drawBody(ctx, now) {
  const dig = G.dig, P = G.P, col = G.color, shape = G.shape, fx = G.fx;
  const dpr = G.view.dpr;
  ctx.drawImage(G.tex, -TEX_SPAN, -TEX_SPAN, TEX_SPAN * 2, TEX_SPAN * 2);
  // 溝（影・ハイライト・本体）
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const gw = P.safe * 2;
  shape.parts.forEach((part, pi) => {
    if (dig.partDone[pi]) return;
    const path = G.paths[pi];
    ctx.save();
    ctx.translate(0.011, 0.011);
    ctx.lineWidth = gw * 0.95; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke(path);   // 下側の縁に光
    ctx.restore();
    ctx.lineWidth = gw; ctx.strokeStyle = col.groove; ctx.stroke(path);
    ctx.save();
    ctx.translate(-0.004, -0.004);
    ctx.lineWidth = gw * 0.5; ctx.strokeStyle = 'rgba(' + col.tint + ',.28)'; ctx.stroke(path); // 上側の壁の影
    ctx.restore();
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
  // 外れた部品（少し浮いて持ち上がる）
  const reduced = reducedMotion();
  shape.parts.forEach((part, pi) => {
    if (!dig.partDone[pi]) return;
    const path = G.paths[pi];
    const el = now - (fx.partT[pi] === undefined ? -9 : fx.partT[pi]);
    const lift = liftAmount(el);
    const hover = (lift >= 1 && !reduced) ? Math.sin(el * 3.2) * 0.004 : 0;
    // 抜けたあとの穴
    ctx.fillStyle = 'rgba(' + col.tint + ',.32)'; ctx.fill(path, 'evenodd');
    ctx.save();
    ctx.translate(-0.035 * lift, -0.055 * lift - hover);
    ctx.scale(1 + 0.025 * lift, 1 + 0.025 * lift);
    ctx.shadowColor = 'rgba(90,40,60,.45)'; ctx.shadowBlur = (4 + 10 * lift) * dpr; ctx.shadowOffsetY = (2 + 6 * lift) * dpr;
    ctx.fillStyle = col.hi; ctx.fill(path, 'evenodd');
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.save();
    ctx.clip(path, 'evenodd');
    ctx.drawImage(G.tex, -TEX_SPAN, -TEX_SPAN, TEX_SPAN * 2, TEX_SPAN * 2);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-1.1, -1.1, 2.2, 2.2);
    ctx.restore();
    ctx.lineWidth = 0.012; ctx.strokeStyle = col.rim; ctx.stroke(path);
    ctx.restore();
  });
  // ヒビ（ゲージに応じて本数と長さが増える）＋失敗時の割れ目
  const lines = [];
  for (const it of fx.cracks.items) {
    const f = crackGrow(it, dig.crack);
    lines.push({ pts: it.pts, frac: f });
    for (const b of it.branches) lines.push({ pts: b, frac: f });
  }
  if (fx.failT >= 0) {
    const f = clamp((now - fx.failT) / FX.shatterAt, 0, 1);
    for (const b of fx.cracks.burst) lines.push({ pts: b, frac: f });
  }
  drawCrackLines(ctx, lines);
}

// 割れた瞬間の絵を 1 枚に撮って、かけら（多角形）に分ける
function buildShatter(now) {
  const fx = G.fx, fp = G.dig.failPos || { x: 0, y: 0 };
  const px = G.tex.width;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d');
  const u = px / (2 * TEX_SPAN);
  x.translate(px / 2, px / 2); x.scale(u, u);
  drawBody(x, now);
  fx.snap = c;
  const cx = clamp(fp.x, -0.7, 0.7), cy = clamp(fp.y, -0.7, 0.7);
  fx.shards = makeShards(G.seed, cx, cy, FX.shards);
}

function drawGame(ctx) {
  const v = G.view;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.clearRect(0, 0, v.w, v.h);
  if (!G.shape || !G.dig || !G.tex || !G.fx) return;
  const dig = G.dig, P = G.P, fx = G.fx, now = G.anim;
  const failEl = fx.failT >= 0 ? now - fx.failT : -1;
  // 画面の揺れ（割れた直後の短い間）
  const amp = shakeAmp(failEl, reducedMotion());
  if (amp > 0) {
    const sx = (Math.random() - 0.5) * 2 * amp, sy = (Math.random() - 0.5) * 2 * amp;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, sx * v.dpr, sy * v.dpr);
  }
  ctx.save();
  ctx.translate(v.cx, v.cy);
  ctx.scale(v.R, v.R);
  if (fx.failT >= 0 && failEl >= FX.shatterAt) {
    // かけらが回転しながら落ちる
    if (!fx.shards) buildShatter(now);
    const t = failEl - FX.shatterAt;
    const alpha = clamp(1 - (t - 0.75) / 0.45, 0, 1);
    ctx.globalAlpha = alpha;
    for (const s of fx.shards) {
      const q = shardPos(s, t);
      ctx.save();
      ctx.translate(s.cx + q.dx, s.cy + q.dy);
      ctx.rotate(q.rot);
      ctx.translate(-s.cx, -s.cy);
      ctx.beginPath();
      ctx.moveTo(s.poly[0][0], s.poly[0][1]);
      for (let i = 1; i < s.poly.length; i++) ctx.lineTo(s.poly[i][0], s.poly[i][1]);
      ctx.closePath();
      ctx.shadowColor = 'rgba(90,40,60,.35)'; ctx.shadowBlur = 5 * v.dpr; ctx.shadowOffsetY = 2 * v.dpr;
      ctx.fillStyle = G.color.fill; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.clip();
      ctx.drawImage(fx.snap, -TEX_SPAN, -TEX_SPAN, TEX_SPAN * 2, TEX_SPAN * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  } else {
    // 影
    ctx.beginPath(); ctx.arc(0.02, 0.045, 1, 0, 6.2832); ctx.fillStyle = 'rgba(90,40,60,.18)'; ctx.fill();
    drawBody(ctx, now);
    // 切り残しのヒント
    const hints = (G.over || dig.failed || dig.cleared) ? [] : dig.hints();
    if (hints.length) {
      const a = 0.5 + 0.35 * Math.sin(G.anim * 7);
      ctx.fillStyle = 'rgba(255,215,0,' + a.toFixed(2) + ')';
      ctx.beginPath();
      for (const h of hints) { ctx.moveTo(h[0] + 0.03, h[1]); ctx.arc(h[0], h[1], 0.03, 0, 6.2832); }
      ctx.fill();
    }
  }
  // 粉
  if (fx.powder.length) {
    const col = G.color;
    for (let c = 0; c < 2; c++) {
      ctx.beginPath();
      for (const p of fx.powder) if (p.c === c) { ctx.moveTo(p.x + p.size, p.y); ctx.arc(p.x, p.y, p.size, 0, 6.2832); }
      ctx.fillStyle = c === 0 ? 'rgba(255,255,255,.85)' : col.hi;
      ctx.globalAlpha = 0.85;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
