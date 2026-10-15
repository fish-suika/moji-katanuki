
// ===== 画面・操作・進行 =====
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 文節ごとに inline-block の span で包む（'|' が文節の区切り）。言葉の途中では改行されない
function wrapPhrases(text) {
  return String(text).split('|').map(s => '<span class="ph">' + esc(s) + '</span>').join('');
}
function setPh(el, text) { el.innerHTML = wrapPhrases(text); }

const SCREENS = ['scTitle', 'scHow', 'scSelect', 'scRec', 'scGame', 'scResult'];
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('on', s === id);
  G.screen = id;
  if (id === 'scTitle') requestAnimationFrame(drawTitleDeco);
}

// ---------- 記録・既読（保存できなくても動く）----------
G.store = getStorage();
G.rec = loadRecord(G.store);
G.howSeen = loadHowtoSeen(G.store);
G.hints = loadHintsSeen(G.store);
G.lastLevel = loadLastLevel(G.store);
G.hc = 0;
G.attempt = 0;

// ---------- タイトルの飾り（砂糖菓子の質感を流用。軽く）----------
let titleDeco = null;
function drawTitleDeco() {
  const c = $('tCv'), box = $('scTitle');
  const w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const key = w + 'x' + h + '@' + dpr;
  if (!titleDeco || titleDeco.key !== key) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const s = Math.min(w, h), x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    const specs = [[0.13, 0.12, 0.17, 0, 0.35, '文'], [0.9, 0.2, 0.12, 1, -0.4, '字'], [0.1, 0.86, 0.13, 2, 0.5, '型'], [0.88, 0.88, 0.18, 4, -0.25, '抜']];
    for (const [fx, fy, fr, ci, rot, ch] of specs) {
      const R = Math.max(26, s * fr), px = w * fx, py = h * fy;
      const tex = bakeCandy(CANDY[ci], 11 + ci * 17, R, dpr);
      x.save();
      x.translate(px, py); x.rotate(rot);
      x.globalAlpha = 0.9;
      x.fillStyle = 'rgba(90,40,60,.12)';
      x.beginPath(); x.ellipse(R * 0.04, R * 0.1, R, R * 0.97, 0, 0, 6.2832); x.fill();
      x.drawImage(tex, -TEX_SPAN * R, -TEX_SPAN * R, TEX_SPAN * R * 2, TEX_SPAN * R * 2);
      x.font = '900 ' + Math.round(R * 1.05) + 'px ' + CFG.glyph.families.join(',');
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      x.rotate(-rot * 0.4);
      x.lineWidth = Math.max(2, R * 0.06);
      x.strokeStyle = CANDY[ci].groove; x.fillStyle = 'rgba(' + CANDY[ci].tint + ',.14)';
      x.fillText(ch, 0, R * 0.04); x.strokeText(ch, 0, R * 0.04);
      x.restore();
    }
    titleDeco = { key };
  }
}
window.addEventListener('resize', () => { if (G.screen === 'scTitle') drawTitleDeco(); });

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
  if (!r) { show('scSelect'); setPh($('selMsg'), '文字を作れませんでした'); return; }
  G.lastLevel = level; saveLastLevel(G.store, level);
  G.session = { mode: 'random', level, chars: [r.ch], idx: 0, results: [], first: r };
  launch(r);
}
// 「あそぶ」: 文字選択を挟まず、すぐ 1 枚目を始める
async function quickStart() {
  const plan = startPlan(G.rec, G.howSeen, G.lastLevel);
  if (plan.first) {
    const r = await makeShape(plan.ch);
    if (r.ok) {
      G.session = { mode: 'random', level: plan.level, chars: [r.ch], idx: 0, results: [], first: r };
      launch(r);
      return;
    }
  }
  startRandom(plan.level);
}
function launch(r) { beginChar(r); }
function showHow() {
  show('scHow');
  $('scHow').scrollTop = 0;
  if (!G.howSeen) { G.howSeen = true; saveHowtoSeen(G.store); }
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
  launch(shapes[0]);
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
  G.attempt++;
  $('quitBox').classList.remove('ask');
  G.paths = buildPaths(G.shape);
  G.fx = newFx(G.seed);
  G.tex = bakeCandy(G.color, G.seed, G.view.R, G.view.dpr);
  SFX.scrapeStop();
  const total = S.chars.length;
  setPh($('hCh'), (total > 1 ? (S.idx + 1) + '/' + total + '|' : '') + '「' + G.char + '」');
  $('hStars').textContent = stars(G.shape.stars);
  $('hTime').textContent = '0.0 秒';
  $('gauge').firstElementChild.style.width = '0%';
  G.hc = 0;
  hideHint();
  updateGoal();
  if (!giveHint('pre')) toast('輪郭の溝に|針を刺して|なぞろう', false, 2200);
}

