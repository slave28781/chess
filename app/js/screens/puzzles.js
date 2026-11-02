// Экран «Задачи»: позиции из ваших же ошибок — найдите ход лучше, чем был сыгран.
import { Chess } from '../chess.js';
import { Board } from '../board.js';
import { CLASSES, toWhitePov, winFor } from '../review.js';
import { puzzles, settings, profile as profileStore } from '../store.js';
import { applyPuzzleSolved } from '../progress.js';
import { animationMs } from '../timecontrol.js';
import { playSound, soundForMove } from '../sound.js';
import { h, icon, fmt, toast, getEngine, clsIcon, celebrate } from '../ui.js';

const ART = `<svg class="art" viewBox="0 0 96 96" fill="none" aria-hidden="true"><rect x="8" y="8" width="80" height="80" rx="20" fill="#23242d"/><path d="M35 70h26M38 70l3-14c-6-3-9-8-9-14 0-9 7-17 17-17l3 5h4l-2 6-5 3" stroke="#81b64c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="66" cy="30" r="9" fill="#ca3431"/><path d="M66 25v6M66 34v1" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;

export function mountPuzzles(root, { go }) {
  let p = null;
  let status = 'solving'; // solving | checking | solved | failed | revealed
  let message = '';
  let destroyed = false;
  let token = 0;
  const board = new Board(h('div'), { onMove: (m, o) => attempt(m, o) });

  function stats() {
    const all = puzzles.list();
    return { total: all.length, solved: all.filter((x) => x.solved > 0).length, todo: all.filter((x) => !x.solved).length };
  }

  function next() {
    p = puzzles.next(p && p.id);
    status = 'solving';
    message = '';
    render(false);
  }

  function render(animate = true) {
    if (destroyed) return;
    root.innerHTML = '';
    const st = stats();
    if (!st.total) {
      root.append(h('div', { class: 'card empty' },
        h('div', { html: ART }),
        h('h2', {}, 'Задач пока нет'),
        h('p', {}, 'Сыграйте с движком или вставьте свою партию — после разбора каждая ваша ошибка станет задачей «найди ход лучше».'),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => go('play') }, icon('play'), 'Сыграть с Stockfish'),
        h('button', { class: 'btn btn-block', onclick: () => go('analysis', { load: true }) }, icon('analysis'), 'Разобрать свою партию')));
      return;
    }
    if (!p) p = puzzles.next();
    const f = fmt();
    const c = new Chess(p.fen);
    const side = c.turn();

    root.append(h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, String(st.total)), h('span', {}, 'всего')),
      h('div', { class: 'stat' }, h('b', { style: { color: 'var(--accent)' } }, String(st.solved)), h('span', {}, 'решено')),
      h('div', { class: 'stat' }, h('b', {}, String(st.todo)), h('span', {}, 'осталось'))));

    const cls = CLASSES[p.cls];
    root.append(h('div', { class: 'move-card' },
      h('div', { class: 'mc-head' }, clsIcon(p.cls),
        h('div', { class: 'grow' },
          h('div', { class: 'mc-title' }, `Ход ${side === 'w' ? 'белых' : 'чёрных'}`),
          h('div', { class: 'mc-move' }, 'В партии было ', h('b', { style: { color: cls.color } }, f(p.played)), ` — ${cls.label.toLowerCase()}`))),
      h('div', { class: 'mc-text' }, 'Найдите ход сильнее.')));

    board.setOrientation(side);
    board.setAnimation(animationMs(settings.get().animation));
    board.setPosition(c, { animate });
    board.setInteractive(status === 'solving' || status === 'failed' ? side : null);
    board.setArrows([]);
    board.setBadge(null);
    root.append(h('div', { class: 'board-wrap' }, board.root));

    if (message) {
      const kind = status === 'solved' ? 'ok' : status === 'failed' ? 'bad' : 'info';
      root.append(h('div', { class: `banner ${kind}` }, message));
    }

    const actions = h('div', { class: 'actions', style: { gridTemplateColumns: 'repeat(3, 1fr)' } });
    if (status === 'solved' || status === 'revealed') {
      actions.append(
        h('button', { class: 'action primary', style: { gridColumn: 'span 3' }, onclick: next }, icon('next'), 'Следующая задача'));
    } else {
      actions.append(
        h('button', { class: 'action', disabled: status === 'checking', onclick: () => { board.setHint(p.best.slice(0, 2)); } }, icon('hint'), 'Подсказка'),
        h('button', { class: 'action', disabled: status === 'checking', onclick: reveal }, icon('eye'), 'Решение'),
        h('button', { class: 'action', disabled: status === 'checking', onclick: next }, icon('next'), 'Пропустить'));
    }
    root.append(actions);
  }

  function lineText(fromFen) {
    const f = fmt();
    const c = new Chess(fromFen);
    let n = c.moveNumber(), white = c.turn() === 'w';
    return (p.line || []).slice(0, 6).map((s, i) => {
      const t = (white ? `${n}.` : i === 0 ? `${n}…` : '') + f(s);
      if (!white) n++;
      white = !white;
      return t;
    }).join(' ');
  }

  function solved(text) {
    status = 'solved';
    message = text;
    puzzles.update(p.id, { solved: (p.solved || 0) + 1, attempts: (p.attempts || 0) + 1, lastTry: Date.now() });
    p = { ...p, solved: (p.solved || 0) + 1 };
    playSound('good');
    const reward = applyPuzzleSolved(profileStore.get());
    profileStore.set(reward.profile);
    if (reward.fresh.length) setTimeout(() => celebrate(reward.fresh), 900);
    render(false);
    const c = new Chess(p.fen);
    const mv = c.move(p.best);
    if (mv) board.setArrows([{ from: mv.from, to: mv.to, color: '#81b64c' }]);
  }

  function reveal() {
    status = 'revealed';
    message = `Решение: ${lineText(p.fen)}`;
    puzzles.update(p.id, { failed: (p.failed || 0) + 1, attempts: (p.attempts || 0) + 1, lastTry: Date.now() });
    render(false);
    const c = new Chess(p.fen);
    const mv = c.move(p.best);
    if (!mv) return;
    board.setArrows([{ from: mv.from, to: mv.to, color: '#81b64c' }]);
    setTimeout(() => { if (!destroyed && status === 'revealed') { board.setPosition(c, { lastMove: { from: mv.from, to: mv.to } }); playSound(soundForMove(mv, c)); } }, 700);
  }

  async function attempt(m, { animate }) {
    if (status !== 'solving' && status !== 'failed') return;
    const c = new Chess(p.fen);
    const mover = c.turn();
    const mv = c.move(m);
    if (!mv) return;
    board.setPosition(c, { lastMove: { from: mv.from, to: mv.to }, animate });
    playSound(soundForMove(mv, c));
    if (mv.uci === p.best) { solved(`Верно! ${lineText(p.fen)}`); return; }
    if (c.isCheckmate()) { solved('Мат! Даже лучше, чем ожидалось.'); return; }
    // Другой ход тоже может быть хорош — проверяем движком.
    const my = ++token;
    status = 'checking';
    message = 'Проверяю ход…';
    board.setInteractive(null);
    try {
      const engine = await getEngine();
      const res = await engine.analyse(c.fen(), { depth: 12 });
      if (my !== token || destroyed) return;
      const score = res.lines[0] ? toWhitePov(res.lines[0].score, c.turn()) : { cp: 0 };
      const loss = winFor(p.bestScore || score, mover) - winFor(score, mover);
      if (loss <= 3) { solved(`Тоже отличный ход! Движок предлагал ${fmt()(p.bestSan)}.`); return; }
      status = 'failed';
      message = 'Не лучший ход — попробуйте ещё раз.';
      playSound('bad');
      puzzles.update(p.id, { failed: (p.failed || 0) + 1, lastTry: Date.now() });
      setTimeout(() => { if (!destroyed && status === 'failed') render(true); }, 650);
      render(false);
      board.setPosition(c, { lastMove: { from: mv.from, to: mv.to }, animate: false });
      board.setInteractive(null);
    } catch (e) {
      status = 'solving';
      message = '';
      toast(e.message || 'Движок не ответил');
      render(false);
    }
  }

  render(false);
  return { destroy() { destroyed = true; token++; }, refresh() { render(false); } };
}
