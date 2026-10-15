
// ===== ロジック（DOM に依存しない純関数。verify.html からも呼ぶ）=====
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- 入力の検査 ----------
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Emoji_Modifier}|[\u{1F1E6}-\u{1F1FF}]|‍|️|⃣/u;
function validateInput(str) {
  const chars = [];
  for (const c of Array.from(String(str == null ? '' : str))) {
    if (/\s/u.test(c) || c === '　' || c === '​' || c === '﻿') continue;   // 空白は無視
    chars.push(c);
  }
  if (!chars.length) return { ok: false, chars, msg: '文字を入力してください' };
  for (const c of chars) {
    if (EMOJI_RE.test(c)) return { ok: false, chars, bad: c, msg: 'この文字は型にできません：「' + c + '」' };
  }
  if (chars.length > CFG.maxChars) return { ok: false, chars, msg: '文字は' + CFG.maxChars + '文字までです' };
  return { ok: true, chars };
}

// ---------- 輪郭の取り出し（マーチングスクエア）----------
// f: 0..1 の濃さ（W*H）。しきい値 th の等値線を閉じた折れ線の配列として返す（座標は格子の添字）
function marchLoops(f, W, H, th) {
  const WH = W * H;
  const adj = new Map();
  const link = (a, b) => {
    let A = adj.get(a); if (!A) adj.set(a, A = []); A.push(b);
    let B = adj.get(b); if (!B) adj.set(b, B = []); B.push(a);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      const v0 = f[i], v1 = f[i + 1], v2 = f[i + W + 1], v3 = f[i + W];
      const c0 = v0 >= th, c1 = v1 >= th, c2 = v2 >= th, c3 = v3 >= th;
      if (c0 === c1 && c1 === c2 && c2 === c3) continue;
      const E = [];                      // 上, 右, 下, 左 の順に、交差する辺の id
      const eids = [i, WH + y * W + x + 1, (y + 1) * W + x, WH + y * W + x];
      const cr = [c0 !== c1, c1 !== c2, c3 !== c2, c0 !== c3];
      const cs = [c0, c1, c2, c3];
      let cnt = 0;
      for (let k = 0; k < 4; k++) if (cr[k]) { E.push(k); cnt++; }
      if (cnt === 2) link(eids[E[0]], eids[E[1]]);
      else if (cnt === 4) {
        const center = (v0 + v1 + v2 + v3) / 4 >= th;
        for (let k = 0; k < 4; k++) {
          // 角 k は 辺(k+3)%4 と 辺 k の間にある
          if (cs[k] !== center) link(eids[(k + 3) % 4], eids[k]);
        }
      }
    }
  }
  const ptOf = id => {
    if (id < WH) {
      const y = (id / W) | 0, x = id - y * W;
      const a = f[y * W + x], b = f[y * W + x + 1];
      const t = (th - a) / (b - a);
      return [x + t, y];
    }
    id -= WH;
    const y = (id / W) | 0, x = id - y * W;
    const a = f[y * W + x], b = f[(y + 1) * W + x];
    const t = (th - a) / (b - a);
    return [x, y + t];
  };
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push(ptOf(cur));
      const nb = adj.get(cur);
      let nxt = nb[0] !== prev ? nb[0] : nb[1];
      if (nb.length === 2 && nb[0] === prev && nb[1] === prev) nxt = undefined;
      prev = cur; cur = nxt;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