// ---------- 目標表示・一言ヒント ----------
function updateGoal() {
  const d = G.dig; if (!d) return;
  const total = d.partDone.length, left = d.partDone.filter(x => !x).length;
  $('hLeft').textContent = 'のこり ' + left + '/' + total;
}
let hintTimer = 0;
function hideHint() { G.hintKind = null; clearTimeout(hintTimer); $('hint').classList.remove('on'); }
function giveHint(kind) {
  const r = takeHint(G.hints, kind);
  if (!r) return false;
  G.hints = r.seen; saveHintsSeen(G.store, G.hints);
  setPh($('hint'), r.text);
  $('hint').classList.add('on');
  G.hintKind = kind;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, kind === 'pre' ? 15000 : 2800);
  return true;
}
function checkHints() {
  const d = G.dig;
  if (!d || G.over || d.failed || d.cleared) return;
  const grew = d.crack > G.hc + 1e-6; G.hc = d.crack;
  const H = G.hints;
  if (!H.fast && grew && d.ema > d.P.speedLimit) giveHint('fast');
  else if (!H.edge && d.down && d.nearest(G.needle.x, G.needle.y).d > d.P.safe) giveHint('edge');
  else if (!H.near && d.started && d.hints().length) giveHint('near');
}

function handleEvents(evs) {
  if (!evs) return;
  for (const e of evs) {
    if (e.type === 'part') {
      toast(G.shape.nParts > 1 ? '部品が外れた！' : '外れた！', false, 900);
      G.fx.partT[e.index] = G.anim;
      updateGoal();
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
      $('quitBox').classList.remove('ask');
      const tok = G.attempt;
      setTimeout(() => { if (G.attempt === tok && G.screen === 'scGame') showResult(true); }, FX.clearMs);
    } else if (e.type === 'fail' && !G.over) {
      G.over = true;
      const fp = G.dig.failPos || { x: G.needle.x, y: G.needle.y };
      G.fx.failT = G.anim;
      crackBurst(G.fx.cracks, fp.x, fp.y, 7);
      SFX.shatter();
      toast(e.why === 'out' ? '割れた！|溝の外に出た' : '割れた！|ヒビが満タン', true, 1500);
      $('quitBox').classList.remove('ask');
      const tok = G.attempt;
      setTimeout(() => { if (G.attempt === tok && G.screen === 'scGame') showResult(false); }, FX.failMs);
    }
  }
}

