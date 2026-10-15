
// ===== ここから検証本体（ロジックと文字の形生成。DOM の画面には依存しない）=====
const P180 = judgeParams(180);
function normalAt(loop, i, cx, cy) {
  const n = loop.n, a = (i + n - 1) % n, b = (i + 1) % n;
  let tx = loop.pts[2 * b] - loop.pts[2 * a], ty = loop.pts[2 * b + 1] - loop.pts[2 * a + 1];
  const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
  let nx = ty, ny = -tx;
  const px = loop.pts[2 * i] - cx, py = loop.pts[2 * i + 1] - cy;
  if (nx * px + ny * py < 0) { nx = -nx; ny = -ny; }       // 外向き
  return [nx, ny];
}
// 輪郭を針でたどる（speed は速度上限に対する割合）
function traceLoop(dig, loop, speed) {
  const sp = (speed || 0.5) * dig.P.speedLimit;
  const step = loop.len / loop.n;
  const dt = step / sp;
  const n = loop.n;
  const at = i => [loop.pts[2 * (i % n)], loop.pts[2 * (i % n) + 1]];
  const r = dig.press(...at(0));
  if (!r.ok) return false;
  for (let i = 1; i <= n + 4 && dig.down; i++) { const p = at(i); dig.move(p[0], p[1], dt); }
  dig.release();
  return true;
}
function traceAll(dig, shape, speed) {
  for (const part of shape.parts) for (const l of part.loops) { if (dig.failed || dig.cleared) break; traceLoop(dig, l, speed); }
}
const offPoint = (shape) => { // 溝から十分遠い点（砂糖菓子の隅）
  const c = [[0.9, 0.9], [-0.9, 0.9], [0.95, 0], [0, 0.95]];
  const d0 = newDig(shape, P180);
  for (const p of c) if (d0.nearest(p[0], p[1]).d > P180.edge * 1.5) return p;
  return [0.99, 0.0];
};

