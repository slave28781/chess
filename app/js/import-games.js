const RESULT_RE = /\[Result\s+"(1-0|0-1|1\/2-1\/2|\*)"\]/i;

function pgnResult(pgn) {
  const m = String(pgn || '').match(RESULT_RE);
  return m ? m[1] : null;
}

const clean = (v, fallback) => String(v || fallback || '').trim();
const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

export function normalizeLichessImport(g, searchedName) {
  const white = clean(g?.players?.white?.user?.name, 'Белые');
  const black = clean(g?.players?.black?.user?.name, 'Чёрные');
  const whiteRating = Number(g?.players?.white?.rating) || null;
  const blackRating = Number(g?.players?.black?.rating) || null;
  const myColor = sameName(white, searchedName) ? 'w' : sameName(black, searchedName) ? 'b' : null;
  const result = pgnResult(g?.pgn) || (g?.winner === 'white' ? '1-0' : g?.winner === 'black' ? '0-1' : '1/2-1/2');
  return { pgn: g?.pgn || '', white, black, whiteRating, blackRating, myColor, result, createdAt: Number(g?.createdAt) || 0 };
}

export function normalizeChessComImport(g, searchedName) {
  const white = clean(g?.white?.username, 'Белые');
  const black = clean(g?.black?.username, 'Чёрные');
  const whiteRating = Number(g?.white?.rating) || null;
  const blackRating = Number(g?.black?.rating) || null;
  const myColor = sameName(white, searchedName) ? 'w' : sameName(black, searchedName) ? 'b' : null;
  const result = pgnResult(g?.pgn) || (g?.white?.result === 'win' ? '1-0' : g?.black?.result === 'win' ? '0-1' : '1/2-1/2');
  return { pgn: g?.pgn || '', white, black, whiteRating, blackRating, myColor, result, createdAt: Number(g?.end_time || g?.start_time || 0) * 1000 };
}

export function scoreLabel(result) {
  return result === '1/2-1/2' ? '½–½' : result === '1-0' ? '1–0' : result === '0-1' ? '0–1' : '*';
}

export function importFavoriteKey(item) {
  return `${item.source}:${String(item.name || '').trim().toLowerCase()}`;
}

export function toggleImportFavorite(list, item) {
  const normalized = { source: item.source === 'chesscom' ? 'chesscom' : 'lichess', name: String(item.name || '').trim() };
  if (!normalized.name) return Array.isArray(list) ? list : [];
  const current = Array.isArray(list) ? list : [];
  const key = importFavoriteKey(normalized);
  if (current.some((x) => importFavoriteKey(x) === key)) return current.filter((x) => importFavoriteKey(x) !== key);
  return [normalized, ...current].slice(0, 8);
}
