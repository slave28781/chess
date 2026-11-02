// Правила шахмат: генерация ходов (доска 0x88), FEN, SAN, конец партии, размен (SEE).
// Без зависимостей. Внутри ходы — целые числа, наружу отдаются объекты.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const WHITE = 8, BLACK = 16;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const TYPE_CHARS = ' pnbrqk';
export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const VALUES = [0, 1, 3, 3, 5, 9, 100];

const F_CAPTURE = 1, F_DOUBLE = 2, F_EP = 4, F_KCASTLE = 8, F_QCASTLE = 16, F_PROMO = 32;

const KNIGHT_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
const BISHOP_DIR = [15, 17, -15, -17];
const ROOK_DIR = [16, -16, 1, -1];

const FILES = 'abcdefgh';
const sqName = (s) => FILES[s & 7] + ((s >> 4) + 1);
const sqIndex = (n) => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97);
const isSquareName = (n) => typeof n === 'string' && /^[a-h][1-8]$/.test(n);

const mk = (from, to, flags, promo = 0) => from | (to << 7) | (flags << 14) | (promo << 20);
const mFrom = (m) => m & 127;
const mTo = (m) => (m >> 7) & 127;
const mFlags = (m) => (m >> 14) & 63;
const mPromo = (m) => (m >> 20) & 7;

// Права рокировки: 1 = белые O-O, 2 = белые O-O-O, 4 = чёрные O-O, 8 = чёрные O-O-O.
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[sqIndex('e1')] = 12; CASTLE_MASK[sqIndex('h1')] = 14; CASTLE_MASK[sqIndex('a1')] = 13;
CASTLE_MASK[sqIndex('e8')] = 3; CASTLE_MASK[sqIndex('h8')] = 11; CASTLE_MASK[sqIndex('a8')] = 7;

// Самый дешёвый атакующий фигурой цвета side на поле sq (для SEE). -1, если нет.
function leastAttacker(b, sq, side) {
  const pawn = side | PAWN;
  for (const o of side === WHITE ? [-15, -17] : [15, 17]) {
    const s = sq + o;
    if (!(s & 0x88) && b[s] === pawn) return s;
  }
  for (const o of KNIGHT_OFF) {
    const s = sq + o;
    if (!(s & 0x88) && b[s] === (side | KNIGHT)) return s;
  }
  let queen = -1;
  for (const d of BISHOP_DIR) {
    for (let s = sq + d; !(s & 0x88); s += d) {
      const p = b[s];
      if (!p) continue;
      if (p === (side | BISHOP)) return s;
      if (p === (side | QUEEN) && queen < 0) queen = s;
      break;
    }
  }
  let rook = -1;
  for (const d of ROOK_DIR) {
    for (let s = sq + d; !(s & 0x88); s += d) {
      const p = b[s];
      if (!p) continue;
      if (p === (side | ROOK) && rook < 0) rook = s;
      if (p === (side | QUEEN) && queen < 0) queen = s;
      break;
    }
  }
  if (rook >= 0) return rook;
  if (queen >= 0) return queen;
  for (const o of KING_OFF) {
    const s = sq + o;
    if (!(s & 0x88) && b[s] === (side | KING)) return s;
  }
  return -1;
}

export class Chess {
  constructor(fen = START_FEN) {
    this.load(fen);
  }

