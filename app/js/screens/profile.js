// Экран «Профиль»: рейтинг, история, соперники, награды, стили доски.
import { profile as profileStore, settings } from '../store.js';
import { OPPONENTS, THEMES, ACHIEVEMENTS, START_RATING, isOpponentUnlocked, unlockText, isThemeUnlocked, achievementById } from '../progress.js';
import { h, append, toast, applyTheme, oppPieceUrl, confirmSheet } from '../ui.js';

function ratingChart(history) {
  const pts = [START_RATING, ...history.map((x) => x.rating)];
  if (pts.length < 2) return h('div', { class: 'muted small', style: { padding: '18px 4px', textAlign: 'center' } }, 'Сыграйте рейтинговую партию — здесь появится график.');
  const W = 600, H = 140, pad = 12;
  const min = Math.min(...pts) - 20, max = Math.max(...pts) + 20;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  return h('div', {
    html: `<svg class="rating-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="График рейтинга">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#81b64c" stop-opacity=".35"/><stop offset="1" stop-color="#81b64c" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#rg)"/>
      <path d="${line}" fill="none" stroke="#81b64c" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(pts.length - 1)}" cy="${y(pts.at(-1))}" r="5" fill="#81b64c"/>
    </svg>`,
  }).firstChild;
}

export function mountProfile(root, { go }) {
  function render() {
    root.innerHTML = '';
    const p = profileStore.get();
    const last = p.history.at(-1);
    const s = settings.get();

    root.append(h('div', { class: 'card stack' },
      h('div', { class: 'rating-hero' },
        h('div', {}, h('div', { class: 'muted small' }, 'Ваш рейтинг'), h('div', { class: 'big' }, String(p.rating))),
        last ? h('div', { class: 'delta ' + (last.delta >= 0 ? 'up' : 'down'), style: { paddingBottom: '6px' } }, (last.delta >= 0 ? '+' : '−') + Math.abs(last.delta)) : null,
        h('div', { class: 'muted small', style: { marginLeft: 'auto', textAlign: 'right', paddingBottom: '4px' } }, 'лучший', h('br'), h('b', { style: { color: 'var(--text)', fontSize: '16px' } }, String(p.peak)))),
      ratingChart(p.history),
      h('div', { class: 'stat-row' },
        h('div', {}, h('b', {}, String(p.games)), h('span', {}, 'партий')),
        h('div', {}, h('b', { style: { color: 'var(--accent)' } }, String(p.wins)), h('span', {}, 'побед')),
        h('div', {}, h('b', {}, String(p.draws)), h('span', {}, 'ничьих')),
        h('div', {}, h('b', { style: { color: '#ff8a86' } }, String(p.losses)), h('span', {}, 'поражений'))),
      h('div', { class: 'muted small' }, 'Рейтинг считается по формуле Эло: за победу над сильным соперником дают больше, за поражение слабому — больше снимают. Учитываются только рейтинговые партии.')));

    // Соперники
    const ladder = h('div', { class: 'ladder' });
    for (const o of OPPONENTS) {
      const open = isOpponentUnlocked(p, o);
      const wins = p.beaten[o.id] || 0;
      ladder.append(h('button', {
        class: 'ladder-item' + (open ? '' : ' locked'),
        onclick: () => { if (!open) { toast(unlockText(o)); return; } go('play', { newGame: { level: o.id } }); },
      },
      h('img', { src: oppPieceUrl(o.id), alt: '' }),
      h('div', { class: 'grow' }, h('b', {}, `${o.name} · ${o.rating}`), h('span', {}, open ? (wins ? `Побед: ${wins}` : 'Ещё не обыгран') : `🔒 ${unlockText(o)}`)),
      open ? h('span', { class: 'btn btn-sm' }, 'Играть') : null));
    }
    root.append(h('div', { class: 'card' }, h('h3', {}, 'Соперники'), ladder));

    // Награды
    const got = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
    const grid = h('div', { class: 'ach-grid' });
    for (const a of ACHIEVEMENTS) {
      const has = !!p.achievements[a.id];
      grid.append(h('button', { class: 'ach' + (has ? '' : ' locked'), onclick: () => toast(`${a.title}: ${a.desc}${has ? ' ✓' : ''}`) },
        h('div', { class: 'ico' }, a.icon), h('b', {}, a.title)));
    }
    root.append(h('div', { class: 'card' }, h('h3', {}, `Награды · ${got} из ${ACHIEVEMENTS.length}`), grid));

    // Стили доски
    const themes = h('div', { class: 'theme-grid' });
    for (const t of THEMES) {
      const open = isThemeUnlocked(p, t);
      themes.append(h('button', {
        class: 'theme-card' + (s.theme === t.id ? ' on' : '') + (open ? '' : ' locked'),
        'aria-label': `Стиль «${t.name}»${open ? '' : ', закрыт'}`,
        onclick: () => {
          if (!open) { toast(`«${t.name}» откроется за награду «${achievementById(t.reward).title}»`); return; }
          settings.set({ theme: t.id });
          applyTheme(t.id);
          render();
        },
      }, h('i', { style: { background: `repeating-conic-gradient(${t.dark} 0 25%, ${t.light} 0 50%) 0 0 / 50% 50%` } })));
    }
    root.append(h('div', { class: 'card' }, h('h3', {}, 'Стили доски'), themes));

    root.append(h('button', {
      class: 'btn btn-ghost btn-block',
      onclick: async () => {
        if (!(await confirmSheet('Сбросить рейтинг?', 'Рейтинг вернётся к 500, награды и открытые соперники пропадут. Партии останутся.', 'Сбросить', true))) return;
        profileStore.set({});
        render();
      },
    }, 'Сбросить рейтинг и награды'));
  }
  render();
  return { destroy() {}, refresh: render };
}
