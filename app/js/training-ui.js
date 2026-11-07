import { Chess } from './chess.js';
import { h, icon } from './ui.js';

let artworkId = 0;
const SCENES = {
  mistakes: ['6k1/5ppp/8/3q4/8/2N5/5PPP/6K1 w - - 0 1', 'd5', 'g2'],
  tactics: ['8/8/4k3/5q2/8/8/2N5/4K3 w - - 0 1', 'c2', 'd4'],
  openings: ['rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 1 2', 'f1', 'c4'],
  ideas: ['2kr3r/pp1nqppp/2p2n2/1B2p1B1/4P3/2N2Q2/PPP2PPP/2KR3R w - - 0 1', 'd1', 'd7'],
};

// Static diagrams, not interactive boards: illustrations keep a predictable size.
export function trainingArt(kind, fen = null, label = 'Шахматная позиция') {
  const scene = SCENES[kind] || SCENES.ideas;
  const chess = new Chess(fen || scene[0]);
  const id = 'training-arrow-' + ++artworkId;
  const xy = sq => [(sq.charCodeAt(0) - 97) * 12 + 6, (8 - Number(sq[1])) * 12 + 6];
  let drawing = '';
  for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) drawing += `<rect x="${file * 12}" y="${rank * 12}" width="12" height="12" fill="${(rank + file) % 2 ? '#506153' : '#d5dbc7'}"/>`;
  for (const piece of chess.pieces()) {
    const [x, y] = xy(piece.square);
    drawing += `<image href="pieces/${piece.color}${piece.type.toUpperCase()}.svg" x="${x - 6}" y="${y - 6}" width="12" height="12"/>`;
  }
  if (!fen) {
    const [x1, y1] = xy(scene[1]), [x2, y2] = xy(scene[2]);
    drawing += `<defs><marker id="${id}" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0 0L4 2L0 4Z" fill="currentColor"/></marker></defs><path d="M${x1} ${y1}L${x2} ${y2}" stroke="currentColor" stroke-width="2" opacity=".9" marker-end="url(#${id})"/>`;
  }
  return h('span', { class: 'training-art', role: 'img', 'aria-label': label, html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="160" height="160" aria-hidden="true">${drawing}</svg>` });
}

export function trainingCard({ title, description, kind = 'ideas', count, fen, onclick, featured = false }) {
  return h('button', { class: 'training-card training-' + kind + (featured ? ' training-featured' : ''), onclick },
    trainingArt(kind, fen, title),
    h('span', { class: 'training-copy' }, count !== undefined ? h('span', { class: 'training-meta' }, count) : null,
      h('span', { class: 'training-title' }, title), h('span', { class: 'training-description' }, description)),
    h('span', { class: 'training-chevron', 'aria-hidden': 'true' }, icon('next')));
}

export function trainingHeader(title, description) {
  return h('header', { class: 'training-heading training-enter' }, h('h2', {}, title), h('p', {}, description));
}
