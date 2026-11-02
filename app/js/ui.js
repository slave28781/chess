// Общие элементы интерфейса: иконки, листы, уведомления, шкала оценки, график, значки ходов.
import { CLASSES, winPercent, formatScore } from './review.js';
import { makeFormatter } from './notation.js';
import { settings } from './store.js';
import { Engine, workerTransport } from './engine.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  play: svg('<path d="M8 21h8M9 21l1-5c-2-1-3-3-3-5 0-3 2.5-6 6-6l1 2h1.5L16 9l-2 1"/><path d="M13.5 5 15 3"/>'),
  analysis: svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
  puzzles: svg('<path d="M19.4 14.6a2.6 2.6 0 0 0 0-5.2H18V6a2 2 0 0 0-2-2h-3.4v-1.4a2.6 2.6 0 0 0-5.2 0V4H4a1 1 0 0 0-1 1v3.4h1.4a2.6 2.6 0 0 1 0 5.2H3V18a2 2 0 0 0 2 2h3.4v-1.4a2.6 2.6 0 0 1 5.2 0V20H16a2 2 0 0 0 2-2v-3.4z"/>'),
  games: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  first: svg('<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>'),
  prev: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  last: svg('<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>'),
  flip: svg('<path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>'),
  hint: svg('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  flag: svg('<path d="M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1"/>'),
  more: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  share: svg('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  paste: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  bolt: svg('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  board: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
};

// Как el.append, но пропускает null/false (встроенный append превращает null в текст «null»).
export function append(el, ...kids) {
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k);
  return el;
}

export function icon(name) {
  const span = h('span', { html: ICONS[name] });
  return span.firstChild;
}

export function fmt() {
  return makeFormatter(settings.get().notation);
}

export function clsIcon(cls, size = '') {
  const c = CLASSES[cls];
  if (!c) return h('span');
  return h('span', { class: `cls-icon ${size}`, style: { background: c.color }, title: c.label }, c.short);
}

// ---------- Уведомления ----------
let toastTimer = null;
export function toast(text, ms = 2600) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

// ---------- Нижний лист ----------
export function openSheet(build) {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grip' }));
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  build(sheet, close);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  return close;
}

export function confirmSheet(title, text, okLabel, danger = false) {
  return new Promise((resolve) => {
    openSheet((sheet, close) => {
      append(sheet,
        h('h2', {}, title),
        text ? h('p', { class: 'muted', style: { margin: 0 } }, text) : null,
        h('button', { class: `btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => { close(); resolve(true); } }, okLabel),
        h('button', { class: 'btn btn-block btn-ghost', onclick: () => { close(); resolve(false); } }, 'Отмена'),
      );
    });
  });
}

export function segmented(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  const render = (v) => {
    el.innerHTML = '';
    for (const [val, label] of options) {
      el.append(h('button', { class: v === val ? 'on' : '', role: 'radio', 'aria-checked': String(v === val), onclick: () => { render(val); onChange(val); } }, label));
    }
  };
  render(value);
  return el;
}

export function switchEl(on, onChange) {
  const b = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on) });
  b.addEventListener('click', () => {
    const v = !b.classList.contains('on');
    b.classList.toggle('on', v);
    b.setAttribute('aria-checked', String(v));
    onChange(v);
  });
  return b;
}

// ---------- Шкала оценки ----------
export class EvalBar {
  constructor() {
    this.el = h('div', { class: 'evalbar', 'aria-hidden': 'true' });
    this.fill = h('div', { class: 'evalbar-fill' });
    this.text = h('div', { class: 'evalbar-text' });
    this.el.append(this.fill, this.text);
  }

  set(score, orientation = 'w') {
    const w = score ? winPercent(score) : 50;
    this.el.classList.toggle('flipped', orientation === 'b');
    this.fill.style.height = `${w}%`;
    const txt = score ? formatScore(score).replace('+', '').replace('−', '') : '';
    this.text.textContent = txt;
    const whiteAhead = w >= 50;
    const atBottom = (whiteAhead && orientation === 'w') || (!whiteAhead && orientation === 'b');
    this.text.style.top = atBottom ? '' : '4px';
    this.text.style.bottom = atBottom ? '4px' : '';
    this.text.style.color = whiteAhead ? '#222' : '#eee';
  }
}

// ---------- График оценки ----------
export function evalGraph(evals, moves, current, onPick) {
  const W = 600, H = 120, n = Math.max(1, evals.length - 1);
  const pts = evals.map((e, i) => [(i / n) * W, H - (winPercent(e.score) / 100) * H]);
  const area = `M0,${H} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
  let dots = '';
  moves.forEach((m, i) => {
    if (!['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(m.cls)) return;
    const [x, y] = pts[i + 1];
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${CLASSES[m.cls].color}" stroke="#13141a" stroke-width="2"/>`;
  });
  const cx = current >= 0 ? ((current + 1) / n) * W : 0;
  const el = h('div', {
    html: `<svg class="graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="График оценки партии">
      <rect width="${W}" height="${H}" fill="#2a2c36"/>
      <path d="${area}" fill="#e9eaee"/>
      <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#8d91a3" stroke-opacity=".35" stroke-dasharray="4 6"/>
      <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="#81b64c" stroke-width="3"/>
      ${dots}
    </svg>`,
  });
  const g = el.firstChild;
  const pick = (e) => {
    const r = g.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * n) - 1;
    onPick(Math.max(-1, Math.min(moves.length - 1, i)));
  };
  g.addEventListener('pointerdown', pick);
  return g;
}

// ---------- Движок (один на всё приложение) ----------
let enginePromise = null;
export function getEngine() {
  if (!enginePromise) {
    const engine = new Engine(workerTransport('engine/stockfish-18-lite-single.js'));
    enginePromise = engine.ready.then(() => engine).catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}

export function resultText(result, reason) {
  const reasons = {
    checkmate: 'мат', stalemate: 'пат', insufficient: 'недостаточно материала', threefold: 'троекратное повторение', fifty: 'правило 50 ходов', resign: 'сдача',
  };
  const r = reasons[reason] ? ` · ${reasons[reason]}` : '';
  if (result === '1-0') return 'Победа белых' + r;
  if (result === '0-1') return 'Победа чёрных' + r;
  if (result === '1/2-1/2') return 'Ничья' + r;
  return 'Партия не окончена';
}

export function dateStr(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function pgnDate(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// Взятые фигуры и перевес по материалу для показа рядом с игроком.
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const SYMBOL = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export function capturedInfo(chess, color) {
  const enemy = color === 'w' ? 'b' : 'w';
  const left = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const p of chess.pieces()) if (p.color === enemy && p.type !== 'k') left[p.type]++;
  let s = '';
  for (const t of ['q', 'r', 'b', 'n', 'p']) s += SYMBOL[t].repeat(Math.max(0, START_COUNT[t] - left[t]));
  const diff = chess.material(color) - chess.material(enemy);
  return { symbols: s, diff };
}
