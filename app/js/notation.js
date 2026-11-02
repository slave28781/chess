// Показ ходов: английская (Nf3) или русская (Кf3) нотация.
const RU = { K: 'Кр', Q: 'Ф', R: 'Л', B: 'С', N: 'К' };

export function sanToRu(san) {
  if (!san) return san;
  return san
    .replace(/^([KQRBN])/, (m) => RU[m])
    .replace(/=([QRBN])/, (_, p) => '=' + RU[p])
    .replace(/^O-O-O/, '0-0-0')
    .replace(/^O-O/, '0-0');
}

export function makeFormatter(notation) {
  return notation === 'ru' ? sanToRu : (s) => s;
}

export const PIECE_SYMBOLS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
