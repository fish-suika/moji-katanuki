
// ===== ここから検証本体（ロジックと文字の形生成。DOM の画面には依存しない）=====
const P180 = judgeParams(180);
const LEVEL_NAME_V = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };
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

  // --- Phase 3: 記録の保存・更新（純ロジック）---
  (function () {
    const sc = (total, rank) => ({ total, rank });
    let r = emptyRecord();
    let o = recordAttempt(r, 'あ', true, sc(500, 'B'), 3, 1);
    T('記録: 初めて抜けたときは「ベスト更新」ではなく記録される', !o.newBest && o.entry.best === 500 && o.entry.rank === 'B' && o.entry.tries === 1 && o.entry.clears === 1 && o.rec.total === 1);
    T('記録: 元の記録オブジェクトは変えない', Object.keys(r.chars).length === 0 && r.total === 0);
    r = o.rec;
    o = recordAttempt(r, 'あ', true, sc(420, 'C'), 3, 2);
    T('記録: 低い点ではベストは変わらない', !o.newBest && o.entry.best === 500 && o.entry.rank === 'B' && o.entry.tries === 2);
    r = o.rec;
    o = recordAttempt(r, 'あ', true, sc(780, 'A'), 3, 3);
    T('記録: 高い点でベスト更新（点とランクが入れ替わる）', o.newBest && o.entry.best === 780 && o.entry.rank === 'A');
    r = o.rec;
    o = recordAttempt(r, 'あ', false, null, 3, 4);
    T('記録: 失敗は挑戦回数だけ増え、ベストは残る', !o.newBest && o.entry.tries === 4 && o.entry.clears === 3 && o.entry.best === 780 && o.rec.total === 4);
    r = o.rec;
    o = recordAttempt(r, 'い', false, null, 2, 5);
    T('記録: 一度も抜けていない文字は best が null', o.entry.best === null && o.entry.rank === null && o.rec.total === 5);
    r = o.rec;
    const list = recordList(r);
    T('記録: 一覧は最近挑戦した順', list.length === 2 && list[0].ch === 'い' && list[1].ch === 'あ');
    const mem = {};
    const st = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
    T('記録: 保存して読み戻せる', saveRecord(st, r) && JSON.stringify(loadRecord(st)) === JSON.stringify(sanitizeRecord(r)) && loadRecord(st).chars['あ'].best === 780);
    T('記録: リセットすると空に戻る', clearRecord(st) && loadRecord(st).total === 0 && Object.keys(loadRecord(st).chars).length === 0);
    mem[REC_KEY] = '{こわれた';
    T('記録: 壊れた保存値でも空の記録で動く', loadRecord(st).total === 0);
    mem[REC_KEY] = JSON.stringify({ total: -5, chars: { 'あ': { tries: 'x', best: 'y' }, 'ab': { tries: 3 }, 'い': { tries: 2, clears: 9, best: 300, rank: 'Z' } } });
    const sn = loadRecord(st);
    T('記録: 不正な値は捨てる（複数文字・不正ランク・clears が tries 超え）', sn.total === 0 && !sn.chars['ab'] && sn.chars['い'].best === null && sn.chars['い'].clears <= sn.chars['い'].tries);
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    T('記録: 保存できなくても落ちない', loadRecord(bad).total === 0 && saveRecord(bad, r) === false && clearRecord(bad) === false && loadRecord(null).total === 0 && saveRecord(null, r) === false);
    T('あそびかた既読: 保存して読み戻せる・保存できなくても落ちない', loadHowtoSeen(st) === false && saveHowtoSeen(st) === true && loadHowtoSeen(st) === true && loadHowtoSeen(bad) === false && saveHowtoSeen(bad) === false && loadHowtoSeen(null) === false);
    // --- 学びの反映: すぐ始める・一言ヒント・次のランクまで ---
    const pl0 = startPlan(emptyRecord(), false, null);
    T('開始: 初回（未読・記録なし）は固定で「口」・かんたん', pl0.first && pl0.ch === '口' && pl0.level === 'easy');
    const played = recordAttempt(emptyRecord(), 'あ', false, null, 3, 1).rec;
    const pl1 = startPlan(played, false, null);
    T('開始: 2 回目以降（記録あり）はランダム・未選択ならふつう', !pl1.first && pl1.ch === null && pl1.level === 'normal');
    T('開始: あそびかた既読ならランダム・直近の段階を使う', !startPlan(emptyRecord(), true, 'hard').first && startPlan(emptyRecord(), true, 'hard').level === 'hard' && startPlan(played, true, 'easy').level === 'easy');
    T('開始: 不正な段階は ふつう に戻す', startPlan(played, true, 'xyz').level === 'normal');
    T('開始: 「口」は型にできる かんたん帯に収まる', (() => { const s = makeShapeSync('口').shape; return s && s.stars >= CFG.bands.easy[0] && s.stars <= CFG.bands.easy[1]; })());
    T('直近の段階: 保存して読み戻せる・不正値と保存不可でも落ちない', saveLastLevel(st, 'hard') && loadLastLevel(st) === 'hard' && !saveLastLevel(st, 'zzz') && loadLastLevel(bad) === null && saveLastLevel(bad, 'easy') === false && loadLastLevel(null) === null);
    let hs = loadHintsSeen(st);
    T('ヒント: 最初は 4 種とも未読', ['pre', 'edge', 'fast', 'near'].every(k => hs[k] === false));
    const h1 = takeHint(hs, 'edge');
    T('ヒント: 未読なら文言が返り、既読になる（元は変えない）', h1 && h1.text.indexOf('ヒビ') >= 0 && h1.seen.edge === true && hs.edge === false);
    T('ヒント: 既読は 2 度と出ない・未知の種類は出ない', takeHint(h1.seen, 'edge') === null && takeHint(hs, 'zzz') === null && takeHint(h1.seen, 'pre') !== null);
    T('ヒント: 既読を保存して読み戻せる・保存できなくても落ちない', saveHintsSeen(st, h1.seen) && loadHintsSeen(st).edge === true && loadHintsSeen(st).pre === false && saveHintsSeen(bad, h1.seen) === false && loadHintsSeen(bad).edge === false && loadHintsSeen(null).near === false);
    mem[HINT_KEY] = '{こわれた';
    T('ヒント: 壊れた保存値でも全部未読で動く', loadHintsSeen(st).fast === false);
    T('ヒント: 4 文言とも「|」で文節に区切られている', Object.keys(HINT_TEXT).every(k => HINT_TEXT[k].indexOf('|') > 0));
    const g1 = nextRankGap(CFG.score.rank.A + 20, 1.0), g2 = nextRankGap(CFG.score.rank.B - 10, 0.6), g3 = nextRankGap(CFG.score.rank.S, 1.0), g4 = nextRankGap(100, 1.0);
    T('次のランク: A→S は閾値との差（倍率 1.0）', g1 && g1.next === 'S' && g1.gap === CFG.score.rank.S - (CFG.score.rank.A + 20));
    T('次のランク: 倍率ぶんだけ点を換算して切り上げ・最低 1', g2 && g2.next === 'B' && g2.gap === Math.ceil((CFG.score.rank.B - (CFG.score.rank.B - 10)) * 0.6) && nextRankGap(CFG.score.rank.S - 1, 0.6).gap >= 1);
    T('次のランク: S には出さない・C は B を目指す', g3 === null && g4.next === 'B');
    T('次のランク: 実際のスコア結果と一致（その点数を足せば次のランクに届く）', (() => { const sh = makeShapeSync('口').shape, d = simBot(sh, 0.8, 0.018, 5); if (!d.cleared) return true; const sc = scoreDig(d, sh), gp = nextRankGap(sc.base, sc.mult); return gp === null ? sc.rank === 'S' : sc.base + Math.ceil(gp.gap / sc.mult) >= CFG.score.rank[gp.next]; })());
    const rc = recordAttempt(recordAttempt(emptyRecord(), 'あ', true, { total: 500, rank: 'B' }, 3, 1).rec, 'い', true, { total: 400, rank: 'C' }, 2, 2).rec;
    T('成功数: ぜんぶの成功回数を数える', totalClears(rc) === 2 && totalClears(emptyRecord()) === 0 && totalClears(null) === 0);
    let big = emptyRecord();
    for (let i = 0; i < REC_MAX_CHARS + 20; i++) big = recordAttempt(big, String.fromCodePoint(0x4e00 + i), false, null, 1, i + 1).rec;
    T('記録: 文字数の上限を超えたら古いものから捨てる', Object.keys(big.chars).length === REC_MAX_CHARS && !big.chars[String.fromCodePoint(0x4e00)] && big.total === REC_MAX_CHARS + 20);
  })();

  // --- Phase 3: 候補文字の全数チェック（型にできる・理論上クリアできる・難しさ帯に収まる）---
  // 輪郭を少しずれながらたどるボット（人の手ぶれの代わり）
  function simBot(shape, speed, amp, seed, P) {
    const d = newDig(shape, P || judgeParams(170));
    let s = (seed >>> 0) || 1; const rn = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    let t = 0;
    for (const part of shape.parts) for (const l of part.loops) {
      if (d.failed || d.cleared) break;
      const n = l.n, sp = speed * d.P.speedLimit, dt = (l.len / n) / sp;
      const ph = [rn() * 6.28, rn() * 6.28, rn() * 6.28], fr = [3 + rn() * 3, 7 + rn() * 5, 13 + rn() * 6];
      const off = i => { const u = i / n * 6.2832; return amp * Math.SQRT2 * (Math.sin(fr[0] * u + ph[0]) * 0.6 + Math.sin(fr[1] * u + ph[1]) * 0.3 + Math.sin(fr[2] * u + ph[2]) * 0.15) / Math.sqrt(0.4725); };
      const at = i => { const k = i % n; const nm = normalAt(l, k, 0, 0); const o = off(k); return [l.pts[2 * k] + nm[0] * o, l.pts[2 * k + 1] + nm[1] * o]; };
      const st = at(0);
      if (!d.press(st[0], st[1]).ok) d.press(l.pts[0], l.pts[1]);
      for (let i = 1; i <= n + 4 && d.down; i++) { const p = at(i); d.move(p[0], p[1], dt); }
      d.release(); t += l.len / sp + 0.6;      // 針を離して置き直す時間のぶん
    }
    d.t = t;
    return d;
  }
  const allPool = [];
  for (const lv of ['easy', 'normal', 'hard']) for (const ch of CFG.pools[lv]) allPool.push([lv, ch]);
  await loadGlyphFonts(allPool.map(p => p[1]).join(''));
  (function () {
    for (const lv of ['easy', 'normal', 'hard']) {
      const dup = CFG.pools[lv].filter((c, i, a) => a.indexOf(c) !== i);
      T('候補（' + LEVEL_NAME_V[lv] + '）: 重複がない', dup.length === 0, dup.join(''));
    }
    const bad = { make: [], clear: [], band: [], noisy: [] };
    const dist = { easy: {}, normal: {}, hard: {} };
    for (const [lv, ch] of allPool) {
      const r = makeShapeSync(ch);
      if (!r.ok) { bad.make.push(lv + ':' + ch + '(' + r.kind + ')'); continue; }
      const sh = r.shape, band = CFG.bands[lv];
      dist[lv][sh.stars] = (dist[lv][sh.stars] || 0) + 1;
      if (sh.stars < band[0] || sh.stars > band[1]) bad.band.push(lv + ':' + ch + '★' + sh.stars);
      let ok = true;
      for (const R of [150, 340]) for (const sp of [0.3, 0.6]) {
        const d = newDig(sh, judgeParams(R)); traceAll(d, sh, sp);
        if (!d.cleared || d.failed) ok = false;
      }
      if (!ok) bad.clear.push(lv + ':' + ch);
      const nb = simBot(sh, 0.6, 0.012, ch.codePointAt(0));
      if (!nb.cleared) bad.noisy.push(lv + ':' + ch + '(' + nb.progress().toFixed(2) + ')');
    }
    const n = allPool.length;
    T('候補 ' + n + ' 字: すべて型にできる', bad.make.length === 0, bad.make.join(' '));
    T('候補 ' + n + ' 字: すべて輪郭をたどる針で理論上クリアできる（画面の大きさ 2 通り × 速さ 2 通り）', bad.clear.length === 0, bad.clear.join(' '));
    T('候補 ' + n + ' 字: すべて難しさ帯に収まる（かんたん★1-2・ふつう★2-3・むずかしい★4-5）', bad.band.length === 0, bad.band.join(' '));
    T('候補 ' + n + ' 字: 少しぶれる針（±0.012）でも全部クリアできる', bad.noisy.length === 0, bad.noisy.join(' '));
    INFO('候補の★の分布 ' + JSON.stringify(dist) + ' / 数 かんたん' + CFG.pools.easy.length + ' ふつう' + CFG.pools.normal.length + ' むずかしい' + CFG.pools.hard.length);
  })();

  // --- Phase 3: 目安時間・ランク閾値（針のボットで S/A/B/C が妥当に分かれるか）---
  (function () {
    const sample = ['一', '二', '口', 'あ', 'の', 'ね', 'か', 'す', 'み', '月', '森', '田', 'ア', 'ミ', 'ほ', '花', '魚', '雨', '桜', '歌', '鬼', '虎', '鈴', '結'];
    const run = (sp, am) => {
      const rk = { S: 0, A: 0, B: 0, C: 0, fail: 0 }; let n = 0;
      for (const ch of sample) for (let k = 0; k < 3; k++) {
        const sh = makeShapeSync(ch).shape; n++;
        const d = simBot(sh, sp, am, 900 + k * 77 + ch.codePointAt(0));
        if (!d.cleared) { rk.fail++; continue; }
        rk[scoreDig(d, sh).rank]++;
      }
      rk.n = n; return rk;
    };
    const care = run(0.35, 0.008), norm = run(0.7, 0.015), rough = run(0.7, 0.022), wild = run(1.0, 0.03);
    INFO('ボット: ていねい(0.35,0.008)=' + JSON.stringify(care) + ' ふつう(0.7,0.015)=' + JSON.stringify(norm) + ' ざつ(0.7,0.022)=' + JSON.stringify(rough) + ' あらい(1.0,0.03)=' + JSON.stringify(wild));
    T('ランク: ていねいに進めれば S（9 割以上）', care.S / care.n >= 0.9, JSON.stringify(care));
    T('ランク: ふつうの速さ・ふつうの精度では A が中心（S は 2 割以下）', norm.A / norm.n >= 0.6 && norm.S / norm.n <= 0.2, JSON.stringify(norm));
    T('ランク: 雑に進めると B が中心', rough.B / rough.n >= 0.5 && rough.S === 0, JSON.stringify(rough));
    T('ランク: 荒く進めると C か失敗（S・A は出ない）', wild.S === 0 && wild.A === 0 && (wild.C + wild.fail) / wild.n >= 0.5, JSON.stringify(wild));
    T('ランクの閾値は S > A > B', CFG.score.rank.S > CFG.score.rank.A && CFG.score.rank.A > CFG.score.rank.B && CFG.score.rank.B > 0);
    const sq2 = makeShapeSync('口').shape, slow = simBot(sq2, 0.05, 0.005, 3);
    T('速さ: 目安時間を大きく超えると速さの点が減る', slow.cleared && scoreDig(slow, sq2).ps < CFG.score.wSpeed && scoreDig(simBot(sq2, 0.5, 0.005, 3), sq2).ps === CFG.score.wSpeed, 'slow=' + scoreDig(slow, sq2).ps + ' t=' + slow.t.toFixed(1) + ' target=' + targetTime(sq2).toFixed(1));
  })();

  document.getElementById('sum').textContent = `${pass} PASS / ${fail} FAIL`;
  document.title = (fail ? 'FAIL ' : 'OK ') + pass + '/' + (pass + fail);
})();
