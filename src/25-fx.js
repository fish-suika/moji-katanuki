
// ===== 演出の純ロジック（DOM に依存しない。verify.html からも呼ぶ）=====
const FX = {
  crackStep: 0.09,        // ヒビゲージがこれ増えるごとに新しいヒビが 1 本伸びる
  crackMax: 22,           // 菓子の上のヒビの最大本数
  heartFrom: 0.3,         // ヒビゲージがこれ以上で心音が鳴り始める
  heartSlow: 1.15,        // 心音の間隔(秒)：鳴り始め
  heartFast: 0.38,        // 心音の間隔(秒)：ゲージ満タン
  vigFrom: 0.25,          // ビネットが出始めるゲージ
  vigMax: 0.5,            // ゲージ満タン時のビネットの濃さ
  liftSec: 0.4,           // 部品が浮き上がる時間
  shatterAt: 0.3,         // 失敗：割れ目が走る時間（その後かけらが落ちる）
  shakeSec: 0.3,          // 画面の揺れの長さ
  shakePx: 8,             // 画面の揺れの大きさ(px)
  shakePxReduced: 1.5,
  gravity: 3.2,           // かけらの落ちる加速度（半径/秒²）
  shards: 11,             // かけらの数
  powder: 36,             // 部品 1 つが外れたときの粉の数
  powderReduced: 10,
  failMs: 1300,           // 失敗：結果画面までの時間(ms)
  clearMs: 1000,          // 成功：結果画面までの時間(ms)
};

function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
}

