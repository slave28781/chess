// Интеграционные тесты с настоящим Stockfish 18 (та же сборка, что в браузере), запущенным через Node.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Engine, LEVELS, chooseMove, parseInfo } from '../app/js/engine.js';
import { Chess } from '../app/js/chess.js';
import { reviewGame } from '../app/js/review.js';
import { parsePgn } from '../app/js/pgn.js';
import { moveComment } from '../app/js/comments.js';

const ENGINE = fileURLToPath(new URL('../app/engine/stockfish-18-lite-single.js', import.meta.url));

function nodeTransport(path) {
  const p = spawn(process.execPath, [path], { stdio: ['pipe', 'pipe', 'ignore'] });
  const rl = readline.createInterface({ input: p.stdout });
  let onLine = () => {};
  rl.on('line', (l) => onLine(l));
  return { post: (c) => p.stdin.write(c + '\n'), onLine: (f) => { onLine = f; }, terminate: () => { p.stdin.end('quit\n'); p.kill(); } };
}

const engine = new Engine(nodeTransport(ENGINE));
after(() => engine.terminate());

test('разбор строки info', () => {
  const i = parseInfo('info depth 12 seldepth 18 multipv 2 score mate -3 nodes 100 nps 5 time 20 pv e2e4 e7e5');
  assert.deepEqual(i, { multipv: 2, depth: 12, seldepth: 18, score: { mate: -3 }, nodes: 100, nps: 5, time: 20, pv: ['e2e4', 'e7e5'] });
  assert.equal(parseInfo('info depth 5 score cp 10 upperbound pv e2e4').bound, 'upperbound');
  assert.equal(parseInfo('info string NNUE evaluation using nn.nnue'), null);
});

test('движок запускается и анализирует с MultiPV', async () => {
  await engine.ready;
  assert.match(engine.name, /Stockfish/);
  const res = await engine.analyse(new Chess().fen(), { depth: 10, multipv: 3 });
  assert.equal(res.lines.length, 3);
  assert.ok(new Chess().move(res.bestMove), 'лучший ход легален');
  assert.ok(Math.abs(res.lines[0].score.cp) < 100, 'начальная позиция примерно равна');
});

test('движок находит мат в 1', async () => {
  const res = await engine.analyse('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth: 8 });
  assert.equal(res.bestMove, 'a1a8');
  assert.deepEqual(res.lines[0].score, { mate: 1 });
});

test('остановка поиска возвращает найденное', async () => {
  const p = engine.analyse(new Chess().fen(), { depth: 40 });
  setTimeout(() => engine.stop(), 300);
  const res = await p;
  assert.ok(res.bestMove);
  assert.ok(res.lines[0].depth < 40);
});

test('разбор партии со Stockfish: детский мат', async () => {
  const game = parsePgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
  let progress = 0;
  const r = await reviewGame(engine, game, { depth: 10, onProgress: (d) => { progress = d; } });
  assert.equal(progress, 8);
  const cls = r.moves.map((m) => m.cls);
  assert.deepEqual(cls.slice(0, 3), ['book', 'book', 'book']);
  assert.equal(cls[5], 'blunder', '3...Кf6?? — зевок мата');
  assert.equal(cls[6], 'best', '4.Фxf7# — лучший ход');
  assert.match(moveComment(r.moves[5]), /мат в 1 ход: Qxf7#/);
  assert.ok(r.summary.w.accuracy > r.summary.b.accuracy);
});

test('разбор партии со Stockfish: ловушка Легаля — жертва ферзя', async () => {
  const game = parsePgn('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0');
  const r = await reviewGame(engine, game, { depth: 12 });
  const nxe5 = r.moves[8];
  assert.equal(nxe5.san, 'Nxe5');
  assert.equal(nxe5.cls, 'brilliant', 'жертва ферзя с выигрышем — бриллиантовый');
  assert.equal(r.moves[9].cls, 'blunder', '5...Сxd1?? — зевок мата');
  assert.equal(r.moves[12].cls, 'best', 'Кd5# — лучший');
});

test('разбор со Stockfish: «Партия в опере» — жертвы Морфи бриллиантовые', async () => {
  const game = parsePgn(`1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`);
  const r = await reviewGame(engine, game, { depth: 12 });
  const by = (san, ply) => r.moves.find((m) => m.san === san && (ply === undefined || m.ply === ply));
  assert.equal(by('Rxd7', 24).cls, 'brilliant', '13.Лxd7!! — жертва качества');
  assert.equal(by('Qb8+').cls, 'brilliant', '16.Фb8+!! — жертва ферзя с матом');
  assert.match(moveComment(by('Qb8+')), /^Блестящая жертва ферзя!.*мат в 1 ход/);
  assert.equal(by('Rd8#').cls, 'best');
  assert.equal(r.opening, 'Защита Филидора');
  assert.ok(r.summary.w.accuracy > 90, 'Морфи играл очень точно');
});

test('уровни игры: каждый уровень делает легальный ход', async () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  for (const level of [LEVELS[0], LEVELS[3], LEVELS[7]]) {
    const uci = await chooseMove(engine, fen, { ...level, movetime: Math.min(level.movetime || 0, 200) || undefined });
    assert.ok(new Chess(fen).move(uci), `уровень ${level.id}: ${uci}`);
  }
});
