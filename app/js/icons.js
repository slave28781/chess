// Значки силы хода: цветной круг с белым символом (свой рисунок, в духе привычных шахматных сервисов).
import { CLASSES } from './review.js';

const W = '#fff';

function star(cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${W}" stroke="${W}" stroke-width=".6" stroke-linejoin="round"/>`;
}

const bang = (x) => `<rect x="${x - 1.6}" y="3.9" width="3.2" height="8.4" rx="1.6" fill="${W}"/><circle cx="${x}" cy="15.1" r="1.75" fill="${W}"/>`;
const quest = (x, s = 1) => `<g transform="translate(${x} 0) scale(${s} 1) translate(${-x} 0)"><path d="M${x - 2.7} 7.1a2.75 2.75 0 1 1 3.9 2.5c-.85.4-1.2.95-1.2 1.75v.6" fill="none" stroke="${W}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${x}" cy="15.1" r="1.6" fill="${W}"/></g>`;

const GLYPHS = {
  brilliant: bang(6.9) + bang(13.1),
  great: bang(10),
  best: star(10, 10.6, 6.6, 2.75),
  excellent: `<path d="M4.6 9.3h2.5v6.6H4.6z" fill="${W}"/><path d="M8.1 15.9V9.4l2.7-4.5c.35-.55 1.35-.45 1.6.3.12.4.06.85-.08 1.25l-.85 2.25h3.2c.85 0 1.5.8 1.3 1.6l-1.05 4.45c-.17.7-.8 1.15-1.5 1.15z" fill="${W}"/>`,
  good: `<path d="M5.4 10.4l3.1 3.1 6.1-6.7" fill="none" stroke="${W}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  book: `<path d="M4.3 5.9c1.9-.65 3.8-.45 5.2.6v8.6c-1.4-1-3.3-1.25-5.2-.6z" fill="${W}"/><path d="M15.7 5.9c-1.9-.65-3.8-.45-5.2.6v8.6c1.4-1 3.3-1.25 5.2-.6z" fill="${W}"/>`,
  inaccuracy: quest(7.6, 0.9) + `<rect x="12.4" y="3.9" width="3" height="8.4" rx="1.5" fill="${W}"/><circle cx="13.9" cy="15.1" r="1.6" fill="${W}"/>`,
  mistake: quest(10),
  miss: `<path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>`,
  blunder: quest(6.6, 0.82) + quest(13.4, 0.82),
  forced: `<path d="M5 10h9.2M10.6 6.3 14.4 10l-3.8 3.7" fill="none" stroke="${W}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
};

// SVG-значок для класса хода. Размер задаётся CSS.
export function classIconSvg(cls) {
  const c = CLASSES[cls];
  if (!c) return '';
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="${c.color}"/><circle cx="10" cy="10" r="9.3" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.2"/>${GLYPHS[cls]}</svg>`;
}