function showResult(ok) {
  const S = G.session, dig = G.dig;
  const last = S.idx >= S.chars.length - 1;
  let sc = null;
  if (ok) sc = scoreDig(dig, G.shape, G.P);
  S.results[S.idx] = { ch: G.char, ok, sc, stars: G.shape.stars };
  // 記録（保存できなくても、このセッションの間は覚えている）
  const rr = recordAttempt(G.rec, G.char, ok, sc, G.shape.stars, Date.now());
  G.rec = rr.rec;
  saveRecord(G.store, G.rec);
  show('scResult');
  const bestEl = $('rBest');
  bestEl.className = 'msg';
  if (rr.newBest) { setPh(bestEl, 'ベスト更新！'); bestEl.classList.add('new'); }
  else if (rr.entry.best !== null) setPh(bestEl, 'この文字のベスト：|' + rr.entry.rank + '　' + rr.entry.best + ' 点');
  else bestEl.textContent = '';
  $('rChips').innerHTML = '';
  setPh($('rTitle'), '「' + G.char + '」を' + (ok ? '抜いた！' : '抜けなかった'));
  const rk = $('rank');
  rk.className = ''; rk.textContent = '';
  $('rNext').textContent = ''; $('rWins').textContent = '';
  hideHint();
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
    const gp = nextRankGap(sc.base, sc.mult);
    setPh($('rNext'), gp ? '次のランク ' + gp.next + ' まで|あと ' + gp.gap + ' 点' : 'いちばん上の|ランク S！');
    setPh($('rWins'), 'これまでの成功：|ぜんぶで ' + totalClears(G.rec) + ' 回|（この文字 ' + rr.entry.clears + ' 回）');
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
  $('rBest').textContent = '';
  $('rNext').textContent = ''; $('rWins').textContent = '';
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

// ---------- きろく ----------
function showRecords() {
  const list = recordList(G.rec), box = $('recList');
  $('recConf').hidden = true;
  $('bRecReset').hidden = !G.rec.total;
  if (!G.rec.total) {
    setPh($('recSum'), 'まだ挑戦していません');
    box.innerHTML = '';
  } else {
    const clears = list.reduce((a, r) => a + r.clears, 0);
    setPh($('recSum'), 'ぜんぶで ' + G.rec.total + ' 回|挑戦（' + clears + ' 回 成功）');
    box.innerHTML = list.map(r =>
      '<div class="recRow"><span class="c">' + esc(r.ch) + '</span>' +
      '<span class="r ' + (r.rank || '') + '">' + (r.rank || '—') + '</span>' +
      '<span class="p">' + (r.best !== null ? r.best + ' 点' : 'まだ抜けていない') + '</span>' +
      '<span class="t">' + r.tries + ' 回</span></div>').join('');
  }
  show('scRec');
  $('scRec').scrollTop = 0;
}

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
  checkHints();
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
  else { if (G.hintKind === 'pre') hideHint(); SFX.scrapeStart(); SFX.scrapeSet(0, false); act(r.events); }
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
$('bStart').addEventListener('click', quickStart);
$('bPick').addEventListener('click', toSelect);
$('bHow').addEventListener('click', showHow);
$('bHowGo').addEventListener('click', () => show('scTitle'));
$('bRec').addEventListener('click', showRecords);
$('bRecBack').addEventListener('click', toSelect);
$('bRecReset').addEventListener('click', () => { setPh($('recAsk'), 'きろくを|ぜんぶ消しますか？'); $('recConf').hidden = false; });
$('bRecNo').addEventListener('click', () => { $('recConf').hidden = true; });
$('bRecYes').addEventListener('click', () => { G.rec = emptyRecord(); clearRecord(G.store); showRecords(); });
$('bBackTitle').addEventListener('click', () => show('scTitle'));
document.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => startRandom(b.dataset.lv)));
$('bGo').addEventListener('click', () => startWord($('inp').value));
$('inp').addEventListener('keydown', e => { if (e.key === 'Enter') startWord($('inp').value); });
function leaveGame() { hideHint(); G.attempt++; SFX.scrapeStop(); if (G.dig) G.dig.release(); $('quitBox').classList.remove('ask'); toSelect(); }
// 型抜き中は、誤タップで失わないよう確認する（割れた・抜けたあとは確認なし）
$('quit').addEventListener('click', () => { if (G.over || !G.dig || G.dig.failed || G.dig.cleared) leaveGame(); else $('quitBox').classList.add('ask'); });
$('quitYes').addEventListener('click', leaveGame);
$('quitNo').addEventListener('click', () => $('quitBox').classList.remove('ask'));

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
