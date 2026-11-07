import { Chess } from '../chess.js';
import { OPENING_LINES } from '../openings.js';
import { Board } from '../board.js';
import { settings } from '../store.js';
import { animationMs } from '../timecontrol.js';
import { h, icon, segmented } from '../ui.js';

const WHITE = [
  ['Испанская партия', 'Развивайте фигуры, защищайте центр и готовьте рокировку. Слон b5 создаёт давление на защитника пешки e5.'],
  ['Итальянская партия', 'Слон c4 смотрит на f7. Подготовьте d4 ходами c3 и d3, затем развивайте атаку.'],
  ['Шотландская партия', 'Раннее d4 открывает центр. Развивайтесь быстро и следите за безопасностью короля.'],
  ['Дебют четырёх коней', 'Естественное развитие коней помогает контролировать центр перед рокировкой.'],
  ['Королевский гамбит', 'Пешка f4 атакует центр, но открывает линии возле короля. Развитие и безопасность важны.'],
  ['Венская партия', 'Конь c3 поддерживает центр; возможны спокойное развитие или продвижение f4.'],
  ['Дебют слона', 'Слон на c4 давит на f7; следите за возможностью d4 и развивайте коней.'],
  ['Ферзевый гамбит', 'Пешка c4 оспаривает d5. Стремитесь к контролю центра и активному развитию.'],
  ['Английское начало', 'Белые контролируют d5 с фланга. Можно развить слона на g2 и гибко строить центр.'],
  ['Дебют Рети', 'Конь f3 и пешка c4 позволяют давить на центр, сохраняя гибкость пешечной структуры.'],
];
const BLACK = [
  ['Сицилианская защита', 'Чёрные борются за d4 пешкой c5 и получают асимметричную позицию.'],
  ['Французская защита', 'Ход e6 готовит d5; позднее ищите контригру против центра белых ходом c5.'],
  ['Защита Каро — Канн', 'Ход c6 поддерживает d5 и сохраняет возможность развить слона c8.'],
  ['Скандинавская защита', 'Немедленно оспорьте центр ходом d5; следите за темпами развития ферзя.'],
  ['Защита Алёхина', 'Конь атакует e4 и провоцирует продвижение пешек, которые затем можно атаковать.'],
  ['Защита Пирца — Уфимцева', 'Чёрные развивают слона на g7 и атакуют центр белых из гибкой позиции.'],
  ['Современная защита', 'Фианкетто слона создаёт давление на длинную диагональ; центр можно оспорить позднее.'],
  ['Русская партия', 'Вместо защиты e5 чёрные атакуют пешку e4 и стремятся к быстрому развитию.'],
  ['Защита Филидора', 'Пешка d6 укрепляет e5; развивайте фигуры, чтобы не остаться в тесной позиции.'],
  ['Голландская защита', 'Ход f5 контролирует e4; внимательно следите за ослаблением королевского фланга.'],
];
const EXAMPLES = [
  { title: 'Атака и жертвы · Андерсен — Кизерицкий, 1851', moves: 'e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#', idea: 'В «Бессмертной партии» Андерсен жертвует материал ради открытых линий и координации лёгких фигур. Ищите шахи, которые ограничивают короля.' },
  { title: 'Защита · Морфи — герцог и граф, 1858', moves: 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#', idea: 'Посмотрите на позицию чёрных: запоздалое развитие и король в центре создают угрозы. Ищите защитные ходы заранее, а не только после шаха.' },
  { title: 'Атака и развитие · Морфи — герцог Брауншвейгский и граф Изуар, 1858', moves: 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#', idea: 'Сравните активность фигур и безопасность королей. Морфи открывает линии и подключает ладьи, прежде чем завершить атаку.' },
  { title: 'Жертва и матовая сеть · ловушка Легаля', moves: 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#', idea: 'После жертвы ферзя ищите форсированные шахи. Координация слона и коней создаёт матовую сеть. Это учебная линия, а не документированная турнирная партия.' },
];

export function mountLearn(root, back) {
  let page = 'menu', side = 'w', lesson = null, lines = [], line = 0, ply = 0;
  const board = new Board(h('div'));
  function draw() {
    root.replaceChildren();
    root.append(h('button', { class: 'btn btn-block', onclick: () => { if (page === 'menu') back(); else if (page === 'lesson') { page = lesson.kind; draw(); } else { page = 'menu'; draw(); } } }, icon('prev'), 'Назад'));
    if (page === 'menu') {
      root.append(h('div', { class: 'card learn-enter' }, h('h2', {}, 'Шахматная школа'), h('p', {}, 'Изучайте начала партий и идеи на доске.')),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => { page = 'openings'; draw(); } }, 'Обучение дебютам'),
        h('button', { class: 'btn btn-block', onclick: () => { page = 'ideas'; draw(); } }, 'Как находить идеи?'));
      return;
    }
    if (page === 'openings') {
      root.append(h('div', { class: 'card learn-enter' }, h('h2', {}, 'Обучение дебютам'), segmented([['w', 'За белых'], ['b', 'За чёрных']], side, v => { side = v; draw(); })));
      for (const [name, idea] of side === 'w' ? WHITE : BLACK) root.append(h('button', { class: 'game-item', onclick: () => {
        const matches = OPENING_LINES.filter(x => x.name === name || x.name.startsWith(name + ','));
        const base = matches.find(x => x.name === name); if (!base) return;
        const longer = OPENING_LINES.filter(x => x.moves.length > base.moves.length && base.moves.every((m, i) => x.moves[i] === m)).sort((a, b) => a.moves.length - b.moves.length);
        lines = [base, ...longer.slice(0, 2)]; lesson = { kind: 'openings', title: name, idea }; line = 0; ply = 0; page = 'lesson'; draw();
      } }, h('div', { class: 'grow' }, h('div', { class: 'gi-title' }, name), h('div', { class: 'gi-sub' }, idea)), icon('next')));
      return;
    }
    if (page === 'ideas') {
      root.append(h('div', { class: 'card learn-enter' }, h('h2', {}, 'Как находить идеи?'), h('p', {}, 'Начните с шахов, взятий и угроз. Оцените незащищённые фигуры, открытые линии и безопасность королей.')));
      for (const item of EXAMPLES) root.append(h('button', { class: 'game-item', onclick: () => { lesson = { kind: 'ideas', title: item.title, idea: item.idea }; lines = [{ name: 'Партия', moves: item.moves.split(' ') }]; line = 0; ply = 0; page = 'lesson'; draw(); } }, h('div', { class: 'grow' }, h('div', { class: 'gi-title' }, item.title), h('div', { class: 'gi-sub' }, item.idea)), icon('next')));
      return;
    }
    const game = new Chess(); let last = null;
    for (const san of lines[line].moves.slice(0, ply)) { const m = game.move(san); if (!m) break; last = m; }
    board.setOrientation(lesson.kind === 'openings' ? side : 'w'); board.setAnimation(animationMs(settings.get().animation)); board.setCoords(settings.get().coords);
    board.setPosition(game, { lastMove: last && { from: last.from, to: last.to }, animate: true });
    board.setArrows(last ? [{ from: last.from, to: last.to, color: '#81b64c' }] : []);
    root.append(h('div', { class: 'card learn-enter' }, h('h2', {}, lesson.title), h('p', {}, lesson.idea), h('div', { class: 'muted small' }, `Ход ${ply} из ${lines[line].moves.length} · стрелка показывает последний ход`)),
      h('div', { class: 'board-wrap' }, board.root),
      h('div', { class: 'nav' }, h('button', { class: 'btn', disabled: ply === 0, onclick: () => { ply = 0; draw(); } }, icon('first')), h('button', { class: 'btn', disabled: ply === 0, onclick: () => { ply--; draw(); } }, icon('prev')), h('button', { class: 'btn', disabled: ply >= lines[line].moves.length, onclick: () => { ply++; draw(); } }, icon('next')), h('button', { class: 'btn', disabled: ply >= lines[line].moves.length, onclick: () => { ply = lines[line].moves.length; draw(); } }, icon('last'))));
    if (lines.length > 1) root.append(h('div', { class: 'card' }, h('div', { class: 'label' }, 'Продолжения'), ...lines.map((l, i) => h('button', { class: 'btn btn-block' + (i === line ? ' btn-primary' : ''), onclick: () => { line = i; ply = 0; draw(); } }, l.name))));
  }
  draw(); return { destroy() {} };
}