(async function () {
  await loadGlyphFonts('口あ日川いO鬱龘一L');
  const used = (() => { const c = document.createElement('canvas').getContext('2d'); c.font = glyphFont(); return c.font; })();
  INFO('描画フォント指定: ' + used + ' / M PLUS Rounded 1c 読込=' + (document.fonts && document.fonts.check('900 20px "M PLUS Rounded 1c"')));

  // --- 形生成 ---
  const expect = { '口': [1, 1], 'あ': [1, 1], '日': [1, 2], '川': [3, 0], 'い': [2, 0], 'O': [1, 1] };
  for (const ch of Object.keys(expect)) {
    const r = makeShapeSync(ch);
    const s = r.shape;
    const holesOk = ch === 'あ' ? (s && s.nHoles >= 1 && s.nHoles <= 2) : (s && s.nHoles === expect[ch][1]);   // あ は太い書体だと小さな閉じた隙間が 2 つできる
    const ok = r.ok && s.nParts === expect[ch][0] && holesOk;
    T('「' + ch + '」は部品 ' + expect[ch][0] + '・穴 ' + (ch === 'あ' ? '1〜2' : expect[ch][1]), ok,
      s ? '部品=' + s.nParts + ' 穴=' + s.nHoles + ' 捨てたノイズ=' + s.droppedNoise : r.msg);
  }
  // 合成マスク（フォントに依らない）
  (function () {
    const W = 120, H = 120, m = new Float32Array(W * H);
    for (let y = 20; y < 100; y++) for (let x = 20; x < 100; x++) {
      const cheb = Math.max(Math.abs(x - 60), Math.abs(y - 60));
      if ((cheb < 40 && cheb >= 22) || cheb < 8) m[y * W + x] = 1;      // 輪 + 穴の中の島
    }
    const s = buildShape(m, W, H);
    T('合成: 「回」形（輪＋中の島）は部品 2・穴 1', s.ok && s.nParts === 2 && s.nHoles === 1, s.ok ? s.nParts + '/' + s.nHoles : s.reason);
    const s3 = buildShape(new Float32Array(W * H), W, H);
    T('合成: 空の画像は ok:false', s3.ok === false);
  })();

  // --- 難しさの目安（情報）---
  for (const ch of ['一', 'L', '口', 'O', '日', '川', 'い', 'あ', 'ね', '木', '花', '魚', '龍', '麟', '鬱', '龘', '驫', '纛', '響', '護']) {
    const r = makeShapeSync(ch);
    const s = r.shape;
    if (s) INFO('「' + ch + '」★' + s.stars + ' 点=' + s.difficultyScore.toFixed(1) + ' 長さ=' + s.length.toFixed(2) + ' 狭=' + s.tight.toFixed(2) + ' 太さ=' + s.thickness.toFixed(2) + ' 部品=' + s.nParts + ' 穴=' + s.nHoles + (r.ok ? '' : ' → ' + r.kind));
    else INFO('「' + ch + '」→ ' + r.kind);
  }

  // --- 針の判定 ---
  const sq = makeShapeSync('口').shape;
  (function () {
    const d = newDig(sq, P180);
    traceAll(d, sq, 0.5);
    T('輪郭をたどる針で全部品が外れて成功（口）', d.cleared && !d.failed && d.partDone.every(Boolean), 'cleared=' + d.cleared + ' failed=' + d.failWhy + ' crack=' + d.crack.toFixed(2) + ' progress=' + d.progress().toFixed(3));
    T('正しくたどればヒビはほぼ 0', d.crack < 0.05, d.crack.toFixed(3));
    d.t = targetTime(sq) * 0.8;
    const sc = scoreDig(d, sq);
    T('スコアは 0〜1000 でランクが付く', sc.total >= 0 && sc.total <= 1000 && 'SABC'.includes(sc.rank), JSON.stringify(sc));
    INFO('口をていねいに: ' + sc.total + '点 ' + sc.rank + ' ていねい' + sc.pa + ' ヒビ' + sc.pc + ' 速さ' + sc.ps + ' 倍率' + sc.mult + ' 目安' + sc.target.toFixed(1) + 's');
  })();
  for (const ch of ['あ', '日', '川', 'い', 'O']) {
    const s = makeShapeSync(ch).shape;
    const d = newDig(s, P180);
    traceAll(d, s, 0.5);
    T('輪郭をたどる針で成功（' + ch + '）', d.cleared && !d.failed, 'failed=' + d.failWhy + ' crack=' + d.crack.toFixed(2) + ' progress=' + d.progress().toFixed(3) + ' parts=' + d.partDone.join());
  }
  (function () {
    const s = makeShapeSync('い').shape;
    const d = newDig(s, P180);
    for (const l of s.parts[0].loops) traceLoop(d, l, 0.5);
    T('部品は 1 つずつ外れる（い: 1 つ目だけ外れて未クリア）', d.partDone[0] === true && d.partDone[1] === false && !d.cleared);
  })();
  (function () {
    const d = newDig(sq, P180);
    const l = sq.loops[0];
    const r = d.press(l.pts[0], l.pts[1]);
    const off = offPoint(sq);
    const ev = d.move(off[0], off[1], 0.05);
    T('溝の外に出た瞬間に割れて失敗', r.ok && d.failed && d.failWhy === 'out' && ev.some(e => e.type === 'fail'), 'failed=' + d.failed + ' why=' + d.failWhy);
  })();
  (function () {
    // フチ（safe〜edge の中間）を進むとヒビが少しずつ増える
    const d = newDig(sq, P180);
    const l = sq.loops[0], n = l.n, off = (P180.safe + P180.edge) / 2;
    const pos = i => { const nm = normalAt(l, i % n, 0, 0); return [l.pts[2 * (i % n)] + nm[0] * off, l.pts[2 * (i % n) + 1] + nm[1] * off]; };
    d.press(l.pts[0], l.pts[1]);
    const dt = (l.len / n) / (P180.speedLimit * 0.4);
    let a = pos(0); d.move(a[0], a[1], dt);
    for (let i = 1; i <= 12; i++) { a = pos(i); d.move(a[0], a[1], dt); }
    const c1 = d.crack;
    T('フチを少し進むとヒビが少し増え、まだ割れない', c1 > 0 && c1 < 0.6 && !d.failed, 'crack=' + c1.toFixed(3) + ' failed=' + d.failed);
    for (let i = 13; i < 13 + 400 && !d.failed; i++) { a = pos(i); d.move(a[0], a[1], dt); }
    T('フチを進み続けるとヒビが満タンで割れる', d.failed && d.failWhy === 'crack', 'failed=' + d.failed + ' why=' + d.failWhy + ' crack=' + d.crack.toFixed(2));
  })();
  (function () {
    // 速すぎ
    const d = newDig(sq, P180);
    const l = sq.loops[0], n = l.n;
    d.press(l.pts[0], l.pts[1]);
    let moved = 0, c10 = null;
    for (let i = 5; i < n * 3 && !d.failed; i += 5) {
      d.move(l.pts[2 * (i % n)], l.pts[2 * (i % n) + 1], 0.004); moved++;
      if (moved === 10) c10 = d.crack;
    }
    T('速く動かしすぎるとヒビが入る', c10 > 0, 'crack@10=' + c10);
    T('速いまま動かし続けると割れる（溝の中でも）', d.failed && d.failWhy === 'crack', 'failed=' + d.failed + ' why=' + d.failWhy);
    const d2 = newDig(sq, P180);
    d2.press(l.pts[0], l.pts[1]);
    for (let i = 1; i <= 30; i++) d2.move(l.pts[2 * i], l.pts[2 * i + 1], (l.len / n) / (P180.speedLimit * 0.5));
    T('適度な速さならヒビは入らない', d2.crack === 0, 'crack=' + d2.crack);
  })();
  (function () {
    const d = newDig(sq, P180);
    const off = offPoint(sq);
    const r = d.press(off[0], off[1]);
    T('置き直しが溝の外だと刺さらず、割れない', !r.ok && !d.failed && r.msg === 'ここには刺せない' && !d.down, JSON.stringify(r));
    const l = sq.loops[0];
    const r2 = d.press(l.pts[0], l.pts[1]);
    T('置き直しが溝の上なら刺さる', r2.ok && d.down);
    d.release();
    d.press(l.pts[40], l.pts[41]);
    T('針を離して別の溝の上に置き直せる', d.down && !d.failed);
  })();
  (function () {
    // 切り抜き: 98% 未満では外れない
    const d = newDig(sq, P180);
    const l = sq.loops[0];
    d.press(l.pts[0], l.pts[1]);
    const stop = Math.floor(l.n * 0.9), dt = (l.len / l.n) / (P180.speedLimit * 0.5);
    for (let i = 1; i <= stop; i++) d.move(l.pts[2 * i], l.pts[2 * i + 1], dt);
    T('輪郭の 9 割では部品は外れない', !d.partDone[0]);
    for (const q of sq.loops.slice(1)) traceLoop(d, q, 0.5);
    T('外周が 9 割・穴が全部のとき、切り残しを光らせる', !d.partDone[0] && d.hints().length > 0, 'hints=' + d.hints().length + ' progress=' + d.progress().toFixed(2));
  })();

  // --- 入力の制約 ---
  (function () {
    const ok = validateInput('あ い　う');
    T('空白は無視される（全角・半角）', ok.ok && ok.chars.join('') === 'あいう', JSON.stringify(ok));
    T('空白だけは入力なし', validateInput('  　 ').ok === false);
    T('絵文字は「この文字は型にできません」', (() => { const r = validateInput('あ😀'); return !r.ok && /型にできません/.test(r.msg); })());
    T('7 文字は多すぎる、6 文字はよい', validateInput('1234567').ok === false && validateInput('123456').ok === true);
    T('絵文字は形生成でも未対応', makeShapeSync('🦄').ok === false && makeShapeSync('🦄').kind === 'unsupported');
    T('フォントに無い文字は未対応（豆腐を型にしない）', makeShapeSync('\u{10FFFD}').ok === false);
    T('！？♡☆ は使える', ['！', '？', '♡', '☆'].every(c => validateInput(c).ok && makeShapeSync(c).ok), ['！', '？', '♡', '☆'].map(c => c + ':' + makeShapeSync(c).ok).join(' '));
    T('英数字・かな・漢字は使える', ['A', '7', 'あ', 'ア', '字'].every(c => makeShapeSync(c).ok));
  })();
  (function () {
    const a = makeShapeSync('鬱'), b = makeShapeSync('龘');
    T('極端に複雑な文字（鬱・龘）は「難しすぎます」で止まらず断る', !a.ok && a.kind === 'toohard' && !b.ok && b.kind === 'toohard' && /難しすぎます/.test(a.msg), '鬱=' + (a.shape ? a.shape.difficultyScore.toFixed(1) : a.kind) + ' 龘=' + (b.shape ? b.shape.difficultyScore.toFixed(1) : b.kind));
    const easy = ['一', '口', 'L', 'O', 'あ', 'ア', '木', '日'].map(c => makeShapeSync(c));
    T('ふつうの文字は断られない', easy.every(r => r.ok), easy.map(r => r.ch + ':' + r.ok).join(' '));
  })();

  // --- Phase 2: 演出の純ロジック ---
  (function () {
    const a = newCrackSet(42);
    T('ヒビ: ゲージが閾値未満なら増えない', crackUpdate(a, 0, 0, 0.05) === 0 && a.items.length === 0);
    crackUpdate(a, 0.1, 0.1, 0.4);
    const n4 = a.items.length, L4 = crackLength(a, 0.4);
    crackUpdate(a, 0.2, 0.2, 0.9);
    const n9 = a.items.length, L9 = crackLength(a, 0.9);
    T('ヒビ: ゲージが増えると本数と長さが増える', n4 > 0 && n9 > n4 && L9 > L4 * 1.5, 'n:' + n4 + '→' + n9 + ' len:' + L4.toFixed(2) + '→' + L9.toFixed(2));
    const b = newCrackSet(42); crackUpdate(b, 0.1, 0.1, 0.4); crackUpdate(b, 0.2, 0.2, 0.9);
    T('ヒビ: 同じ seed なら同じ形（再現できる）', JSON.stringify(a.items) === JSON.stringify(b.items));
    const c = newCrackSet(7); for (let g = 0; g <= 1.0001; g += 0.01) crackUpdate(c, 0, 0, Math.min(1, g));
    T('ヒビ: 本数に上限がある', c.items.length <= FX.crackMax && c.items.length >= 8, 'n=' + c.items.length);
    T('ヒビ: 針の位置から始まる', a.items[0].pts[0][0] === 0.1 && a.items[0].pts[0][1] === 0.1);
    const bs = crackBurst(newCrackSet(3), 0.2, -0.1, 7);
    T('割れ目: 針の位置から複数本が走る', bs.length >= 14 && bs.every(p => p.length >= 3));
  })();
  (function () {
    const sh = makeShards(5, 0.2, -0.3, FX.shards);
    const total = sh.reduce((s, q) => s + q.area, 0);
    T('かけら: 個数と、合計面積が菓子の面積にほぼ等しい', sh.length === FX.shards && total > 0.9 * Math.PI && total < 1.0001 * Math.PI, 'n=' + sh.length + ' area=' + total.toFixed(3) + ' π=' + Math.PI.toFixed(3));
    T('かけら: すべて菓子の円の内側', sh.every(q => q.poly.every(p => Math.hypot(p[0], p[1]) <= 1.0001)));
    const p0 = shardPos(sh[0], 0), p1 = shardPos(sh[0], 1);
    T('かけら: 時間とともに落ちる', p0.dy === 0 && p1.dy > 1, 'dy@1s=' + p1.dy.toFixed(2));
    const pw = spawnPowder(1, [[0, 0], [0.1, 0]], 20);
    T('粉: 指定数が出て、寿命で消える', pw.length === 20 && (stepPowder(pw, 0.3), pw.length === 20) && (stepPowder(pw, 5), pw.length === 0));
    T('粉: 元の点が無ければ出ない', spawnPowder(1, [], 10).length === 0);
  })();
  (function () {
    T('心音: ヒビが少ないうちは鳴らない', heartInterval(0) === null && heartInterval(0.29) === null);
    const h = [0.3, 0.5, 0.7, 0.9, 1].map(heartInterval);
    T('心音: ヒビが多いほど間隔が短い', h.every((v, i) => v !== null && (i === 0 || v < h[i - 1])) && Math.abs(h[4] - FX.heartFast) < 1e-9, h.map(v => v.toFixed(2)).join(','));
    T('ビネット: 低いヒビでは出ず、増えるほど濃い（最大値まで）', vignetteAlpha(0.2) === 0 && vignetteAlpha(0.6) > 0 && vignetteAlpha(0.9) > vignetteAlpha(0.6) && Math.abs(vignetteAlpha(1) - FX.vigMax) < 1e-9);
    T('浮き上がり: 0 から 1 へなめらかに増える', liftAmount(-1) === 0 && liftAmount(0.1) > 0 && liftAmount(0.2) > liftAmount(0.1) && liftAmount(FX.liftSec) === 1 && liftAmount(5) === 1);
    T('画面の揺れ: 失敗直後だけ。reduced-motion では小さい', shakeAmp(-1, false) === 0 && shakeAmp(0, false) === FX.shakePx && shakeAmp(0, true) < shakeAmp(0, false) && shakeAmp(FX.shakeSec + 0.1, false) === 0);
  })();
  (function () {
    const mem = {};
    const st = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
    saveMuted(st, true);
    T('ミュート: 保存して読み戻せる', loadMuted(st) === true && (saveMuted(st, false), loadMuted(st) === false));
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    T('ミュート: 保存できなくても落ちない（false を返す）', loadMuted(bad) === false && saveMuted(bad, true) === false && loadMuted(null) === false && saveMuted(null, true) === false);
    T('SFX: 音声を開始する前に呼んでも落ちない', (() => { try { SFX.crack(); SFX.part(); SFX.rank('S'); SFX.heart(0.5); SFX.scrapeSet(1, false); SFX.scrapeStop(); return SFX.on() === false; } catch (e) { return false; } })());
  })();

  document.getElementById('sum').textContent = `${pass} PASS / ${fail} FAIL`;
  document.title = (fail ? 'FAIL ' : 'OK ') + pass + '/' + (pass + fail);
})();