  // ---------- FEN ----------
  load(fen) {
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4) throw new Error('Некорректный FEN: мало полей');
    const b = new Uint8Array(128);
    const kings = [-1, -1];
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Некорректный FEN: нужно 8 горизонталей');
    for (let r = 0; r < 8; r++) {
      let file = 0;
      const rank = 7 - r;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { file += Number(ch); continue; }
        const t = TYPE_CHARS.indexOf(ch.toLowerCase());
        if (t <= 0 || file > 7) throw new Error('Некорректный FEN: символ «' + ch + '»');
        const color = ch === ch.toUpperCase() ? WHITE : BLACK;
        const sq = rank * 16 + file;
        b[sq] = color | t;
        if (t === KING) {
          if (kings[color === WHITE ? 0 : 1] >= 0) throw new Error('Некорректный FEN: два короля одного цвета');
          kings[color === WHITE ? 0 : 1] = sq;
        }
        if (t === PAWN && (rank === 0 || rank === 7)) throw new Error('Некорректный FEN: пешка на крайней горизонтали');
        file++;
      }
      if (file !== 8) throw new Error('Некорректный FEN: в горизонтали не 8 полей');
    }
    if (kings[0] < 0 || kings[1] < 0) throw new Error('Некорректный FEN: нет короля');
    if (parts[1] !== 'w' && parts[1] !== 'b') throw new Error('Некорректный FEN: очередь хода');
    let castling = 0;
    if (parts[2] !== '-') {
      for (const ch of parts[2]) {
        const bit = { K: 1, Q: 2, k: 4, q: 8 }[ch];
        if (!bit) throw new Error('Некорректный FEN: рокировка');
        castling |= bit;
      }
    }
    // Права рокировки без короля и ладьи на местах не имеют смысла — убираем.
    if (b[4] !== (WHITE | KING)) castling &= ~3;
    if (b[7] !== (WHITE | ROOK)) castling &= ~1;
    if (b[0] !== (WHITE | ROOK)) castling &= ~2;
    if (b[0x74] !== (BLACK | KING)) castling &= ~12;
    if (b[0x77] !== (BLACK | ROOK)) castling &= ~4;
    if (b[0x70] !== (BLACK | ROOK)) castling &= ~8;
    let ep = -1;
    if (parts[3] !== '-') {
      if (!isSquareName(parts[3])) throw new Error('Некорректный FEN: поле взятия на проходе');
      ep = sqIndex(parts[3]);
    }
    this._board = b;
    this._kings = kings;
    this._turn = parts[1] === 'w' ? WHITE : BLACK;
    this._castling = castling;
    this._ep = ep;
    this._half = Math.max(0, parseInt(parts[4], 10) || 0);
    this._full = Math.max(1, parseInt(parts[5], 10) || 1);
    this._stack = [];
    this._history = [];
    if (this._attacked(this._kings[this._turn === WHITE ? 1 : 0], this._turn)) {
      throw new Error('Невозможная позиция: король стороны, которая не ходит, под шахом');
    }
    this._keys = [this._key()];
    this._startFen = this.fen();
    return this;
  }

  fen() {
    let s = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this._board[rank * 16 + file];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        const ch = TYPE_CHARS[p & 7];
        s += p & WHITE ? ch.toUpperCase() : ch;
      }
      if (empty) s += empty;
      if (rank) s += '/';
    }
    let c = '';
    if (this._castling & 1) c += 'K';
    if (this._castling & 2) c += 'Q';
    if (this._castling & 4) c += 'k';
    if (this._castling & 8) c += 'q';
    return `${s} ${this._turn === WHITE ? 'w' : 'b'} ${c || '-'} ${this._epFen()} ${this._half} ${this._full}`;
  }

  // Поле взятия на проходе пишем, только если взять действительно можно (как lichess).
  _epFen() {
    if (this._ep < 0) return '-';
    const pawn = this._turn | PAWN;
    const offs = this._turn === WHITE ? [-15, -17] : [15, 17];
    for (const o of offs) {
      const s = this._ep + o;
      if (!(s & 0x88) && this._board[s] === pawn) return sqName(this._ep);
    }
    return '-';
  }

  _key() {
    return this.fen().split(' ').slice(0, 4).join(' ');
  }

  startFen() { return this._startFen; }

  // ---------- Доступ к позиции ----------
  turn() { return this._turn === WHITE ? 'w' : 'b'; }
  moveNumber() { return this._full; }

  get(square) {
    const p = this._board[sqIndex(square)];
    return p ? { type: TYPE_CHARS[p & 7], color: p & WHITE ? 'w' : 'b' } : null;
  }

  pieces() {
    const res = [];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = this._board[sq];
      if (p) res.push({ square: sqName(sq), type: TYPE_CHARS[p & 7], color: p & WHITE ? 'w' : 'b' });
    }
    return res;
  }

  kingSquare(color) { return sqName(this._kings[color === 'w' ? 0 : 1]); }

  // ---------- Атаки ----------
  _attacked(sq, by) {
    const b = this._board;
    const pawn = by | PAWN;
    for (const o of by === WHITE ? [-15, -17] : [15, 17]) {
      const s = sq + o;
      if (!(s & 0x88) && b[s] === pawn) return true;
    }
    for (const o of KNIGHT_OFF) {
      const s = sq + o;
      if (!(s & 0x88) && b[s] === (by | KNIGHT)) return true;
    }
    for (const o of KING_OFF) {
      const s = sq + o;
      if (!(s & 0x88) && b[s] === (by | KING)) return true;
    }
    for (const d of BISHOP_DIR) {
      for (let s = sq + d; !(s & 0x88); s += d) {
        const p = b[s];
        if (!p) continue;
        if (p === (by | BISHOP) || p === (by | QUEEN)) return true;
        break;
      }
    }
    for (const d of ROOK_DIR) {
      for (let s = sq + d; !(s & 0x88); s += d) {
        const p = b[s];
        if (!p) continue;
        if (p === (by | ROOK) || p === (by | QUEEN)) return true;
        break;
      }
    }
    return false;
  }

  isAttacked(square, byColor) {
    return this._attacked(sqIndex(square), byColor === 'w' ? WHITE : BLACK);
  }

  _inCheck() {
    return this._attacked(this._kings[this._turn === WHITE ? 0 : 1], this._turn ^ 24);
  }

  inCheck() { return this._inCheck(); }

  // ---------- Генерация ходов ----------
  _addPawn(out, from, to, flags, promoRank) {
    if ((to >> 4) === promoRank) {
      for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) out.push(mk(from, to, flags | F_PROMO, pr));
    } else {
      out.push(mk(from, to, flags));
    }
  }

  _genPseudo(out) {
    const b = this._board, us = this._turn, them = us ^ 24;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p || !(p & us)) continue;
      const t = p & 7;
      if (t === PAWN) {
        const fwd = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const promoRank = us === WHITE ? 7 : 0;
        const one = sq + fwd;
        if (!(one & 0x88) && !b[one]) {
          this._addPawn(out, sq, one, 0, promoRank);
          if ((sq >> 4) === startRank && !b[one + fwd]) out.push(mk(sq, one + fwd, F_DOUBLE));
        }
        for (const c of us === WHITE ? [15, 17] : [-15, -17]) {
          const to = sq + c;
          if (to & 0x88) continue;
          if (b[to] & them) this._addPawn(out, sq, to, F_CAPTURE, promoRank);
          else if (to === this._ep && !b[to]) out.push(mk(sq, to, F_CAPTURE | F_EP));
        }
      } else if (t === KNIGHT || t === KING) {
        for (const o of t === KNIGHT ? KNIGHT_OFF : KING_OFF) {
          const to = sq + o;
          if (to & 0x88) continue;
          const q = b[to];
          if (!q) out.push(mk(sq, to, 0));
          else if (q & them) out.push(mk(sq, to, F_CAPTURE));
        }
      } else {
        const dirs = t === BISHOP ? BISHOP_DIR : t === ROOK ? ROOK_DIR : KING_OFF;
        for (const d of dirs) {
          for (let to = sq + d; !(to & 0x88); to += d) {
            const q = b[to];
            if (!q) { out.push(mk(sq, to, 0)); continue; }
            if (q & them) out.push(mk(sq, to, F_CAPTURE));
            break;
          }
        }
      }
    }
    // Рокировки: поля между королём и ладьёй пусты, король не проходит через битые поля.
    const base = us === WHITE ? 0 : 0x70;
    const kBit = us === WHITE ? 1 : 4, qBit = us === WHITE ? 2 : 8;
    if ((this._castling & kBit) && !b[base + 5] && !b[base + 6] &&
        !this._attacked(base + 4, them) && !this._attacked(base + 5, them) && !this._attacked(base + 6, them)) {
      out.push(mk(base + 4, base + 6, F_KCASTLE));
    }
    if ((this._castling & qBit) && !b[base + 3] && !b[base + 2] && !b[base + 1] &&
        !this._attacked(base + 4, them) && !this._attacked(base + 3, them) && !this._attacked(base + 2, them)) {
      out.push(mk(base + 4, base + 2, F_QCASTLE));
    }
  }

  _make(m) {
    const b = this._board, us = this._turn;
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const piece = b[from];
    let captured = b[to];
    if (fl & F_EP) {
      const capSq = us === WHITE ? to - 16 : to + 16;
      captured = b[capSq];
      b[capSq] = 0;
    }
    this._stack.push({ m, captured, castling: this._castling, ep: this._ep, half: this._half });
    b[to] = promo ? (us | promo) : piece;
    b[from] = 0;
    if (fl & F_KCASTLE) { b[to - 1] = b[to + 1]; b[to + 1] = 0; }
    if (fl & F_QCASTLE) { b[to + 1] = b[to - 2]; b[to - 2] = 0; }
    if ((piece & 7) === KING) this._kings[us === WHITE ? 0 : 1] = to;
    this._castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this._ep = fl & F_DOUBLE ? (from + to) >> 1 : -1;
    this._half = (piece & 7) === PAWN || captured ? 0 : this._half + 1;
    if (us === BLACK) this._full++;
    this._turn = us ^ 24;
  }

  _unmake() {
    const u = this._stack.pop();
    const m = u.m, from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    this._turn ^= 24;
    const us = this._turn, b = this._board;
    if (us === BLACK) this._full--;
    const piece = promo ? (us | PAWN) : b[to];
    b[from] = piece;
    if (fl & F_EP) {
      b[to] = 0;
      b[us === WHITE ? to - 16 : to + 16] = u.captured;
    } else {
      b[to] = u.captured;
    }
    if (fl & F_KCASTLE) { b[to + 1] = b[to - 1]; b[to - 1] = 0; }
    if (fl & F_QCASTLE) { b[to - 2] = b[to + 1]; b[to + 1] = 0; }
    if ((piece & 7) === KING) this._kings[us === WHITE ? 0 : 1] = from;
    this._castling = u.castling;
    this._ep = u.ep;
    this._half = u.half;
  }

  _legal() {
    const pseudo = [];
    this._genPseudo(pseudo);
    const us = this._turn, ki = us === WHITE ? 0 : 1, res = [];
    for (const m of pseudo) {
      this._make(m);
      if (!this._attacked(this._kings[ki], us ^ 24)) res.push(m);
      this._unmake();
    }
    return res;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const moves = this._legal();
    if (depth === 1) return moves.length;
    let n = 0;
    for (const m of moves) {
      this._make(m);
      n += this.perft(depth - 1);
      this._unmake();
    }
    return n;
  }

  // ---------- SAN ----------
  _san(m, legal, withSuffix = true) {
    const b = this._board;
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const piece = b[from], t = piece & 7;
    let s;
    if (fl & F_KCASTLE) s = 'O-O';
    else if (fl & F_QCASTLE) s = 'O-O-O';
    else if (t === PAWN) {
      s = fl & F_CAPTURE ? FILES[from & 7] + 'x' + sqName(to) : sqName(to);
      if (promo) s += '=' + TYPE_CHARS[promo].toUpperCase();
    } else {
      s = TYPE_CHARS[t].toUpperCase();
      let ambiguous = false, sameFile = false, sameRank = false;
      for (const o of legal) {
        const of = mFrom(o);
        if (o === m || of === from || mTo(o) !== to || b[of] !== piece) continue;
        ambiguous = true;
        if ((of & 7) === (from & 7)) sameFile = true;
        if ((of >> 4) === (from >> 4)) sameRank = true;
      }
      if (ambiguous) {
        if (!sameFile) s += FILES[from & 7];
        else if (!sameRank) s += (from >> 4) + 1;
        else s += sqName(from);
      }
      if (fl & F_CAPTURE) s += 'x';
      s += sqName(to);
    }
    if (withSuffix) {
      this._make(m);
      if (this._inCheck()) s += this._legal().length ? '+' : '#';
      this._unmake();
    }
    return s;
  }

  _toObject(m, san) {
    const b = this._board;
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const piece = b[from];
    let captured;
    if (fl & F_EP) captured = 'p';
    else if (b[to]) captured = TYPE_CHARS[b[to] & 7];
    let flags = '';
    if (fl & F_EP) flags += 'e';
    else if (fl & F_CAPTURE) flags += 'c';
    if (fl & F_DOUBLE) flags += 'b';
    if (fl & F_KCASTLE) flags += 'k';
    if (fl & F_QCASTLE) flags += 'q';
    if (fl & F_PROMO) flags += 'p';
    const obj = {
      color: piece & WHITE ? 'w' : 'b',
      from: sqName(from),
      to: sqName(to),
      piece: TYPE_CHARS[piece & 7],
      san,
      uci: sqName(from) + sqName(to) + (promo ? TYPE_CHARS[promo] : ''),
      flags,
    };
    if (captured) obj.captured = captured;
    if (promo) obj.promotion = TYPE_CHARS[promo];
    return obj;
  }

  moves(opts = {}) {
    const legal = this._legal();
    const filtered = opts.square ? legal.filter((m) => sqName(mFrom(m)) === opts.square) : legal;
    return filtered.map((m) => this._toObject(m, this._san(m, legal)));
  }

  movesCount() { return this._legal().length; }

  _find(input) {
    const legal = this._legal();
    if (input && typeof input === 'object') {
      const promo = input.promotion ? TYPE_CHARS.indexOf(input.promotion) : 0;
      return legal.find((m) => sqName(mFrom(m)) === input.from && sqName(mTo(m)) === input.to &&
        (mPromo(m) === promo || (!promo && mPromo(m) === QUEEN))) ?? null;
    }
    const str = String(input).trim();
    const uci = str.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (uci) return this._find({ from: uci[1], to: uci[2], promotion: uci[3] });
    const clean = str
      .replace(/(e\.p\.|[+#!?]+)+$/g, '')
      .replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O')
      .replace(/^o-o-o$/i, 'O-O-O').replace(/^o-o$/i, 'O-O');
    for (const m of legal) if (this._san(m, legal, false) === clean) return m;
    // Нестрогий разбор: лишнее уточнение (Ngf3), пропущенный «=» (e8Q), пропущенное превращение.
    const r = clean.match(/^([NBRQK])?([a-h])?([1-8])?x?-?([a-h][1-8])(?:=?([NBRQnbrq]))?$/);
    if (!r) return null;
    const [, pc, ff, fr, dest, pr] = r;
    const type = pc ? TYPE_CHARS.indexOf(pc.toLowerCase()) : PAWN;
    const promo = pr ? TYPE_CHARS.indexOf(pr.toLowerCase()) : 0;
    const cands = legal.filter((m) => {
      const from = mFrom(m);
      if (sqName(mTo(m)) !== dest || (this._board[from] & 7) !== type) return false;
      if (ff && FILES[from & 7] !== ff) return false;
      if (fr && String((from >> 4) + 1) !== fr) return false;
      if (promo) return mPromo(m) === promo;
      return !mPromo(m) || mPromo(m) === QUEEN;
    });
    return cands.length === 1 ? cands[0] : null;
  }

  // Принимает SAN («Nf3»), UCI («g1f3», «e7e8q») или { from, to, promotion }. null — если ход невозможен.
  move(input) {
    const m = this._find(input);
    if (m === null) return null;
    const legal = this._legal();
    const obj = this._toObject(m, this._san(m, legal));
    obj.before = this.fen();
    this._make(m);
    obj.after = this.fen();
    this._history.push(obj);
    this._keys.push(this._key());
    return obj;
  }

  undo() {
    if (!this._history.length) return null;
    this._unmake();
    this._keys.pop();
    return this._history.pop();
  }

  history() { return this._history.slice(); }

  // ---------- Конец партии ----------
  isCheckmate() { return this._inCheck() && this._legal().length === 0; }
  isStalemate() { return !this._inCheck() && this._legal().length === 0; }
  isFiftyMoves() { return this._half >= 100; }

  isThreefoldRepetition() {
    const k = this._keys[this._keys.length - 1];
    let n = 0;
    for (const x of this._keys) if (x === k) n++;
    return n >= 3;
  }

  isInsufficientMaterial() {
    const minors = [];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = this._board[sq];
      if (!p) continue;
      const t = p & 7;
      if (t === KING) continue;
      if (t !== BISHOP && t !== KNIGHT) return false;
      minors.push({ t, shade: ((sq >> 4) + (sq & 7)) & 1 });
    }
    if (minors.length <= 1) return true;
    return minors.every((x) => x.t === BISHOP && x.shade === minors[0].shade);
  }

  isDraw() {
    return this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this.isFiftyMoves();
  }

  isGameOver() { return this.isCheckmate() || this.isDraw(); }

  // 'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty' | null
  gameOverReason() {
    if (this.isCheckmate()) return 'checkmate';
    if (this.isStalemate()) return 'stalemate';
    if (this.isInsufficientMaterial()) return 'insufficient';
    if (this.isThreefoldRepetition()) return 'threefold';
    if (this.isFiftyMoves()) return 'fifty';
    return null;
  }

  // ---------- Материал и размены ----------
  // Итог размена на square, если его начинает byColor (в пешках, как SEE на chessprogramming.org).
  // Отрицательное — брать невыгодно; 0 — нечем брать или размен равный.
  see(square, byColor = this.turn()) {
    const sq = sqIndex(square);
    const side0 = byColor === 'w' ? WHITE : BLACK;
    const target = this._board[sq];
    if (!target || (target & side0)) return 0;
    const b = this._board.slice();
    let side = side0;
    let from = leastAttacker(b, sq, side);
    if (from < 0) return 0;
    const kingBlocked = (f, s) => {
      if ((b[f] & 7) !== KING) return false;
      const saved = b[f];
      b[f] = 0;
      const defended = leastAttacker(b, sq, s ^ 24) >= 0;
      b[f] = saved;
      return defended;
    };
    if (kingBlocked(from, side)) return 0;
    const gain = [VALUES[target & 7]];
    let d = 0;
    for (;;) {
      d++;
      gain[d] = VALUES[b[from] & 7] - gain[d - 1];
      b[sq] = b[from];
      b[from] = 0;
      side ^= 24;
      from = leastAttacker(b, sq, side);
      if (from < 0 || kingBlocked(from, side)) break;
    }
    while (--d) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
    return gain[0] || 0; // без -0
  }

  // Фигуры цвета color, которые соперник может выгодно забрать прямо сейчас (без учёта связок).
  threatenedPieces(color) {
    const res = [];
    const enemy = color === 'w' ? 'b' : 'w';
    for (const p of this.pieces()) {
      if (p.color !== color || p.type === 'k') continue;
      const gain = this.see(p.square, enemy);
      if (gain > 0) res.push({ square: p.square, type: p.type, gain });
    }
    return res;
  }

  material(color) {
    let sum = 0;
    for (const p of this.pieces()) if (p.color === color && p.type !== 'k') sum += PIECE_VALUES[p.type];
    return sum;
  }
}

export { sqName as squareName };
