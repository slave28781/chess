// Разбор партии на подставных оценках: движок не нужен, проверяется сама логика.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../app/js/chess.js';
import {
  winPercent, winFor, moveAccuracy, formatScore, toWhitePov, mateFor,
  classifyGame, findSacrifice, terminalEval, extractPuzzles, uciLineToSan,
} from '../app/js/review.js';
import { moveComment } from '../app/js/comments.js';
import { openingInfo, OPENING_LINES } from '../app/js/openings.js';
import { sanToRu } from '../app/js/notation.js';

// Партия из SAN → { startFen, moves: [{ san, uci }] }
function gameOf(sans, startFen) {
  const g = new Chess(startFen);
  const moves = sans.map((s) => { const m = g.move(s); assert.ok(m, 'ход ' + s); return { san: m.san, uci: m.uci }; });
  return { startFen: startFen || g.startFen(), moves, fens: [startFen ? new Chess(startFen).fen() : new Chess().fen(), ...moves.map((_, i) => { const h = new Chess(startFen); moves.slice(0, i + 1).forEach((x) => h.move(x.uci)); return h.fen(); })] };
}

const ev = (bestMove, cp, extra = []) => ({
  bestMove,
  score: typeof cp === 'object' ? cp : { cp },
  lines: [{ move: bestMove, score: typeof cp === 'object' ? cp : { cp }, pv: [bestMove] }, ...extra],
});

test('шанс на победу: формула lichess, мат, симметрия', () => {
  assert.equal(winPercent({ cp: 0 }), 50);
  assert.ok(Math.abs(winPercent({ cp: 100 }) - 59.1) < 0.1);
  assert.ok(Math.abs(winPercent({ cp: 100 }) + winPercent({ cp: -100 }) - 100) < 1e-9);
  assert.equal(winPercent({ cp: 5000 }), winPercent({ cp: 1000 }), 'оценка ограничена ±10 пешками');
  assert.equal(winPercent({ mate: 3 }), 100);
  assert.equal(winPercent({ mate: -2 }), 0);
  assert.equal(winPercent({ mated: 'b' }), 100);
  assert.equal(winFor({ cp: 100 }, 'b'), 100 - winPercent({ cp: 100 }));
});

test('точность хода и формат оценки', () => {
  assert.ok(moveAccuracy(0) > 99.9);
  assert.ok(moveAccuracy(10) > 60 && moveAccuracy(10) < 66);
  assert.ok(moveAccuracy(50) < 12);
  assert.equal(formatScore({ cp: 135 }), '+1.4');
  assert.equal(formatScore({ cp: -50 }), '−0.5');
  assert.equal(formatScore({ cp: 3 }), '0.0');
  assert.equal(formatScore({ mate: 3 }), '#3');
  assert.equal(formatScore({ mate: -2 }), '#−2');
  assert.deepEqual(toWhitePov({ cp: 40 }, 'b'), { cp: -40 });
  assert.deepEqual(toWhitePov({ mate: 2 }, 'b'), { mate: -2 });
  assert.equal(mateFor({ mate: -2 }, 'b'), 2);
  assert.equal(mateFor({ mate: -2 }, 'w'), 0);
});

