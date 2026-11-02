// Автокомментарии к ходам. Только факты из анализа: ходы, материал, мат. fmt — показ хода (русская/английская нотация).
import { formatScore, mateFor } from './review.js';

const GEN = { p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя' };
const NOM = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь' };

const other = (c) => (c === 'w' ? 'b' : 'w');

function line(sans, fmt, n = 5) {
  return sans.slice(0, n).map(fmt).join(' ');
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const mateText = (n) => `мат в ${n} ${plural(n, 'ход', 'хода', 'ходов')}`;

function consequence(r, fmt) {
  const oppMate = mateFor(r.scoreAfter, other(r.color));
  if (oppMate) return `Теперь у соперника ${mateText(oppMate)}: ${line(r.replyLine, fmt)}.`;
  if (r.lostPiece) {
    const reply = r.replyLine[0] ? `: ${fmt(r.replyLine[0])}` : '';
    return `Теряется ${NOM[r.lostPiece.type]}${reply}.`;
  }
  const missedMate = mateFor(r.scoreBefore, r.color);
  if (missedMate) return `Был ${mateText(missedMate)}: ${line(r.bestLine, fmt)}.`;
  return `Оценка: ${formatScore(r.scoreBefore)} → ${formatScore(r.scoreAfter)}.`;
}

function better(r, fmt) {
  if (!r.bestSan) return '';
  const rest = r.bestLine.length > 1 ? ` (${line(r.bestLine, fmt)})` : '';
  return `${fmt(r.bestSan)}${rest}`;
}

export function moveComment(r, fmt = (s) => s) {
  const myMate = mateFor(r.scoreAfter, r.color);
  const mateNote = myMate ? ` Впереди ${mateText(myMate)}${r.replyLine.length ? ': ' + line(r.replyLine, fmt) : ''}.` : '';
  switch (r.cls) {
    case 'book':
      return r.opening ? `Теория: ${r.opening}.` : 'Теоретический ход.';
    case 'forced':
      return 'Единственный возможный ход.';
    case 'brilliant':
      return `Блестящая жертва ${GEN[r.sacrifice.type]}! Брать опасно для соперника.${mateNote || (r.replyLine.length ? ` Лучшее продолжение: ${line(r.replyLine, fmt)}.` : '')}`;
    case 'great':
      return `Единственный сильный ход — остальные заметно ухудшали позицию.${mateNote}`;
    case 'best':
      return `Лучший ход.${mateNote}`;
    case 'excellent':
      return r.bestSan && r.bestSan !== r.san ? `Очень хороший ход. Движок чуть больше любит ${fmt(r.bestSan)}.${mateNote}` : `Очень хороший ход.${mateNote}`;
    case 'good':
      return `Хороший ход. Точнее было ${better(r, fmt)}.`;
    case 'inaccuracy':
      return `Неточность. Лучше ${better(r, fmt)}.`;
    case 'mistake':
      return `Ошибка. ${consequence(r, fmt)} Лучше было ${better(r, fmt)}.`;
    case 'blunder':
      return `Зевок! ${consequence(r, fmt)} Нужно было ${better(r, fmt)}.`;
    case 'miss': {
      const mate = mateFor(r.scoreBefore, r.color);
      const chance = mate ? `Был ${mateText(mate)}: ${line(r.bestLine, fmt)}.` : `Сильнее было ${better(r, fmt)}.`;
      return `Упущение: соперник ошибся, но шанс не использован. ${chance}`;
    }
    default:
      return '';
  }
}
