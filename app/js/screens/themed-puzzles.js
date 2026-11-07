import { trainingCard, trainingHeader } from '../training-ui.js';
import { Chess } from '../chess.js';
import { Board } from '../board.js';
import { settings } from '../store.js';
import { animationMs } from '../timecontrol.js';
import { playSound, soundForMove } from '../sound.js';
import { h, icon } from '../ui.js';

const SETS = [
  { title: 'Мат в один ход', description: 'Найдите ход, который сразу ставит мат.', mate: true, positions: [
    ['6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8'],
    ['7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'f7g7'],
  ] },
  { title: 'Вилка конём', description: 'Сделайте шах и одновременно нападите на ферзя.', positions: [
    ['8/8/4k3/5q2/8/8/2N5/4K3 w - - 0 1', 'c2d4'],
    ['4k3/2n5/8/8/5Q2/4K3/8/8 b - - 0 1', 'c7d5'],
  ] },
];

export function mountThemedPuzzles(root, onBack) {
  let selected = null, index = 0, done = false, message = '';
  const board = new Board(h('div'), { onMove(move, options) {
    const [fen, answer] = selected.positions[index];
    const game = new Chess(fen), played = game.move(move);
    if (!played) return;
    board.setPosition(game, { lastMove: { from: played.from, to: played.to }, animate: options.animate });
    playSound(soundForMove(played, game));
    if (played.uci === answer || (selected.mate && game.isCheckmate())) {
      done = true; message = selected.mate ? 'Верно, мат!' : 'Верно! Конь нападает на короля и ферзя.'; playSound('good');
    } else { message = 'Попробуйте ещё раз.'; playSound('bad'); }
    draw(false);
  } });
  function draw(animate = false) {
    root.replaceChildren();
    root.append(h('button', { class: 'btn btn-block', onclick: () => { if (selected) { selected = null; draw(); } else onBack(); } }, icon('prev'), selected ? 'К наборам' : 'К тренировкам'));
    if (!selected) {
      root.append(trainingHeader('Тактика', 'Увидеть угрозу. Найти точный ход.'), h('div', { class: 'training-grid training-enter' },
        ...SETS.map(set => trainingCard({ title: set.title, description: set.description, kind: 'tactics', count: `${set.positions.length} задачи`, fen: set.positions[0][0], onclick: () => { selected = set; index = 0; done = false; message = ''; draw(); } }))));
      return;
    }
    const [fen, answer] = selected.positions[index], game = new Chess(fen);
    board.setOrientation(game.turn()); board.setCoords(settings.get().coords); board.setAnimation(animationMs(settings.get().animation));
    board.setPosition(game, { animate }); board.setInteractive(done ? null : game.turn());
    root.append(h('div', { class: 'move-card' }, h('div', { class: 'mc-title' }, selected.title, ` · ${index + 1}/${selected.positions.length}`), h('div', { class: 'mc-text' }, selected.description)), h('div', { class: 'board-wrap' }, board.root));
    if (message) root.append(h('div', { class: 'banner ' + (done ? 'ok' : 'bad') }, message));
    root.append(h('div', { class: 'actions', style: { gridTemplateColumns: 'repeat(2, 1fr)' } },
      h('button', { class: 'action', onclick: () => board.setHint(answer.slice(0, 2)) }, icon('hint'), 'Подсказка'),
      h('button', { class: 'action', onclick: () => { index = (index + 1) % selected.positions.length; done = false; message = ''; draw(); } }, icon('next'), 'Следующая')));
  }
  draw();
  return { destroy() { board.setInteractive(null); }, refresh() { draw(false); } };
}