// ---------- ヒビ（折れ線）----------
function crackWalk(r, x, y, a, segs, segLen, jitter) {
  const pts = [[x, y]];
  for (let i = 0; i < segs; i++) {
    a += (r() - 0.5) * jitter;
    const l = segLen * (0.7 + r() * 0.6);
    x += Math.cos(a) * l; y += Math.sin(a) * l;
    pts.push([x, y]);
  }
  return { pts, a };
}
function newCrackSet(seed) { return { rng: rnd((seed * 7 + 13) >>> 0), items: [], burst: [], next: FX.crackStep }; }
function spawnCrack(set, x, y, gauge) {
  const r = set.rng;
  const a0 = r() * 6.2832;
  const segLen = 0.05 + gauge * 0.11;
  const segs = 4 + Math.floor(r() * 3);
  const main = crackWalk(r, x, y, a0, segs, segLen, 1.0);
  const branches = [];
  const nb = (r() < 0.55 + gauge * 0.35 ? 1 : 0) + (gauge > 0.6 && r() < 0.5 ? 1 : 0);
  for (let b = 0; b < nb; b++) {
    const k = 1 + Math.floor(r() * (segs - 1)), p = main.pts[k];
    const side = r() < 0.5 ? -1 : 1;
    branches.push(crackWalk(r, p[0], p[1], a0 + side * (0.5 + r() * 0.6), 2 + Math.floor(r() * 2), segLen * 0.7, 1.0).pts);
  }
  set.items.push({ pts: main.pts, branches, g0: gauge });
}
// ゲージが増えた分だけヒビを足す。足した本数を返す
function crackUpdate(set, x, y, gauge) {
  let added = 0;
  while (gauge >= set.next && set.items.length < FX.crackMax) {
    spawnCrack(set, x, y, gauge); set.next += FX.crackStep; added++;
  }
  return added;
}
// そのヒビがどこまで伸びたか(0..1)。新しいヒビも最初から少し見え、ゲージが増えると伸びる
function crackGrow(it, gauge) { return clamp(0.3 + (gauge - it.g0) * 3.2, 0, 1); }
function polyLen2(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
function crackLength(set, gauge) {
  let s = 0;
  for (const it of set.items) {
    const g = crackGrow(it, gauge);
    s += polyLen2(it.pts) * g;
    for (const b of it.branches) s += polyLen2(b) * g;
  }
  return s;
}
// 失敗した瞬間、針の位置から割れ目が走る
function crackBurst(set, x, y, n) {
  const r = set.rng;
  n = n || 7;
  const base = r() * 6.2832;
  set.burst = [];
  for (let i = 0; i < n; i++) {
    const a = base + i * 6.2832 / n + (r() - 0.5) * 0.7;
    const m = crackWalk(r, x, y, a, 7, 0.17, 1.1);
    const k = 2 + Math.floor(r() * 3), p = m.pts[k];
    const br = crackWalk(r, p[0], p[1], a + (r() < 0.5 ? -1 : 1) * 0.8, 3, 0.12, 1.0);
    set.burst.push(m.pts, br.pts);
  }
  return set.burst;
}

// ---------- かけら（割れた菓子を放射状の多角形に分ける）----------
function makeShards(seed, cx, cy, n) {
  const r = rnd((seed * 31 + 5) >>> 0);
  n = n || FX.shards;
  const step = 6.2832 / n, base = r() * 6.2832;
  const rays = [];
  for (let i = 0; i < n; i++) {
    const a = base + i * step + (r() - 0.5) * step * 0.6;
    const ux = Math.cos(a), uy = Math.sin(a);
    const b = cx * ux + cy * uy, t = -b + Math.sqrt(Math.max(0, b * b + 1 - cx * cx - cy * cy));
    const nx = -uy, ny = ux;
    const j1 = (r() - 0.5) * 0.09, j2 = (r() - 0.5) * 0.09;
    rays.push({
      pts: [[cx + ux * t * 0.35 + nx * j1, cy + uy * t * 0.35 + ny * j1], [cx + ux * t * 0.7 + nx * j2, cy + uy * t * 0.7 + ny * j2], [cx + ux * t, cy + uy * t]],
    });
  }
  const shards = [];
  for (let i = 0; i < n; i++) {
    const A = rays[i].pts, B = rays[(i + 1) % n].pts;
    const poly = [[cx, cy], A[0], A[1], A[2]];
    const a0 = Math.atan2(A[2][1], A[2][0]);
    let a1 = Math.atan2(B[2][1], B[2][0]);
    if (a1 <= a0) a1 += 6.2832;
    for (let k = 1; k <= 3; k++) { const a = a0 + (a1 - a0) * k / 4; poly.push([Math.cos(a), Math.sin(a)]); }
    poly.push(B[2], B[1], B[0]);
    let mx = 0, my = 0;
    for (const p of poly) { mx += p[0]; my += p[1]; }
    mx /= poly.length; my /= poly.length;
    shards.push({
      poly, cx: mx, cy: my, area: polyArea(poly),
      vx: mx * 0.55 + (r() - 0.5) * 0.5, vy: -0.15 - r() * 0.55, w: (r() - 0.5) * 6,
    });
  }
  return shards;
}
function shardPos(s, t) { return { dx: s.vx * t, dy: s.vy * t + 0.5 * FX.gravity * t * t, rot: s.w * t }; }

// ---------- 粉 ----------
function spawnPowder(seed, src, n) {
  const r = rnd((seed * 17 + 3) >>> 0), out = [];
  if (!src || !src.length) return out;
  for (let i = 0; i < n; i++) {
    const p = src[Math.floor(r() * src.length)];
    out.push({ x: p[0], y: p[1], vx: (r() - 0.5) * 0.5, vy: -(0.12 + r() * 0.5), life: 0.6 + r() * 0.6, age: 0, size: 0.005 + r() * 0.011, c: r() < 0.5 ? 0 : 1 });
  }
  return out;
}
function stepPowder(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.7 * dt;
    if (p.age >= p.life) list.splice(i, 1);
  }
}

// ---------- 緊張感 ----------
// 心音の間隔(秒)。ヒビが少ないうちは null（鳴らさない）
function heartInterval(crack) {
  if (!(crack >= FX.heartFrom)) return null;
  const t = clamp((crack - FX.heartFrom) / (1 - FX.heartFrom), 0, 1);
  return FX.heartSlow + (FX.heartFast - FX.heartSlow) * t;
}
function vignetteAlpha(crack) {
  if (!(crack > FX.vigFrom)) return 0;
  return clamp((crack - FX.vigFrom) / (1 - FX.vigFrom), 0, 1) * FX.vigMax;
}
// 部品の浮き上がり具合 0..1（なめらかに減速）
function liftAmount(t) {
  if (!(t > 0)) return 0;
  if (t >= FX.liftSec) return 1;
  const u = 1 - t / FX.liftSec;
  return 1 - u * u * u;
}
// 失敗からの経過秒 el での画面の揺れの大きさ(px)
function shakeAmp(el, reduced) {
  if (!(el >= 0) || el >= FX.shakeSec) return 0;
  return (reduced ? FX.shakePxReduced : FX.shakePx) * (1 - el / FX.shakeSec);
}
function newFx(seed) {
  return { cracks: newCrackSet(seed), powder: [], partT: [], failT: -1, shards: null, snap: null, beatAt: 0, lastMove: 0 };
}
