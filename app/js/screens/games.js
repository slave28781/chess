// Экран «Партии»: архив партий на телефоне.
import { games } from '../store.js';
import { classifyGame } from '../review.js';
import { h, icon, dateStr } from '../ui.js';

const ART = `<svg class="art" viewBox="0 0 96 96" fill="none" aria-hidden="true"><rect x="8" y="8" width="80" height="80" rx="20" fill="#23242d"/><rect x="28" y="24" width="40" height="50" rx="6" stroke="#8d91a3" stroke-width="4"/><path d="M37 38h22M37 48h22M37 58h14" stroke="#81b64c" stroke-width="4" stroke-linecap="round"/></svg>`;

function outcome(g) {
  if (!g.result || g.result === '*') return { text: '…', cls: '' };
  if (g.result === '1/2-1/2') return { text: '½', cls: '' };
  if (!g.myColor) return { text: g.result === '1-0' ? '1–0' : '0–1', cls: '' };
  const won = (g.result === '1-0') === (g.myColor === 'w');
  return { text: won ? '1' : '0', cls: won ? 'win' : 'loss', label: won ? 'Победа' : 'Поражение' };
}

export function mountGames(root, { go }) {
  function render() {
    root.innerHTML = '';
    const list = games.list();
    root.append(h('button', { class: 'btn btn-primary btn-block', onclick: () => go('analysis') }, icon('plus'), 'Добавить партию'));
    if (!list.length) {
      root.append(h('div', { class: 'card empty' },
        h('div', { html: ART }),
        h('h2', {}, 'Пока пусто'),
        h('p', {}, 'Здесь появятся ваши партии против Stockfish и партии, которые вы добавите для разбора.')));
      return;
    }
    for (const g of list) {
      const o = outcome(g);
      let acc = null;
      if (g.review && g.review.evals) {
        try {
          const s = classifyGame(g, g.review.evals).summary;
          const side = g.myColor || 'w';
          acc = s[side].accuracy;
        } catch { acc = null; }
      }
      const hd = g.headers || {};
      const n = Math.ceil(g.moves.length / 2);
      root.append(h('button', { class: 'game-item', onclick: () => go('analysis', { gameId: g.id }) },
        h('div', { class: `gi-res ${o.cls}`, title: o.label || '' }, o.cls ? (o.cls === 'win' ? '1' : '0') : o.text),
        h('div', { class: 'grow' },
          h('div', { class: 'gi-title' }, `${hd.White || 'Белые'} — ${hd.Black || 'Чёрные'}`),
          h('div', { class: 'gi-sub' }, [g.opening, `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'ход' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'хода' : 'ходов'}`, dateStr(g.updated || g.created || Date.now())].filter(Boolean).join(' · '))),
        acc !== null ? h('div', { class: 'gi-acc' }, h('b', {}, acc.toFixed(1) + '%'), 'точность') : h('div', { class: 'gi-acc' }, 'без', h('br'), 'разбора')));
    }
  }
  render();
  return { destroy() {}, refresh: render };
}
