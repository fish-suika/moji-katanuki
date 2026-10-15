
// ===== 文字 → 型（キャンバスに描いて読み取る。verify.html でも使う）=====
const GLYPH = { cache: new Map(), refs: null, canvas: null };

function glyphFont() { return CFG.glyph.weight + ' ' + CFG.glyph.fontPx + 'px ' + CFG.glyph.families.join(','); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Web フォントを待つ（読めなくても先に進む）
async function loadGlyphFonts(text) {
  if (!(document.fonts && document.fonts.load)) return;
  const jobs = ['"M PLUS Rounded 1c"', '"Zen Maru Gothic"'].map(f =>
    Promise.race([document.fonts.load(CFG.glyph.weight + ' 100px ' + f, text).catch(() => []), sleep(CFG.glyph.fontTimeoutMs)]));
  try { await Promise.all(jobs); } catch (e) { /* 端末のフォントで続行 */ }
}

// 文字を描いて {mask(0..1), ink(画素数), colored(色つき=絵文字)} を返す
function rasterizeChar(ch, extraStroke) {
  const N = CFG.glyph.size;
  let cv = GLYPH.canvas;
  if (!cv) { cv = GLYPH.canvas = document.createElement('canvas'); cv.width = cv.height = N; }
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#fff'; c.fillRect(0, 0, N, N);
  c.fillStyle = '#000'; c.strokeStyle = '#000';
  c.font = glyphFont();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; const lw = CFG.glyph.stroke + (extraStroke || 0);
  c.lineWidth = lw;
  c.fillText(ch, N / 2, N / 2 + CFG.glyph.fontPx * 0.04);
  if (lw > 0) c.strokeText(ch, N / 2, N / 2 + CFG.glyph.fontPx * 0.04);
  const im = c.getImageData(0, 0, N, N).data;
  const mask = new Float32Array(N * N);
  let ink = 0, colored = 0;
  for (let i = 0; i < N * N; i++) {
    const r = im[4 * i], g = im[4 * i + 1], b = im[4 * i + 2];
    const v = 1 - (r + g + b) / 765;
    mask[i] = v;
    if (v > 0.5) ink++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colored++;
  }
  return { mask, ink, colored: colored > 30, W: N, H: N };
}

// 文字が「豆腐（フォントに無い）」かどうか: 存在しない文字の描画と同じなら未対応
function glyphMissing(r) {
  if (!GLYPH.refs) GLYPH.refs = ['\u{10FFFF}', '￿', '\u{F0001}'].map(rasterizeChar);
  for (const ref of GLYPH.refs) {
    if (ref.ink < 50) continue;
    let diff = 0, uni = 0;
    for (let i = 0; i < r.mask.length; i++) {
      const a = r.mask[i] > 0.5, b = ref.mask[i] > 0.5;
      if (a || b) { uni++; if (a !== b) diff++; }
    }
    if (uni > 0 && diff / uni < 0.02) return true;
  }
  return false;
}

// 1 文字 → { ok, shape } か { ok:false, kind:'unsupported'|'toohard', msg }
function makeShapeSync(ch) {
  if (GLYPH.cache.has(ch)) return GLYPH.cache.get(ch);
  let res;
  const bad = { ok: false, kind: 'unsupported', ch, msg: 'この文字は型にできません：「' + ch + '」' };
  if (EMOJI_RE.test(ch)) res = bad;
  else {
    const r = rasterizeChar(ch);
    if (r.ink < 80 || r.colored || glyphMissing(r)) res = bad;
    else {
      let shape = buildShape(r.mask, r.W, r.H);
      // 細い線の記号（♡☆ など）は、溝が重ならないよう太らせて作り直す
      if (shape.ok && shape.thickness < CFG.glyph.minThickness && shape.nLoops <= 4) {
        for (const extra of [10, 18, 26, 34]) {
          const r2 = rasterizeChar(ch, extra);
          const s2 = buildShape(r2.mask, r2.W, r2.H);
          if (!s2.ok) break;
          shape = s2;
          if (s2.thickness >= CFG.glyph.minThickness) break;
        }
      }
      if (!shape.ok || shape.nParts === 0) res = bad;
      else if (shape.tooHard) res = { ok: false, kind: 'toohard', ch, shape, msg: '難しすぎます：「' + ch + '」' };
      else res = { ok: true, ch, shape };
    }
  }
  GLYPH.cache.set(ch, res);
  return res;
}
async function makeShape(ch) {
  if (!GLYPH.cache.has(ch)) await loadGlyphFonts(ch);
  return makeShapeSync(ch);
}
