// Разбор партии: шансы на победу, точность, сила каждого хода.
// Движок даёт оценку позиции; всё остальное считается здесь и проверяется тестами без движка.
import { Chess, PIECE_VALUES } from './chess.js';
import { openingInfo } from './openings.js';

// Пороги потери шансов на победу (в процентных пунктах) для каждой оценки хода.
export const THRESHOLDS = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 };

export const CLASSES = {
  brilliant: { label: 'Блестящий ход', short: '!!', color: '#1baca6' },
  great: { label: 'Замечательный ход', short: '!', color: '#5c8bb0' },
  best: { label: 'Сильнейший ход', short: '★', color: '#81b64c' },
  excellent: { label: 'Отлично', short: '👍', color: '#96bc4b' },
  good: { label: 'Хорошо', short: '✓', color: '#96af8b' },
  book: { label: 'Теоретический ход', short: '📖', color: '#a88865' },
  forced: { label: 'Вынужденный ход', short: '→', color: '#8b8f99' },
  inaccuracy: { label: 'Неточность', short: '?!', color: '#f0c15c' },
  mistake: { label: 'Ошибка', short: '?', color: '#e6912c' },
  miss: { label: 'Упущенная возможность', short: '✗', color: '#ee6b55' },
  blunder: { label: 'Зевок', short: '??', color: '#ca3431' },
};

export const CLASS_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

// NAG для экспорта в PGN.
export const CLASS_NAG = { brilliant: 3, great: 1, inaccuracy: 6, mistake: 2, miss: 2, blunder: 4 };

// Оценка движка (cp или mate) от лица ходящего → от лица белых.
export function toWhitePov(score, turn) {
  if (!score) return null;
  if (turn === 'w') return { ...score };
  if (typeof score.mate === 'number') return { mate: -score.mate };
  return { cp: -score.cp };
}

