// Контроль времени: пуля, блиц, рапид; формат часов; сколько думать движку; скорость анимации.
import { Chess } from './chess.js';

export const TIME_CONTROLS = [
  { id: '1+0', base: 60, inc: 0, cat: 'bullet' },
  { id: '1+1', base: 60, inc: 1, cat: 'bullet' },
  { id: '2+1', base: 120, inc: 1, cat: 'bullet' },
  { id: '3+0', base: 180, inc: 0, cat: 'blitz' },
  { id: '3+2', base: 180, inc: 2, cat: 'blitz' },
  { id: '5+0', base: 300, inc: 0, cat: 'blitz' },
  { id: '5+5', base: 300, inc: 5, cat: 'blitz' },
  { id: '10+0', base: 600, inc: 0, cat: 'rapid' },
  { id: '10+10', base: 600, inc: 10, cat: 'rapid' },
  { id: '15+10', base: 900, inc: 10, cat: 'rapid' },
  { id: '20+0', base: 1200, inc: 0, cat: 'rapid' },
  { id: '30+0', base: 1800, inc: 0, cat: 'rapid' },
  { id: 'none', base: 0, inc: 0, cat: 'none' },
];

export const CATEGORIES = [
  { id: 'bullet', name: 'Пуля', icon: '⚡' },
  { id: 'blitz', name: 'Блиц', icon: '🔥' },
  { id: 'rapid', name: 'Рапид', icon: '⏱' },
  { id: 'none', name: 'Без времени', icon: '∞' },
];

export function timeControl(id) {
  return TIME_CONTROLS.find((t) => t.id === id) || TIME_CONTROLS.at(-1);
}

export function tcLabel(id) {
  const tc = timeControl(id);
  if (tc.cat === 'none') return 'Без времени';
  return `${tc.base / 60}${tc.inc ? ' + ' + tc.inc : ''} мин`;
}

// 4:05, 0:59, под 10 секунд — с десятыми: 0:09.4
export function formatClock(ms) {
  const t = Math.max(0, ms);
  if (t < 10000) return `0:0${Math.floor(t / 1000)}.${Math.floor((t % 1000) / 100)}`;
  const total = Math.ceil(t / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Мало времени: меньше 10 секунд или меньше 10% от начального.
export const isLowTime = (ms, baseSec) => ms < Math.max(10000, baseSec * 100);

// Сколько думать движку: около 1/35 оставшегося времени плюс большая часть добавки, но не дольше уровня.
export function engineBudget(remainingMs, incSec, levelMs) {
  const budget = remainingMs / 35 + incSec * 1000 * 0.8;
  return Math.max(30, Math.min(levelMs, Math.floor(budget), Math.max(30, remainingMs - 500)));
}

// Длительность анимации: auto подстраивается под контроль (в пуле — мгновенно, как на lichess).
const ANIM = { slow: 450, normal: 300, fast: 150, off: 0 };
export function animationMs(setting, cat = 'none') {
  if (setting !== 'auto') return ANIM[setting] ?? ANIM.normal;
  if (cat === 'bullet') return 0;
  if (cat === 'blitz') return 160;
  return ANIM.normal;
}

// Хватает ли стороне color материала, чтобы поставить мат (для проигрыша по времени).
// Упрощённо, как в большинстве приложений: только король или король с одной лёгкой фигурой — не хватает.
export function canMate(fen, color) {
  const g = new Chess(fen);
  const mine = g.pieces().filter((p) => p.color === color && p.type !== 'k');
  if (!mine.length) return false;
  if (mine.length === 1 && (mine[0].type === 'n' || mine[0].type === 'b')) return false;
  return true;
}

// Итог при падении флажка у стороны flagged: проигрыш или ничья, если у соперника нечем матовать.
export function flagResult(fen, flagged) {
  const opp = flagged === 'w' ? 'b' : 'w';
  if (!canMate(fen, opp)) return { result: '1/2-1/2', reason: 'timeout-draw' };
  return { result: flagged === 'w' ? '0-1' : '1-0', reason: 'timeout' };
}

/**
 * Сколько бот «думает» над ходом при игре на время — как человек, а не 0.5 с на каждый ход.
 * Около 1/30 оставшегося времени плюс добавка; в дебюте втрое быстрее; вынужденный ход — почти сразу;
 * случайный разброс ±40%. Никогда не больше 12% оставшегося времени.
 * remainingMs — время на часах бота, ply — номер полухода (0 — первый ход партии), legalMoves — сколько ходов есть.
 */
export function humanThinkMs({ remainingMs, incSec = 0, ply = 20, legalMoves = 20, random = Math.random }) {
  if (remainingMs <= 0) return 0;
  const floor = remainingMs < 20000 ? 120 : 300;
  if (legalMoves <= 1) return Math.min(floor + 300 * random(), remainingMs * 0.05);
  let t = remainingMs / 30 + incSec * 1000 * 0.9;
  if (ply < 10) t *= 0.3;
  else if (ply < 20) t *= 0.65;
  t *= 0.6 + 0.8 * random();
  return Math.round(Math.max(floor, Math.min(t, remainingMs * 0.12)));
}
