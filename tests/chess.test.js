import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, START_FEN } from '../app/js/chess.js';
import { parsePgn, writePgn } from '../app/js/pgn.js';

const OPERA = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 {Сомнительно} 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

test('FEN: начальная позиция туда и обратно', () => {
  assert.equal(new Chess().fen(), START_FEN);
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  assert.equal(new Chess(fen).fen(), fen);
});

test('FEN: ошибки понятны', () => {
  assert.throws(() => new Chess('8/8/8/8/8/8/8/8 w - - 0 1'), /нет короля/);
  assert.throws(() => new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1'), /8 горизонталей/);
  assert.throws(() => new Chess('4k3/8/8/8/8/8/8/4K2R x - - 0 1'), /очередь хода/);
  // Чёрный король под шахом, а ходят белые — так не бывает.
  assert.throws(() => new Chess('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1'), /Невозможная позиция/);
});

test('FEN: поле взятия на проходе пишется, только если взять можно', () => {
  const g = new Chess();
  g.move('e4');
  assert.equal(g.fen().split(' ')[3], '-');
  const h = new Chess('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3');
  assert.equal(h.fen().split(' ')[3], 'e3');
});

test('SAN: уточнения, рокировки, превращение, шах и мат', () => {
  const g = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const sans = g.moves().map((m) => m.san);
  assert.ok(sans.includes('O-O'));
  assert.ok(sans.includes('O-O-O'));
  assert.ok(sans.includes('Rxa8+'));
  const n = new Chess('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
  assert.ok(n.moves().map((m) => m.san).includes('Nbd2'));
  assert.ok(n.moves().map((m) => m.san).includes('Nfd2'));
  const r = new Chess('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1');
  assert.ok(r.moves().map((m) => m.san).includes('R1a3'));
  assert.ok(r.moves().map((m) => m.san).includes('R5a3'));
  const p = new Chess('8/4P2k/8/8/8/8/8/4K3 w - - 0 1');
  const promo = p.moves().filter((m) => m.from === 'e7').map((m) => m.san).sort();
  assert.deepEqual(promo, ['e8=B', 'e8=N', 'e8=Q', 'e8=R']);
  const mate = new Chess('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  assert.equal(mate.move('Ra8').san, 'Ra8#');
  assert.ok(mate.isCheckmate());
});

test('Ходы: SAN, UCI, объект и нестрогие записи', () => {
  const g = new Chess();
  assert.equal(g.move('e4').uci, 'e2e4');
  assert.equal(g.move('e7e5').san, 'e5');
  assert.equal(g.move({ from: 'g1', to: 'f3' }).san, 'Nf3');
  assert.equal(g.move('Ngc6'), null, 'на g8 нет коня, который идёт на c6');
  assert.equal(g.move('Nbc6').san, 'Nc6', 'лишнее уточнение принимается');
  assert.equal(g.move('Bc4!?').san, 'Bc4', 'знаки оценки отбрасываются');
  assert.equal(g.move('Nh6').san, 'Nh6');
  assert.equal(g.move('0-0').san, 'O-O', 'рокировка через нули');
  assert.equal(g.move('Qh5'), null, 'невозможный ход → null');
  const p = new Chess('8/4P2k/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(p.move('e8Q').san, 'e8=Q', 'превращение без «=»');
  const q = new Chess('8/4P2k/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(q.move('e7e8n').san, 'e8=N');
});

test('Взятие на проходе и отмена хода', () => {
  const g = new Chess('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3');
  const mv = g.move('dxe3');
  assert.equal(mv.flags, 'e');
  assert.equal(g.get('e4'), null, 'взятая пешка исчезла');
  g.undo();
  assert.deepEqual(g.get('e4'), { type: 'p', color: 'w' });
  assert.equal(g.fen(), 'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3');
});

test('Рокировка запрещена через битое поле и после хода ладьи', () => {
  // Чёрная ладья на f8 бьёт f1 — король не может пройти через это поле.
  const g = new Chess('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  const sans = g.moves().map((m) => m.san);
  assert.ok(!sans.includes('O-O'), 'через битое поле f1 нельзя');
  assert.ok(sans.includes('O-O-O'), 'длинная рокировка возможна');
  assert.ok(!new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1').inCheck());
  assert.ok(!new Chess('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1').moves().some((m) => m.san.startsWith('O-O')), 'под шахом рокироваться нельзя');
  const h = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  h.move('Rh2'); h.move('Kd8'); h.move('Rh1'); h.move('Kc8');
  assert.ok(!h.moves().map((m) => m.san).includes('O-O'), 'ладья уже ходила');
  assert.ok(h.moves().map((m) => m.san).includes('O-O-O'));
});

test('Конец партии: мат, пат, материал, повторение, 50 ходов', () => {
  const stale = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.ok(stale.isStalemate());
  assert.equal(stale.gameOverReason(), 'stalemate');
  assert.ok(new Chess('8/8/4k3/8/8/2B5/4K3/8 w - - 0 1').isInsufficientMaterial());
  assert.ok(new Chess('8/8/4k3/8/8/2N5/4K3/8 w - - 0 1').isInsufficientMaterial());
  assert.ok(new Chess('8/2b5/4k3/8/8/2B5/4K3/8 w - - 0 1').isInsufficientMaterial(), 'слоны одного цвета');
  assert.ok(!new Chess('8/3b4/4k3/8/8/2B5/4K3/8 w - - 0 1').isInsufficientMaterial(), 'слоны разного цвета');
  assert.ok(!new Chess('8/8/4k3/8/8/2N5/4K1N1/8 w - - 0 1').isInsufficientMaterial(), 'два коня — мат возможен');
  const rep = new Chess();
  for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1']) rep.move(m);
  assert.ok(!rep.isThreefoldRepetition());
  rep.move('Ng8');
  assert.ok(rep.isThreefoldRepetition());
  assert.equal(rep.gameOverReason(), 'threefold');
  assert.ok(new Chess('8/8/4k3/8/8/8/4K3/7R w - - 100 80').isFiftyMoves());
});

test('PGN: партия в опере читается, мат в конце, комментарии сохраняются', () => {
  const g = parsePgn(OPERA);
  assert.equal(g.headers.White, 'Paul Morphy');
  assert.equal(g.moves.length, 33);
  assert.equal(g.moves[5].comment, 'Сомнительно');
  assert.equal(g.moves[32].san, 'Rd8#');
  assert.equal(g.result, '1-0');
  const pos = new Chess();
  for (const m of g.moves) pos.move(m.uci);
  assert.ok(pos.isCheckmate());
});

test('PGN: формат chess.com — часы, NAG, варианты, «...»', () => {
  const text = `[Event "Live Chess"]
[Site "Chess.com"]
[Result "0-1"]

1. e4 {[%clk 0:09:58.1]} 1... e5 {[%clk 0:09:57]} 2. Qh5?! (2. Nf3 Nc6) 2... Nc6 3. Bc4 Nf6?? $4 4. Qxf7# 1-0

[Event "Second game"]
1. d4 *`;
  const g = parsePgn(text);
  assert.equal(g.moves.length, 7);
  assert.equal(g.moves[0].comment, '', 'служебные [%clk] убраны');
  assert.equal(g.moves[2].nag, 6, '?! → $6');
  assert.equal(g.moves[5].nag, 4);
  assert.equal(g.moves[6].san, 'Qxf7#');
  assert.equal(g.result, '1-0', 'результат из текста партии важнее заголовка');
});

test('PGN: понятная ошибка на невозможном ходе', () => {
  assert.throws(() => parsePgn('1. e4 e5 2. Ke3'), /Ход 2\. «Ke3» невозможен/);
  assert.throws(() => parsePgn('просто текст'), /не найдено ни одного хода/);
  assert.throws(() => parsePgn('1. e4 e5 2. Nf3 привет'), /Непонятная запись «привет»/);
});

test('PGN: русская нотация', () => {
  const g = parsePgn('1. е4 е5 2. Кf3 Кc6 3. Сb5 a6 4. Сxc6 dxc6 5. 0-0 Фd6 6. Лe1 Сg4 7. Крh1');
  assert.deepEqual(g.moves.map((m) => m.san), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'Qd6', 'Re1', 'Bg4', 'Kh1']);
});

test('PGN: запись и чтение обратно, с комментариями и позицией', () => {
  const g = parsePgn(OPERA);
  g.moves[0].comment = 'Самый популярный первый ход';
  g.moves[0].nag = 1;
  const text = writePgn(g);
  assert.match(text, /\[White "Paul Morphy"\]/);
  assert.match(text, /1\. e4 \$1 \{Самый популярный первый ход\} 1\.\.\. e5/);
  for (const line of text.split('\n')) assert.ok(line.length <= 80, 'строки не длиннее 80: ' + line);
  const back = parsePgn(text);
  assert.deepEqual(back.moves.map((m) => m.san), g.moves.map((m) => m.san));
  assert.equal(back.moves[0].comment, 'Самый популярный первый ход');

  const fromFen = { startFen: '4k3/8/8/8/8/8/4P3/4K3 b - - 0 40', moves: [{ san: 'Kd7' }, { san: 'e4' }], result: '*' };
  const t2 = writePgn(fromFen);
  assert.match(t2, /\[SetUp "1"\]/);
  assert.match(t2, /40\.\.\. Kd7 41\. e4 \*/);
  assert.deepEqual(parsePgn(t2).moves.map((m) => m.san), ['Kd7', 'e4']);
});

test('SEE: размены считаются правильно', () => {
  // Слон берёт коня, защищённого пешкой: размен равный → 0.
  const a = new Chess('4k3/8/3p4/4n3/8/8/1B6/4K3 w - - 0 1');
  assert.equal(a.see('e5'), 0);
  // Незащищённый конь: +3.
  const b = new Chess('4k3/8/8/4n3/8/8/1B6/4K3 w - - 0 1');
  assert.equal(b.see('e5'), 3);
  // Ферзь берёт пешку, защищённую пешкой: −8 (ферзь за пешку).
  const c = new Chess('4k3/8/3p4/4p3/8/8/7Q/4K3 w - - 0 1');
  assert.equal(c.see('e5'), -8);
  // Ладья против двух ладей-защитников (сдвоены, рентген): −4.
  const d = new Chess('3rk3/3r4/8/3p4/8/8/8/3RK3 w - - 0 1');
  assert.equal(d.see('d5'), -4);
  // Две сдвоенные ладьи против одной: пешка выигрывается → +1.
  const d2 = new Chess('4k3/3r4/8/3p4/8/8/3R4/3RK3 w - - 0 1');
  assert.equal(d2.see('d5'), 1);
  // Король не может брать защищённую фигуру.
  const e = new Chess('4k3/8/8/8/8/3n4/4K3/8 w - - 0 1');
  assert.equal(e.see('d3'), 3, 'конь на d3 не защищён — король берёт');
  const f = new Chess('4k3/8/8/1b6/8/3n4/4K3/8 w - - 0 1');
  assert.equal(f.see('d3'), 0, 'конь защищён слоном — королю брать нельзя');
});

test('Фигуры под боем после хода', () => {
  // Легаль: после 5.Nxe5 белый ферзь на d1 открыт для слона g4.
  const g = new Chess();
  for (const m of ['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5']) g.move(m);
  const threatened = g.threatenedPieces('w').map((p) => p.square + ':' + p.gain).sort();
  assert.deepEqual(threatened, ['d1:6', 'e5:3']);
});