test('дебютная книга: все линии корректны, названия находятся', () => {
  for (const line of OPENING_LINES) {
    const g = new Chess();
    for (const s of line.moves) assert.ok(g.move(s) && g.history().at(-1).san === s, `${line.name}: ${s}`);
  }
  assert.deepEqual(openingInfo(['e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4']), { bookPlies: 4, name: 'Защита Филидора' });
  assert.equal(openingInfo(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']).name, 'Сицилианская защита, вариант Найдорфа');
  assert.equal(openingInfo(['a4']).bookPlies, 0);
});

test('детский мат: теория, зевок с комментарием, лучший ход, точность', () => {
  const g = gameOf(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
  const evals = [
    ev('e2e4', 30), ev('e7e5', 30), ev('g1f3', 30),
    ev('g8f6', 20),
    ev('g1f3', 30),
    ev('g7g6', 0, [{ move: 'd8e7', score: { cp: 20 }, pv: ['d8e7'] }]),
    ev('h5f7', { mate: 1 }),
    terminalEval(g.fens[7]),
  ];
  const r = classifyGame(g, evals);
  assert.deepEqual(r.moves.map((m) => m.cls), ['book', 'book', 'book', 'excellent', 'good', 'blunder', 'best']);
  assert.equal(r.opening, 'Дебют слона');
  assert.equal(r.moves[0].opening, 'Дебют королевской пешки');
  assert.equal(moveComment(r.moves[5]), 'Зевок! Теперь у соперника мат в 1 ход: Qxf7#. Нужно было g6.');
  assert.equal(moveComment(r.moves[5], sanToRu), 'Зевок! Теперь у соперника мат в 1 ход: Фxf7#. Нужно было g6.');
  assert.equal(moveComment(r.moves[0]), 'Теория: Дебют королевской пешки.');
  assert.equal(r.summary.w.counts.best, 1);
  assert.equal(r.summary.b.counts.blunder, 1);
  assert.ok(r.summary.w.accuracy > r.summary.b.accuracy, 'у белых точность выше');
  const puzzles = extractPuzzles(r, 'b');
  assert.equal(puzzles.length, 1);
  assert.equal(puzzles[0].best, 'g7g6');
  assert.equal(puzzles[0].played, 'Nf6');
  assert.equal(extractPuzzles(r, 'w').length, 0);
});

test('жертва: ловушка Легаля — бриллиантовый ход', () => {
  const sans = ['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5'];
  const g = gameOf(sans);
  // Отдаём ферзя (9), но конь уже взял пешку (1), а за ферзя соперник отдаст слона (3): чистая жертва 9 − 3 − 1 = 5.
  assert.deepEqual(findSacrifice(g.fens[8], 'f3e5'), { square: 'd1', type: 'q', net: 5 });
  const evals = g.moves.map((m) => ev(m.uci, 20));
  evals.push(ev('g4d1', 150));
  const r = classifyGame(g, evals);
  assert.equal(r.moves[8].cls, 'brilliant');
  assert.match(moveComment(r.moves[8]), /^Блестящая жертва ферзя!/);
  // Та же жертва, но если после неё позиция плохая — не бриллиант, а обычная ошибка.
  const bad = g.moves.map((m) => ev(m.uci, 20));
  bad[8] = ev('d2d3', 20);
  bad.push(ev('g4d1', -300));
  assert.equal(classifyGame(g, bad).moves[8].cls, 'blunder');
});

test('обычное взятие — не жертва; размен с выгодой — не жертва', () => {
  // Слон бьёт ферзя под защитой пешки: отдаём 3, взяли 9 — это выигрыш, а не жертва.
  assert.equal(findSacrifice('4k3/8/3p4/4q3/8/8/1B6/4K3 w - - 0 1', 'b2e5'), null);
  // Слон бьёт пешку f7 с шахом, король берёт слона: жертва слона за пешку.
  const s = findSacrifice('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'c4f7');
  assert.deepEqual(s, { square: 'f7', type: 'b', net: 2 });
});

test('отличный ход «!»: единственный ход, остальные сильно хуже', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const g = gameOf(['Bb5'], fen);
  const evals = [ev('f1b5', 50, [{ move: 'f1c4', score: { cp: -200 }, pv: ['f1c4'] }]), ev('a7a6', 50)];
  const r = classifyGame(g, evals);
  assert.equal(r.moves[0].cls, 'great');
  // Если второй ход почти так же хорош — просто «лучший».
  const evals2 = [ev('f1b5', 50, [{ move: 'f1c4', score: { cp: 40 }, pv: ['f1c4'] }]), ev('a7a6', 50)];
  assert.equal(classifyGame(g, evals2).moves[0].cls, 'best');
});

test('упущение: соперник зевнул, а ответная ошибка вернула преимущество', () => {
  const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  const g = gameOf(['d3', 'h6', 'a3'], fen);
  const evals = [ev('d2d3', 20), ev('g8f6', 20), ev('c4f7', 400), ev('g8f6', 30)];
  const r = classifyGame(g, evals);
  assert.deepEqual(r.moves.map((m) => m.cls), ['best', 'blunder', 'miss']);
  assert.match(moveComment(r.moves[2]), /^Упущение: соперник ошибся, но шанс не использован\. Сильнее было Bxf7\+/);
});

test('вынужденный ход и потеря фигуры в комментарии', () => {
  const g = gameOf(['Kxb2'], 'k7/8/8/8/8/8/1r6/K7 w - - 0 1');
  const r = classifyGame(g, [ev('a1b2', 0), terminalEval(g.fens[1])]);
  assert.equal(r.moves[0].cls, 'forced');
  assert.equal(moveComment(r.moves[0]), 'Единственный возможный ход.');
  assert.equal(r.summary.w.moves, 0, 'вынужденные ходы не влияют на точность');

  // Если ответ соперника ничего не забирает и мата нет — комментарий говорит, как изменилась оценка.
  const h = gameOf(['Kd7'], '4k3/8/8/8/8/8/r7/3BK3 b - - 0 1');
  const evals = [ev('a2a1', 0), { bestMove: 'd1g4', score: { cp: 520 }, lines: [{ move: 'd1g4', score: { cp: 520 }, pv: ['d1g4'] }] }];
  const res = classifyGame(h, evals);
  assert.equal(res.moves[0].cls, 'blunder');
  assert.equal(res.moves[0].lostPiece, null);
  assert.equal(moveComment(res.moves[0]), 'Зевок! Оценка: 0.0 → +5.2. Нужно было Ra1.');
});

test('комментарий «теряется фигура», когда ответ соперника её берёт', () => {
  // 3...Фh4?? — ферзь под конём f3.
  const g = gameOf(['Qh4'], 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R b KQkq - 0 3');
  const evals = [ev('g8f6', 20), { bestMove: 'f3h4', score: { cp: 900 }, lines: [{ move: 'f3h4', score: { cp: 900 }, pv: ['f3h4'] }] }];
  const r = classifyGame(g, evals);
  assert.equal(r.moves[0].cls, 'blunder');
  assert.deepEqual(r.moves[0].lostPiece, { type: 'q', square: 'h4' });
  assert.equal(moveComment(r.moves[0]), 'Зевок! Теряется ферзь: Nxh4. Нужно было Nf6.');
  assert.equal(moveComment(r.moves[0], (x) => x.replace(/^N/, 'К')), 'Зевок! Теряется ферзь: Кxh4. Нужно было Кf6.');
});

test('русская нотация и линии в SAN', () => {
  assert.equal(sanToRu('Nf3'), 'Кf3');
  assert.equal(sanToRu('Kxe2'), 'Крxe2');
  assert.equal(sanToRu('exd8=Q+'), 'exd8=Ф+');
  assert.equal(sanToRu('O-O-O'), '0-0-0');
  assert.equal(sanToRu('Bb5'), 'Сb5');
  assert.deepEqual(uciLineToSan(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3', 'zz', 'b8c6']), ['e4', 'e5', 'Nf3']);
});
