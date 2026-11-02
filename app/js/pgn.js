// Чтение и запись PGN. Читает первую партию из текста; варианты в скобках пропускает.
import { Chess, START_FEN } from './chess.js';

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const SUFFIX_NAG = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
const ROSTER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];

const MOVE_RE = /^(?:[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[NBRQ])?|O-O(?:-O)?|0-0(?:-0)?|[a-h][1-8][a-h][1-8][qrbn]?)[+#]?$/;

// Русская нотация → английская: Кр→K, Ф→Q, Л→R, С→B, К→N, кириллические «х», «а», «с», «е» → латиница.
export function ruToEn(word) {
  return word
    .replace(/Кр/g, 'K').replace(/Ф/g, 'Q').replace(/Л/g, 'R').replace(/С/g, 'B').replace(/К/g, 'N')
    .replace(/[хХ]/g, 'x').replace(/а/g, 'a').replace(/с/g, 'c').replace(/е/g, 'e');
}

function cleanComment(text) {
  return text.replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}

// → { headers, startFen, moves: [{ san, uci, comment, nag }], result, intro }
export function parsePgn(text) {
  const src = String(text).replace(/\r\n?/g, '\n');
  const headers = {};
  const tokens = [];
  let i = 0, depth = 0, seenMove = false;

  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '[' && depth === 0) {
      if (seenMove) break; // начало следующей партии
      const end = src.indexOf(']', i);
      if (end < 0) break;
      const m = src.slice(i + 1, end).match(/^\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*$/);
      if (m) headers[m[1]] = m[2].replace(/\\(.)/g, '$1');
      i = end + 1;
      continue;
    }
    if (ch === '{') {
      const end = src.indexOf('}', i);
      const body = src.slice(i + 1, end < 0 ? src.length : end);
      if (depth === 0) tokens.push({ type: 'comment', text: cleanComment(body) });
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (ch === ';') {
      const end = src.indexOf('\n', i);
      const body = src.slice(i + 1, end < 0 ? src.length : end);
      if (depth === 0) tokens.push({ type: 'comment', text: cleanComment(body) });
      i = end < 0 ? src.length : end;
      continue;
    }
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); i++; continue; }
    let j = i;
    while (j < src.length && !/[\s{}();[\]]/.test(src[j])) j++;
    if (j === i) { i++; continue; }
    const word = src.slice(i, j);
    i = j;
    if (depth > 0) continue;
    if (RESULTS.has(word)) { tokens.push({ type: 'result', text: word }); if (seenMove) break; continue; }
    if (/^\$\d+$/.test(word)) { tokens.push({ type: 'nag', nag: Number(word.slice(1)) }); continue; }
    const w = word.replace(/^\d+\.(\.\.)?/, '').replace(/^\.+/, '');
    if (!w || /^\d+\.*$/.test(w)) continue;
    const sm = w.match(/^(.*?)([!?]{1,2})?$/);
    const san = ruToEn(sm[1]).replace(/e\.p\.$/, '');
    if (!MOVE_RE.test(san)) {
      if (seenMove) throw new Error(`Непонятная запись «${word}»`);
      continue; // текст до первого хода пропускаем
    }
    tokens.push({ type: 'move', san, nag: sm[2] ? SUFFIX_NAG[sm[2]] : undefined });
    seenMove = true;
  }

  const startFen = headers.FEN || START_FEN;
  const game = new Chess(startFen);
  const moves = [];
  let result = headers.Result && RESULTS.has(headers.Result) ? headers.Result : '*';
  let intro = '';
  for (const t of tokens) {
    if (t.type === 'move') {
      const mv = game.move(t.san);
      if (!mv) {
        const num = game.moveNumber() + (game.turn() === 'w' ? '.' : '...');
        throw new Error(`Ход ${num} «${t.san}» невозможен в этой позиции`);
      }
      moves.push({ san: mv.san, uci: mv.uci, comment: '', nag: t.nag });
    } else if (t.type === 'comment' && t.text) {
      if (moves.length) {
        const last = moves[moves.length - 1];
        last.comment = last.comment ? last.comment + ' ' + t.text : t.text;
      } else {
        intro = intro ? intro + ' ' + t.text : t.text;
      }
    } else if (t.type === 'nag' && moves.length) {
      moves[moves.length - 1].nag = t.nag;
    } else if (t.type === 'result') {
      result = t.text;
    }
  }
  if (!moves.length) throw new Error('В тексте не найдено ни одного хода');
  return { headers, startFen, moves, result, intro };
}

function escapeHeader(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeComment(v) {
  return String(v).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

// game: { headers, startFen, moves: [{ san, comment, nag }], result }
export function writePgn(game) {
  const headers = { ...(game.headers || {}) };
  const result = game.result || headers.Result || '*';
  headers.Result = result;
  const startFen = game.startFen || START_FEN;
  if (startFen !== START_FEN) { headers.SetUp = '1'; headers.FEN = startFen; } else { delete headers.SetUp; delete headers.FEN; }
  const defaults = { Event: '?', Site: '?', Date: '????.??.??', Round: '?', White: '?', Black: '?' };
  const lines = [];
  for (const k of ROSTER) lines.push(`[${k} "${escapeHeader(headers[k] ?? defaults[k])}"]`);
  for (const [k, v] of Object.entries(headers)) if (!ROSTER.includes(k)) lines.push(`[${k} "${escapeHeader(v)}"]`);

  const parts = [];
  const pos = new Chess(startFen);
  let moveNo = pos.moveNumber();
  let white = pos.turn() === 'w';
  let needNumber = true;
  for (const mv of game.moves) {
    if (white) parts.push(`${moveNo}.`);
    else if (needNumber) parts.push(`${moveNo}...`);
    parts.push(mv.san + (mv.nag ? ` $${mv.nag}` : ''));
    needNumber = false;
    const comment = mv.comment ? escapeComment(mv.comment) : '';
    if (comment) {
      // Слова по отдельности, чтобы длинный комментарий переносился по строкам.
      const words = comment.split(' ');
      words[0] = '{' + words[0];
      words[words.length - 1] += '}';
      parts.push(...words);
      needNumber = true;
    }
    if (!white) moveNo++;
    white = !white;
  }
  parts.push(result);

  const text = [];
  let line = '';
  for (const p of parts) {
    if (line && line.length + 1 + p.length > 80) { text.push(line); line = p; } else line = line ? line + ' ' + p : p;
  }
  if (line) text.push(line);
  return lines.join('\n') + '\n\n' + text.join('\n') + '\n';
}
