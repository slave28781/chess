// Комментарии к ходам и итоги партии. Только факты из анализа: ходы, материал, тактика, мат.
// fmt — как показывать ход (русская или английская нотация).
import { Chess, PIECE_VALUES } from './chess.js';
import { formatScore, mateFor, CLASSES } from './review.js';

const GEN = { p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля' };
const NOM = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
const ACC = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' };

const other = (c) => (c === 'w' ? 'b' : 'w');
const sideName = (c) => (c === 'w' ? 'белых' : 'чёрных');

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

// Сколько материала (в пешках) выигрывает сторона color, если сыграть линию ucis (не длиннее maxPlies).
// Если линия обрывается на взятии, учитывается ответное взятие (размен на последнем поле).
export function lineGain(fen, ucis, color, maxPlies = 6) {
  if (!ucis || !ucis.length) return 0;
  const g = new Chess(fen);
  const diff = () => g.material(color) - g.material(other(color));
  const start = diff();
  let last = null;
  for (const u of ucis.slice(0, maxPlies)) {
    const mv = g.move(u);
    if (!mv) break;
    last = mv;
  }
  if (!last) return 0;
  let end = diff();
  if (last.captured) {
    const s = g.see(last.to);
    if (s > 0) end += g.turn() === color ? s : -s;
  }
  return end - start;
}

export function materialWord(n) {
  if (n >= 8) return 'ферзя';
  if (n >= 5) return 'ладью';
  if (n >= 3) return 'фигуру';
  if (n === 2) return 'две пешки';
  return 'пешку';
}

// Вилка: фигура, сделавшая ход reply, бьёт сразу две ценные цели (король, более ценные или незащищённые фигуры).
export function findFork(fenAfter, square) {
  const g = new Chess(fenAfter);
  const attacker = g.get(square);
  if (!attacker || attacker.type === 'k') return null;
  const av = PIECE_VALUES[attacker.type];
  const targets = [];
  for (const sq of g.attacksFrom(square)) {
    const v = g.get(sq);
    if (!v || v.color === attacker.color || v.type === 'p') continue;
    const valuable = v.type === 'k' || PIECE_VALUES[v.type] > av || g.see(sq, attacker.color) > 0;
    if (valuable) targets.push(v.type);
  }
  if (targets.length < 2) return null;
  return { piece: attacker.type, targets: targets.sort((a, b) => (b === 'k') - (a === 'k') || PIECE_VALUES[b] - PIECE_VALUES[a]).slice(0, 2) };
}

// Что делает ход: взятие, рокировка, шах, развитие, центр, нападение.
export function whatMove(r) {
  const g = new Chess(r.fenBefore);
  const mover = g.turn();
  const threatenedBefore = new Set(g.threatenedPieces(other(mover)).filter((p) => p.gain >= 2).map((p) => p.square));
  const mv = g.move(r.uci);
  if (!mv) return '';
  if (mv.san.endsWith('#')) return 'Мат!';
  const parts = [];
  if (mv.flags.includes('k') || mv.flags.includes('q')) parts.push('Рокировка — король уходит в безопасное место');
  else if (mv.promotion) parts.push(`Пешка превращается в ${mv.promotion === 'q' ? 'ферзя' : ACC[mv.promotion]}`);
  else if (mv.captured) {
    const recapture = r.prevUci && r.prevUci.slice(2, 4) === mv.to && r.prevSan && r.prevSan.includes('x');
    parts.push(`${recapture ? 'Отыгрывает' : 'Забирает'} ${ACC[mv.captured]}`);
  } else if (r.ply < 20 && (mv.piece === 'n' || mv.piece === 'b') && (mv.from[1] === (mover === 'w' ? '1' : '8'))) {
    parts.push('Развивает фигуру');
  } else if (r.ply < 16 && mv.piece === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(mv.to)) {
    parts.push('Борется за центр');
  }
  if (mv.san.endsWith('+')) parts.push('шах');
  const attacked = g.threatenedPieces(other(mover)).filter((p) => p.gain >= 2 && !threatenedBefore.has(p.square));
  if (attacked.length && !mv.san.endsWith('+')) parts.push(`нападает на ${ACC[attacked[0].type]}`);
  if (!parts.length) return '';
  const s = parts.join(', ');
  return s[0].toUpperCase() + s.slice(1) + '.';
}

// Оценка позиции словами (от лица белых).
export function evalWords(score) {
  if (!score || score.mated) return '';
  if (typeof score.mate === 'number') return `У ${sideName(score.mate > 0 ? 'w' : 'b')} форсированный мат.`;
  const cp = score.cp, side = cp > 0 ? 'w' : 'b', a = Math.abs(cp);
  if (a < 35) return 'Позиция примерно равная.';
  if (a < 110) return `У ${sideName(side)} небольшой перевес.`;
  if (a < 300) return `У ${sideName(side)} заметный перевес.`;
  return `У ${sideName(side)} решающее преимущество.`;
}

// Почему ход плохой: мат, вилка, потеря фигуры, проигрыш материала, падение оценки.
function consequence(r, fmt) {
  const opp = other(r.color);
  const oppMate = mateFor(r.scoreAfter, opp);
  if (oppMate) return `Теперь у соперника ${mateText(oppMate)}: ${line(r.replyLine, fmt)}.`;
  const reply = r.replyPv && r.replyPv[0];
  if (reply) {
    const g = new Chess(r.fenAfter);
    const mv = g.move(reply);
    if (mv) {
      const fork = findFork(g.fen(), mv.to);
      if (fork) return `Соперник ставит вилку: ${fmt(mv.san)} — ${NOM[fork.piece]} нападает на ${ACC[fork.targets[0]]} и ${ACC[fork.targets[1]]}.`;
    }
  }
  if (r.lostPiece) {
    const rep = r.replyLine[0] ? `: ${fmt(r.replyLine[0])}` : '';
    return `Теряется ${NOM[r.lostPiece.type]}${rep}.`;
  }
  const gain = lineGain(r.fenAfter, r.replyPv, opp);
  if (gain >= 1) return `Соперник выигрывает ${materialWord(gain)}: ${line(r.replyLine, fmt, 4)}.`;
  return `Оценка: ${formatScore(r.scoreBefore)} → ${formatScore(r.scoreAfter)}.`;
}

// Что было лучше и почему.
function betterMove(r, fmt, lead) {
  if (!r.bestSan) return '';
  const best = fmt(r.bestSan);
  const rest = r.bestLine.length > 1 ? ` (${line(r.bestLine, fmt)})` : '';
  const mate = mateFor(r.scoreBefore, r.color);
  if (mate) return `${lead} ${best}: был ${mateText(mate)} — ${line(r.bestLine, fmt, 7)}.`;
  const gain = lineGain(r.fenBefore, r.bestPv, r.color);
  if (gain >= 1) return `${lead} ${best} — выигрывает ${materialWord(gain)}${rest}.`;
  const w = r.winBefore;
  const why = w >= 75 ? 'сохраняло большой перевес' : w >= 58 ? 'сохраняло перевес' : w >= 42 ? 'держало равенство' : 'давало лучшие шансы на защиту';
  return `${lead} ${best}${rest} — ${why}.`;
}

export function moveComment(r, fmt = (s) => s) {
  const myMate = mateFor(r.scoreAfter, r.color);
  const mateNote = myMate ? ` Впереди ${mateText(myMate)}${r.replyLine.length ? ': ' + line(r.replyLine, fmt) : ''}.` : '';
  const what = whatMove(r);
  const pos = myMate ? '' : evalWords(r.scoreAfter);
  const join = (...xs) => xs.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  switch (r.cls) {
    case 'book':
      return join(r.opening ? `Теория: ${r.opening}.` : 'Теоретический ход.', what);
    case 'forced':
      return 'Единственный возможный ход.';
    case 'brilliant':
      return join(`Блестящая жертва ${GEN[r.sacrifice.type]}! Брать опасно для соперника.`, mateNote || (r.replyLine.length ? `Лучшее продолжение: ${line(r.replyLine, fmt)}.` : ''), pos);
    case 'great':
      return join('Замечательный ход — единственный, который держит позицию.', what, mateNote, pos);
    case 'best':
      return join('Сильнейший ход.', what, mateNote, pos);
    case 'excellent':
      return join('Отличный ход.', what, r.bestSan && r.bestSan !== r.san ? `Движок чуть больше любит ${fmt(r.bestSan)}.` : '', mateNote, pos);
    case 'good':
      return join('Хороший ход.', what, betterMove(r, fmt, 'Точнее'));
    case 'inaccuracy':
      return join('Неточность.', what, betterMove(r, fmt, 'Лучше'), `Оценка: ${formatScore(r.scoreBefore)} → ${formatScore(r.scoreAfter)}.`);
    case 'mistake':
      return join('Ошибка.', consequence(r, fmt), betterMove(r, fmt, 'Лучше было'));
    case 'blunder':
      return join('Зевок!', consequence(r, fmt), betterMove(r, fmt, 'Нужно было'));
    case 'miss':
      return join('Упущенная возможность: соперник ошибся, но шанс не использован.', betterMove(r, fmt, 'Сильнее было'), pos);
    default:
      return '';
  }
}

export function moveLabel(r, fmt = (s) => s) {
  const c = new Chess(r.fenBefore);
  const n = c.moveNumber();
  return (c.turn() === 'w' ? `${n}. ` : `${n}… `) + fmt(r.san) + (r.cls && CLASSES[r.cls] && ['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder', 'miss'].includes(r.cls) ? CLASSES[r.cls].short.replace('✗', '?') : '');
}

// Итоги партии: дебют, точность и ошибки каждой стороны, перелом, лучший момент.
export function gameSummary(data, names = {}, fmt = (s) => s) {
  const out = [];
  if (data.opening) out.push(`Дебют: ${data.opening}.`);
  for (const c of ['w', 'b']) {
    const s = data.summary[c];
    if (!s || s.accuracy === null) continue;
    const errs = [];
    if (s.counts.blunder) errs.push(`${s.counts.blunder} ${plural(s.counts.blunder, 'зевок', 'зевка', 'зевков')}`);
    if (s.counts.mistake) errs.push(`${s.counts.mistake} ${plural(s.counts.mistake, 'ошибка', 'ошибки', 'ошибок')}`);
    if (s.counts.miss) errs.push(`${s.counts.miss} ${plural(s.counts.miss, 'упущение', 'упущения', 'упущений')}`);
    if (s.counts.inaccuracy) errs.push(`${s.counts.inaccuracy} ${plural(s.counts.inaccuracy, 'неточность', 'неточности', 'неточностей')}`);
    const name = names[c] || (c === 'w' ? 'Белые' : 'Чёрные');
    out.push(`${name}: точность ${s.accuracy.toFixed(1)}%, ${errs.length ? errs.join(', ') : 'без ошибок'}.`);
  }
  const bad = data.moves.filter((m) => ['blunder', 'mistake', 'miss'].includes(m.cls)).sort((a, b) => b.loss - a.loss)[0];
  if (bad) {
    const after = evalWords(bad.scoreAfter).replace(/\.$/, '').toLowerCase();
    out.push(`Перелом: ${moveLabel(bad, fmt)}${after ? ` — после него ${after}` : ''}.`);
  }
  const shine = data.moves.find((m) => m.cls === 'brilliant') || data.moves.find((m) => m.cls === 'great');
  if (shine) out.push(`Лучший момент: ${moveLabel(shine, fmt)} — ${shine.cls === 'brilliant' ? `блестящая жертва ${GEN[shine.sacrifice.type]}` : 'единственный сильный ход'}.`);
  return out;
}

