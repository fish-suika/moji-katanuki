
// ===== 記録と「あそびかた」既読の保存（純ロジック。localStorage は引数で受け取る）=====
const REC_KEY = 'mojiKatanuki.record';
const HOWTO_KEY = 'mojiKatanuki.howto';
const REC_MAX_CHARS = 300;          // 記録する文字の上限（超えたら挑戦回数の少ない順に捨てる）
const RANK_ORDER = { S: 4, A: 3, B: 2, C: 1 };

function emptyRecord() { return { v: 1, total: 0, chars: {} }; }

// 保存された値を安全に読み直す（壊れていても空の記録にする）
function sanitizeRecord(o) {
  const r = emptyRecord();
  if (!o || typeof o !== 'object') return r;
  if (Number.isFinite(o.total) && o.total > 0) r.total = Math.floor(o.total);
  if (o.chars && typeof o.chars === 'object') {
    for (const k of Object.keys(o.chars)) {
      const c = o.chars[k];
      if (!c || typeof c !== 'object' || Array.from(k).length !== 1) continue;
      const tries = Number.isFinite(c.tries) && c.tries > 0 ? Math.floor(c.tries) : 0;
      const clears = Number.isFinite(c.clears) && c.clears > 0 ? Math.min(Math.floor(c.clears), tries) : 0;
      const hasBest = Number.isFinite(c.best) && c.best >= 0 && RANK_ORDER[c.rank];
      r.chars[k] = { tries, clears, best: hasBest ? Math.round(c.best) : null, rank: hasBest ? c.rank : null,
        stars: Number.isFinite(c.stars) ? clamp(Math.round(c.stars), 1, 5) : 1, last: Number.isFinite(c.last) ? c.last : 0 };
    }
  }
  return r;
}

// 1 回の挑戦を記録に加える（元の記録は変えずに新しい記録を返す）
// ok: 成功したか / sc: スコア結果（{total, rank}）/ now: 通し番号（新しい順の並びに使う）
function recordAttempt(rec, ch, ok, sc, stars, now) {
  const r = sanitizeRecord(rec);
  const old = r.chars[ch];
  const c = old ? Object.assign({}, old) : { tries: 0, clears: 0, best: null, rank: null, stars: 1, last: 0 };
  c.tries++;
  c.stars = clamp(Math.round(stars || 1), 1, 5);
  c.last = now || r.total + 1;
  let newBest = false;
  if (ok && sc) {
    c.clears++;
    if (c.best === null || sc.total > c.best) {
      newBest = c.best !== null;          // 初めての成功は「更新」ではない
      c.best = sc.total; c.rank = sc.rank;
    }
  }
  r.chars[ch] = c;
  r.total++;
  const keys = Object.keys(r.chars);
  if (keys.length > REC_MAX_CHARS) {
    keys.sort((a, b) => r.chars[a].last - r.chars[b].last);
    for (let i = 0; i < keys.length - REC_MAX_CHARS; i++) delete r.chars[keys[i]];
  }
  return { rec: r, newBest, first: !old || old.best === null && ok, entry: c };
}

// きろく画面の並び（挑戦した文字を、最近挑戦した順に）
function recordList(rec) {
  const r = sanitizeRecord(rec);
  return Object.keys(r.chars).map(ch => Object.assign({ ch }, r.chars[ch])).sort((a, b) => b.last - a.last);
}

function loadRecord(st) {
  try { return st ? sanitizeRecord(JSON.parse(st.getItem(REC_KEY))) : emptyRecord(); } catch (_) { return emptyRecord(); }
}
function saveRecord(st, rec) {
  try { if (!st) return false; st.setItem(REC_KEY, JSON.stringify(rec)); return true; } catch (_) { return false; }
}
function clearRecord(st) {
  try { if (!st) return false; st.removeItem(REC_KEY); return true; } catch (_) { return false; }
}
function loadHowtoSeen(st) { try { return !!st && st.getItem(HOWTO_KEY) === '1'; } catch (_) { return false; } }
function saveHowtoSeen(st) { try { if (!st) return false; st.setItem(HOWTO_KEY, '1'); return true; } catch (_) { return false; } }