// Шанс белых на победу 0…100 (формула lichess). score — от лица белых.
export function winPercent(score) {
  if (!score) return 50;
  if (score.mated) return score.mated === 'w' ? 0 : 100;
  if (typeof score.mate === 'number') return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export const winFor = (score, color) => (color === 'w' ? winPercent(score) : 100 - winPercent(score));

// Точность хода 0…100 по потере шансов (формула lichess).
export function moveAccuracy(loss) {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export function formatScore(score) {
  if (!score) return '—';
  if (score.mated) return score.mated === 'w' ? '0-1' : '1-0';
  if (typeof score.mate === 'number') return score.mate > 0 ? `#${score.mate}` : `#−${-score.mate}`;
  const v = score.cp / 100;
  const s = Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1);
  return v > 0.05 ? `+${s}` : v < -0.05 ? `−${s}` : '0.0';
}

// Мат в N за сторону color по оценке (от лица белых), иначе 0.
export function mateFor(score, color) {
  if (!score || typeof score.mate !== 'number') return 0;
  const n = color === 'w' ? score.mate : -score.mate;
  return n > 0 ? n : 0;
}

export function uciLineToSan(fen, ucis, limit = 8) {
  const g = new Chess(fen);
  const res = [];
  for (const u of (ucis || []).slice(0, limit)) {
    const mv = g.move(u);
    if (!mv) break;
    res.push(mv.san);
  }
  return res;
}

// Жертва: после хода фигура (не пешка) отдаётся с потерей ≥ 2 пешек материала,
// и это не была уже висевшая фигура. Возвращает { square, type, net } или null.
export function findSacrifice(fenBefore, uci) {
  const g = new Chess(fenBefore);
  const mover = g.turn();
  const hangingBefore = new Set(g.threatenedPieces(mover).map((p) => p.square));
  const mv = g.move(uci);
  if (!mv) return null;
  const took = mv.captured ? PIECE_VALUES[mv.captured] : 0;
  let best = null;
  for (const p of g.threatenedPieces(mover)) {
    if (PIECE_VALUES[p.type] < 3) continue;
    if (p.square !== mv.to && hangingBefore.has(p.square)) continue;
    const net = p.gain - took;
    if (net >= 2 && (!best || net > best.net)) best = { square: p.square, type: p.type, net };
  }
  return best;
}

// Какую фигуру теряет сторона color, если соперник сыграет reply (UCI) в позиции fen. null — если не теряет.
function lostByReply(fen, color, reply) {
  if (!reply) return null;
  const g = new Chess(fen);
  const to = reply.slice(2, 4);
  const hit = g.threatenedPieces(color).find((p) => p.square === to && p.gain >= 2);
  return hit ? { type: hit.type, square: hit.square } : null;
}

function baseClass(loss) {
  if (loss < THRESHOLDS.excellent) return 'excellent';
  if (loss < THRESHOLDS.good) return 'good';
  if (loss < THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (loss < THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

// Позиции, где партия закончилась, движку не нужны.
export function terminalEval(fen) {
  const g = new Chess(fen);
  const reason = g.gameOverReason();
  if (!reason) return null;
  if (reason === 'checkmate') return { terminal: reason, bestMove: null, score: { mated: g.turn() }, lines: [] };
  return { terminal: reason, bestMove: null, score: { cp: 0 }, lines: [] };
}

/**
 * game:  { startFen, moves: [{ san, uci }] }
 * evals: для каждой позиции 0…N { bestMove, score (от лица белых), lines: [{ move, score, pv }] }
 * → { moves: [...разбор хода], summary: { w, b }, opening }
 */
export function classifyGame(game, evals) {
  const pos = new Chess(game.startFen);
  const fens = [pos.fen()];
  const legalCounts = [];
  for (const m of game.moves) {
    legalCounts.push(pos.movesCount());
    if (!pos.move(m.uci || m.san)) throw new Error('Невозможный ход в партии: ' + m.san);
    fens.push(pos.fen());
  }
  const sans = game.moves.map((m) => m.san);
  const startsFromStart = game.startFen === undefined || new Chess().fen() === new Chess(game.startFen).fen();
  const book = startsFromStart ? openingInfo(sans) : { bookPlies: 0, name: null };

  const result = [];
  for (let i = 0; i < game.moves.length; i++) {
    const m = game.moves[i];
    const color = new Chess(fens[i]).turn();
    const before = evals[i], after = evals[i + 1];
    const winBefore = winFor(before.score, color);
    const winAfter = winFor(after.score, color);
    const isBest = !!before.bestMove && before.bestMove === m.uci;
    const loss = isBest ? 0 : Math.max(0, winBefore - winAfter);
    const r = {
      ply: i,
      color,
      san: m.san,
      uci: m.uci,
      fenBefore: fens[i],
      fenAfter: fens[i + 1],
      scoreBefore: before.score,
      scoreAfter: after.score,
      winBefore,
      winAfter,
      loss,
      accuracy: moveAccuracy(loss),
      bestMove: before.bestMove,
      bestSan: before.bestMove ? uciLineToSan(fens[i], [before.bestMove], 1)[0] : null,
      bestLine: before.lines[0] ? uciLineToSan(fens[i], before.lines[0].pv, 6) : [],
      replyLine: after.lines && after.lines[0] ? uciLineToSan(fens[i + 1], after.lines[0].pv, 6) : [],
      bestPv: before.lines[0] ? before.lines[0].pv : (before.bestMove ? [before.bestMove] : []),
      replyPv: after.lines && after.lines[0] ? after.lines[0].pv : [],
      prevUci: i > 0 ? game.moves[i - 1].uci : null,
      prevSan: i > 0 ? game.moves[i - 1].san : null,
      cls: null,
    };

    if (legalCounts[i] === 1) r.cls = 'forced';
    else if (i < book.bookPlies) { r.cls = 'book'; r.opening = openingInfo(sans.slice(0, i + 1)).name; }
    else {
      r.cls = isBest ? 'best' : baseClass(loss);
      // Мат одним ходом — просто «лучший»: ни жертвы, ни «единственного хода» тут оценивать не нужно.
      if (m.san.endsWith('#')) r.cls = 'best';
      else if (r.cls === 'best' || r.cls === 'excellent') {
        const sac = findSacrifice(fens[i], m.uci);
        // Жертва не в уже полностью выигранной позиции — или жертва, ведущая к мату.
        const matingSac = mateFor(after.score, color) > 0;
        if (sac && winAfter >= 50 && (winBefore < 97 || matingSac)) { r.cls = 'brilliant'; r.sacrifice = sac; }
        else if (isBest && before.lines.length > 1) {
          const gap = winFor(before.lines[0].score, color) - winFor(before.lines[1].score, color);
          const prev = i > 0 ? game.moves[i - 1] : null;
          const recapture = prev && prev.uci.slice(2, 4) === m.uci.slice(2, 4) && /x/.test(prev.san) && /x/.test(m.san);
          if (gap >= 20 && winAfter >= 30 && !recapture) r.cls = 'great';
        }
      }
      if ((r.cls === 'mistake' || r.cls === 'blunder') && i > 0) {
        const prevCls = result[i - 1].cls;
        if ((prevCls === 'mistake' || prevCls === 'blunder' || prevCls === 'miss') && winAfter >= 40) r.cls = 'miss';
      }
      if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(r.cls)) {
        const reply = after.lines && after.lines[0] ? after.lines[0].pv[0] : after.bestMove;
        r.lostPiece = lostByReply(fens[i + 1], color, reply);
      }
    }
    result.push(r);
  }

  const summary = {};
  for (const c of ['w', 'b']) {
    const mine = result.filter((r) => r.color === c && r.cls !== 'forced');
    const counts = Object.fromEntries(CLASS_ORDER.map((k) => [k, 0]));
    for (const r of mine) if (counts[r.cls] !== undefined) counts[r.cls]++;
    const accuracy = mine.length ? mine.reduce((s, r) => s + r.accuracy, 0) / mine.length : null;
    summary[c] = { accuracy: accuracy === null ? null : Math.round(accuracy * 10) / 10, counts, moves: mine.length };
  }
  return { moves: result, summary, opening: book.name };
}

/**
 * Полный разбор с движком. engine.analyse(fen, { depth, multipv }) → { bestMove, lines: [{ score (от ходящего), pv }] }.
 * onProgress(done, total); shouldStop() → true прерывает разбор.
 */
export async function reviewGame(engine, game, { depth = 14, onProgress, shouldStop } = {}) {
  const pos = new Chess(game.startFen);
  const fens = [pos.fen()];
  for (const m of game.moves) { pos.move(m.uci || m.san); fens.push(pos.fen()); }
  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    if (shouldStop && shouldStop()) throw new Error('Разбор остановлен');
    const term = terminalEval(fens[i]);
    if (term) { evals.push(term); }
    else {
      const turn = new Chess(fens[i]).turn();
      const res = await engine.analyse(fens[i], { depth, multipv: 2 });
      const lines = res.lines.map((l) => ({ move: l.pv[0], score: toWhitePov(l.score, turn), pv: l.pv.slice(0, 10) }));
      evals.push({ bestMove: res.bestMove, score: lines[0] ? lines[0].score : { cp: 0 }, lines, depth });
    }
    if (onProgress) onProgress(i + 1, fens.length);
  }
  return { evals, ...classifyGame(game, evals) };
}

// Задачи из ошибок: позиции, где сторона color ошиблась. color: 'w' | 'b' | 'both'.
export function extractPuzzles(review, color) {
  return review.moves
    .filter((r) => ['mistake', 'blunder', 'miss'].includes(r.cls) && (color === 'both' || r.color === color) && r.bestMove)
    .map((r) => ({ fen: r.fenBefore, best: r.bestMove, bestSan: r.bestSan, bestScore: r.scoreBefore, line: r.bestLine, played: r.san, cls: r.cls, ply: r.ply, color: r.color }));
}