function resampleClosed(P, ds) {
  const n = P.length, cum = [0];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[n], m = Math.max(12, Math.round(L / ds)), out = [];
  let k = 0;
  for (let s = 0; s < m; s++) {
    const t = s * L / m;
    while (k < n - 1 && cum[k + 1] < t) k++;
    const seg = cum[k + 1] - cum[k], u = seg > 0 ? (t - cum[k]) / seg : 0;
    const a = P[k], b = P[(k + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}
function smoothClosed(P, passes) {
  let cur = P;
  for (let p = 0; p < passes; p++) {
    const n = cur.length, nx = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = cur[(i + n - 1) % n], b = cur[i], c = cur[(i + 1) % n];
      nx[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
    }
    cur = nx;
  }
  return cur;
}
function polyArea(P) {
  let s = 0; const n = P.length;
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}
function polyLen(P) {
  let s = 0; const n = P.length;
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return s;
}
function pointInPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// 白黒（0..1 の濃さ）の画像から、部品・輪郭を持つ「型」を作る
// 戻り値: { ok, parts:[{loops:[{pts:Float32Array,n,hole,len,area}]}], loops:[...], length, nParts, nHoles, ... }
function buildShape(mask, W, H, opt) {
  const S = Object.assign({}, CFG.shape, opt || {});
  const f = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    f[i] = (mask[i - W - 1] + mask[i - W] + mask[i - W + 1] + mask[i - 1] + mask[i] + mask[i + 1] + mask[i + W - 1] + mask[i + W] + mask[i + W + 1]) / 9;
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (mask[y * W + x] >= 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) return { ok: false, reason: 'empty' };
  const k = S.fit / Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const raw = marchLoops(f, W, H, 0.5);
  let loops = [];
  let droppedNoise = 0;
  for (const r of raw) {
    let P = r.map(p => [(p[0] - cx) * k, (p[1] - cy) * k]);
    P = resampleClosed(P, S.spacing);
    P = smoothClosed(P, S.smoothPasses);
    const area = polyArea(P);
    if (area < S.minArea) { droppedNoise++; continue; }
    loops.push({ P, area, len: polyLen(P) });
  }
  loops.sort((a, b) => b.area - a.area);
  // 入れ子の深さで 外周(偶数) と 穴(奇数) を分ける
  for (let i = 0; i < loops.length; i++) {
    const L = loops[i];
    L.parent = -1; L.depth = 0;
    for (let j = 0; j < i; j++) {
      if (pointInPoly(L.P[0][0], L.P[0][1], loops[j].P)) { L.depth++; L.parent = j; }   // 面積の降順なので最後に当たった j が最も内側
    }
    L.hole = (L.depth % 2) === 1;
  }
  const parts = [], flat = [];
  const partOf = new Map();
  for (let i = 0; i < loops.length; i++) {
    if (loops[i].hole) continue;
    partOf.set(i, parts.length);
    parts.push({ loops: [] });
  }
  for (let i = 0; i < loops.length; i++) {
    const L = loops[i];
    const pi = L.hole ? partOf.get(L.parent) : partOf.get(i);
    if (pi === undefined) continue;
    const n = L.P.length, pts = new Float32Array(n * 2);
    for (let q = 0; q < n; q++) { pts[2 * q] = L.P[q][0]; pts[2 * q + 1] = L.P[q][1]; }
    const lp = { pts, n, hole: L.hole, len: L.len, area: L.area, part: pi, id: flat.length };
    parts[pi].loops.push(lp);
    flat.push(lp);
  }
  // 外周を先頭に
  for (const p of parts) p.loops.sort((a, b) => (a.hole ? 1 : 0) - (b.hole ? 1 : 0));
  let length = 0, nHoles = 0;
  for (const l of flat) { length += l.len; if (l.hole) nHoles++; }
  let ink = 0;
  for (const p of parts) for (const l of p.loops) ink += l.hole ? -l.area : l.area;
  const thickness = length > 0 ? 2 * ink / length : 0;     // 線の太さの平均（面積 ≒ 太さ × 中心線の長さ、輪郭長 ≒ 中心線の2倍）
  const shape = { ok: true, parts, loops: flat, length, thickness, nParts: parts.length, nHoles, nLoops: flat.length, droppedNoise, spacing: S.spacing };
  rateShape(shape);
  return shape;
}

// 難しさ★1〜5 と「難しすぎる」の判定
function rateShape(shape) {
  const D = CFG.difficulty;
  const cell = D.tightDist;
  const grid = new Map();
  const key = (a, b) => (a + 4096) * 8192 + (b + 4096);
  const all = [];
  for (const l of shape.loops) {
    for (let i = 0; i < l.n; i++) {
      const x = l.pts[2 * i], y = l.pts[2 * i + 1];
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell), kk = key(gx, gy);
      let a = grid.get(kk); if (!a) grid.set(kk, a = []);
      const rec = { x, y, l, i };
      a.push(rec); all.push(rec);
    }
  }
  let tight = 0;
  const d2 = D.tightDist * D.tightDist;
  for (const p of all) {
    const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
    let hit = false;
    for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) {
      const a = grid.get(key(gx + dx, gy + dy));
      if (!a) continue;
      for (const q of a) {
        const ddx = q.x - p.x, ddy = q.y - p.y;
        if (ddx * ddx + ddy * ddy >= d2) continue;
        if (q.l !== p.l) { hit = true; break; }
        let sep = Math.abs(q.i - p.i); sep = Math.min(sep, p.l.n - sep);
        if (sep * (p.l.len / p.l.n) > D.tightArc) { hit = true; break; }
      }
    }
    if (hit) tight++;
  }
  shape.tight = all.length ? tight / all.length : 0;
  shape.difficultyScore = shape.length + 0.4 * Math.max(0, shape.nLoops - 1) + 8 * shape.tight;
  let stars = 5;
  for (let i = 0; i < D.starAt.length; i++) if (shape.difficultyScore < D.starAt[i]) { stars = i + 1; break; }
  shape.stars = stars;
  shape.tooHard = shape.difficultyScore > D.maxScore || shape.tight > D.maxTight;
  return shape;
}

// ---------- 判定の数値（画面の大きさで溝の幅を決める）----------
function judgeParams(R) {
  const k = Math.max(1, CFG.minSafePx / (CFG.safeHalf * (R || 180)));
  return {
    safe: CFG.safeHalf * k, edge: CFG.edgeHalf * k, cutR: CFG.cutR * k,
    step: CFG.stepLen, crackRate: CFG.crackRate, speedLimit: CFG.speedLimit,
    speedCrack: CFG.speedCrack, joinFrac: CFG.joinFrac, hintFrac: CFG.hintFrac,
  };
}

// ---------- 型抜きの進行（針の判定・切り抜き）----------
// 使い方: d.down(x,y) → {ok,msg} / d.move(x,y,dt) → イベント配列 / d.up()
function newDig(shape, P) {
  P = P || judgeParams(180);
  const loops = shape.loops;
  const cell = Math.max(P.edge, P.cutR);
  const grid = new Map();
  const key = (a, b) => (a + 4096) * 8192 + (b + 4096);
  const gx = [], gy = [], gl = [], gi = [];
  for (const l of loops) {
    for (let i = 0; i < l.n; i++) {
      const id = gx.length;
      const x = l.pts[2 * i], y = l.pts[2 * i + 1];
      gx.push(x); gy.push(y); gl.push(l.id); gi.push(i);
      const kk = key(Math.floor(x / cell), Math.floor(y / cell));
      let a = grid.get(kk); if (!a) grid.set(kk, a = []);
      a.push(id);
    }
  }
  const cut = loops.map(l => new Uint8Array(l.n));
  const cutCount = loops.map(() => 0);
  const joined = loops.map(() => false);
  const partDone = shape.parts.map(() => false);
  const d = {
    shape, P, cut, cutCount, joined, partDone,
    down: false, started: false, failed: false, failWhy: null, failPos: null, cleared: false,
    crack: 0, t: 0, accSum: 0, accN: 0, lx: 0, ly: 0, ema: 0, lastMsg: '',
    distance: 0,
  };
  const nearest = (x, y) => {
    const cxi = Math.floor(x / cell), cyi = Math.floor(y / cell);
    let best = -1, bd = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = grid.get(key(cxi + a, cyi + b));
      if (!arr) continue;
      for (const id of arr) {
        const dx = gx[id] - x, dy = gy[id] - y, dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = id; }
      }
    }
    return { id: best, d: best < 0 ? Infinity : Math.sqrt(bd) };
  };
  d.nearest = nearest;

  function cutAround(x, y, loopId, ev) {
    const cxi = Math.floor(x / cell), cyi = Math.floor(y / cell);
    const r2 = P.cutR * P.cutR;
    let changed = false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = grid.get(key(cxi + a, cyi + b));
      if (!arr) continue;
      for (const id of arr) {
        if (gl[id] !== loopId) continue;
        const i = gi[id];
        if (cut[loopId][i]) continue;
        const dx = gx[id] - x, dy = gy[id] - y;
        if (dx * dx + dy * dy <= r2) { cut[loopId][i] = 1; cutCount[loopId]++; changed = true; }
      }
    }
    if (changed && !joined[loopId] && cutCount[loopId] >= Math.ceil(P.joinFrac * loops[loopId].n)) {
      joined[loopId] = true;
      const pi = loops[loopId].part;
      if (!partDone[pi] && shape.parts[pi].loops.every(l => joined[l.id])) {
        partDone[pi] = true;
        ev.push({ type: 'part', index: pi });
        if (partDone.every(Boolean)) { d.cleared = true; d.down = false; ev.push({ type: 'clear' }); }
      }
    }
  }
  function fail(why, x, y, ev) {
    d.failed = true; d.failWhy = why; d.failPos = { x, y }; d.down = false;
    ev.push({ type: 'fail', why });
  }
  // 針を刺す（置き直し）。溝の上（フチまで）でだけ受け付ける
  d.down_ = null;
  d.press = function (x, y) {
    if (d.failed || d.cleared) return { ok: false, msg: '' };
    const n = nearest(x, y);
    if (n.d > P.edge) { d.lastMsg = 'ここには刺せない'; return { ok: false, msg: 'ここには刺せない' }; }
    d.down = true; d.started = true; d.lx = x; d.ly = y; d.ema = 0;
    const ev = [];
    cutAround(x, y, gl[n.id], ev);
    return { ok: true, msg: '', events: ev };
  };
  d.release = function () { d.down = false; };
  // 針を動かす。前回位置から今回位置までを細かく区切って全部判定する
  d.move = function (x, y, dt) {
    const ev = [];
    if (!d.down || d.failed || d.cleared) return ev;
    const dx = x - d.lx, dy = y - d.ly, len = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(len / P.step));
    const sl = len / n;
    if (dt > 0 && len > 0) {
      const sp = len / dt;
      d.ema = d.ema === 0 ? sp : d.ema * 0.6 + sp * 0.4;
    }
    d.distance += len;
    for (let i = 1; i <= n; i++) {
      const sx = d.lx + dx * i / n, sy = d.ly + dy * i / n;
      const r = nearest(sx, sy);
      if (r.d > P.edge) { fail('out', sx, sy, ev); return ev; }          // 溝の外: その瞬間に割れる
      if (r.d > P.safe) {                                                 // フチ: ヒビが増える
        const tt = (r.d - P.safe) / (P.edge - P.safe);
        d.crack += sl * P.crackRate * (0.35 + 0.65 * tt);
      }
      d.accSum += r.d; d.accN++;
      if (d.crack >= 1) { d.crack = 1; fail('crack', sx, sy, ev); return ev; }
      cutAround(sx, sy, gl[r.id], ev);
      if (d.cleared) break;
    }
    if (!d.failed && dt > 0 && d.ema > P.speedLimit) {                    // 速すぎ: ヒビ
      d.crack += (d.ema / P.speedLimit - 1) * dt * P.speedCrack;
      if (d.crack >= 1) { d.crack = 1; fail('crack', x, y, ev); return ev; }
    }
    d.lx = x; d.ly = y;
    return ev;
  };
  // 切り残しの場所（残りわずかなときだけ）
  d.hints = function () {
    let total = 0, rest = 0;
    for (const l of loops) { total += l.n; if (!joined[l.id]) rest += l.n - cutCount[l.id]; }
    if (!total || rest === 0 || rest / total > P.hintFrac) return [];
    const out = [];
    for (const l of loops) {
      if (joined[l.id]) continue;
      for (let i = 0; i < l.n; i += 1) if (!cut[l.id][i]) out.push([l.pts[2 * i], l.pts[2 * i + 1]]);
    }
    return out;
  };
  d.progress = function () {
    let total = 0, c = 0;
    for (const l of loops) { total += l.n; c += cutCount[l.id]; }
    return total ? c / total : 0;
  };
  return d;
}

// ---------- スコア ----------
function targetTime(shape) { return CFG.score.targetBase + shape.length * CFG.score.targetPerLen; }
function scoreDig(dig, shape, P) {
  P = P || dig.P;
  const S = CFG.score;
  const meanD = dig.accN ? dig.accSum / dig.accN : P.edge;
  const acc = clamp(1 - meanD / P.edge, 0, 1);
  const crk = clamp(1 - dig.crack, 0, 1);
  const tg = targetTime(shape);
  const spd = dig.t <= tg ? 1 : clamp(1 - (dig.t - tg) / (tg * 2), 0, 1);
  const pa = Math.round(S.wAccuracy * acc), pc = Math.round(S.wCrack * crk), ps = Math.round(S.wSpeed * spd);
  const base = pa + pc + ps;
  const mult = S.mult[clamp(shape.stars, 1, 5) - 1];
  const total = Math.round(base * mult);
  const rank = base >= S.rank.S ? 'S' : base >= S.rank.A ? 'A' : base >= S.rank.B ? 'B' : 'C';
  return { acc, crk, spd, pa, pc, ps, base, mult, total, rank, time: dig.t, target: tg, meanD };
}
