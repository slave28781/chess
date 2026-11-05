var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../app/js/chess.js
var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var WHITE = 8;
var BLACK = 16;
var PAWN = 1;
var KNIGHT = 2;
var BISHOP = 3;
var ROOK = 4;
var QUEEN = 5;
var KING = 6;
var TYPE_CHARS = " pnbrqk";
var PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
var VALUES = [0, 1, 3, 3, 5, 9, 100];
var F_CAPTURE = 1;
var F_DOUBLE = 2;
var F_EP = 4;
var F_KCASTLE = 8;
var F_QCASTLE = 16;
var F_PROMO = 32;
var KNIGHT_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
var KING_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
var BISHOP_DIR = [15, 17, -15, -17];
var ROOK_DIR = [16, -16, 1, -1];
var FILES = "abcdefgh";
var sqName = /* @__PURE__ */ __name((s) => FILES[s & 7] + ((s >> 4) + 1), "sqName");
var sqIndex = /* @__PURE__ */ __name((n) => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97), "sqIndex");
var isSquareName = /* @__PURE__ */ __name((n) => typeof n === "string" && /^[a-h][1-8]$/.test(n), "isSquareName");
var mk = /* @__PURE__ */ __name((from, to, flags, promo = 0) => from | to << 7 | flags << 14 | promo << 20, "mk");
var mFrom = /* @__PURE__ */ __name((m) => m & 127, "mFrom");
var mTo = /* @__PURE__ */ __name((m) => m >> 7 & 127, "mTo");
var mFlags = /* @__PURE__ */ __name((m) => m >> 14 & 63, "mFlags");
var mPromo = /* @__PURE__ */ __name((m) => m >> 20 & 7, "mPromo");
var CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[sqIndex("e1")] = 12;
CASTLE_MASK[sqIndex("h1")] = 14;
CASTLE_MASK[sqIndex("a1")] = 13;
CASTLE_MASK[sqIndex("e8")] = 3;
CASTLE_MASK[sqIndex("h8")] = 11;
CASTLE_MASK[sqIndex("a8")] = 7;
function leastAttacker(b, sq, side) {
  const pawn = side | PAWN;
  for (const o of side === WHITE ? [-15, -17] : [15, 17]) {
    const s = sq + o;
    if (!(s & 136) && b[s] === pawn) return s;
  }
  for (const o of KNIGHT_OFF) {
    const s = sq + o;
    if (!(s & 136) && b[s] === (side | KNIGHT)) return s;
  }
  let queen = -1;
  for (const d of BISHOP_DIR) {
    for (let s = sq + d; !(s & 136); s += d) {
      const p = b[s];
      if (!p) continue;
      if (p === (side | BISHOP)) return s;
      if (p === (side | QUEEN) && queen < 0) queen = s;
      break;
    }
  }
  let rook = -1;
  for (const d of ROOK_DIR) {
    for (let s = sq + d; !(s & 136); s += d) {
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
    if (!(s & 136) && b[s] === (side | KING)) return s;
  }
  return -1;
}
__name(leastAttacker, "leastAttacker");
var Chess = class {
  static {
    __name(this, "Chess");
  }
  constructor(fen = START_FEN) {
    this.load(fen);
  }
  // ---------- FEN ----------
  load(fen) {
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u043C\u0430\u043B\u043E \u043F\u043E\u043B\u0435\u0439");
    const b = new Uint8Array(128);
    const kings = [-1, -1];
    const rows = parts[0].split("/");
    if (rows.length !== 8) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u043D\u0443\u0436\u043D\u043E 8 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u0435\u0439");
    for (let r = 0; r < 8; r++) {
      let file = 0;
      const rank = 7 - r;
      for (const ch of rows[r]) {
        if (ch >= "1" && ch <= "8") {
          file += Number(ch);
          continue;
        }
        const t = TYPE_CHARS.indexOf(ch.toLowerCase());
        if (t <= 0 || file > 7) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u0441\u0438\u043C\u0432\u043E\u043B \xAB" + ch + "\xBB");
        const color = ch === ch.toUpperCase() ? WHITE : BLACK;
        const sq = rank * 16 + file;
        b[sq] = color | t;
        if (t === KING) {
          if (kings[color === WHITE ? 0 : 1] >= 0) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u0434\u0432\u0430 \u043A\u043E\u0440\u043E\u043B\u044F \u043E\u0434\u043D\u043E\u0433\u043E \u0446\u0432\u0435\u0442\u0430");
          kings[color === WHITE ? 0 : 1] = sq;
        }
        if (t === PAWN && (rank === 0 || rank === 7)) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u043F\u0435\u0448\u043A\u0430 \u043D\u0430 \u043A\u0440\u0430\u0439\u043D\u0435\u0439 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u0438");
        file++;
      }
      if (file !== 8) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u0432 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u0438 \u043D\u0435 8 \u043F\u043E\u043B\u0435\u0439");
    }
    if (kings[0] < 0 || kings[1] < 0) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u043D\u0435\u0442 \u043A\u043E\u0440\u043E\u043B\u044F");
    if (parts[1] !== "w" && parts[1] !== "b") throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u0445\u043E\u0434\u0430");
    let castling = 0;
    if (parts[2] !== "-") {
      for (const ch of parts[2]) {
        const bit = { K: 1, Q: 2, k: 4, q: 8 }[ch];
        if (!bit) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u0440\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0430");
        castling |= bit;
      }
    }
    if (b[4] !== (WHITE | KING)) castling &= ~3;
    if (b[7] !== (WHITE | ROOK)) castling &= ~1;
    if (b[0] !== (WHITE | ROOK)) castling &= ~2;
    if (b[116] !== (BLACK | KING)) castling &= ~12;
    if (b[119] !== (BLACK | ROOK)) castling &= ~4;
    if (b[112] !== (BLACK | ROOK)) castling &= ~8;
    let ep = -1;
    if (parts[3] !== "-") {
      if (!isSquareName(parts[3])) throw new Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 FEN: \u043F\u043E\u043B\u0435 \u0432\u0437\u044F\u0442\u0438\u044F \u043D\u0430 \u043F\u0440\u043E\u0445\u043E\u0434\u0435");
      ep = sqIndex(parts[3]);
    }
    this._board = b;
    this._kings = kings;
    this._turn = parts[1] === "w" ? WHITE : BLACK;
    this._castling = castling;
    this._ep = ep;
    this._half = Math.max(0, parseInt(parts[4], 10) || 0);
    this._full = Math.max(1, parseInt(parts[5], 10) || 1);
    this._stack = [];
    this._history = [];
    if (this._attacked(this._kings[this._turn === WHITE ? 1 : 0], this._turn)) {
      throw new Error("\u041D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u0430\u044F \u043F\u043E\u0437\u0438\u0446\u0438\u044F: \u043A\u043E\u0440\u043E\u043B\u044C \u0441\u0442\u043E\u0440\u043E\u043D\u044B, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u043D\u0435 \u0445\u043E\u0434\u0438\u0442, \u043F\u043E\u0434 \u0448\u0430\u0445\u043E\u043C");
    }
    this._keys = [this._key()];
    this._startFen = this.fen();
    return this;
  }
  fen() {
    let s = "";
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this._board[rank * 16 + file];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          s += empty;
          empty = 0;
        }
        const ch = TYPE_CHARS[p & 7];
        s += p & WHITE ? ch.toUpperCase() : ch;
      }
      if (empty) s += empty;
      if (rank) s += "/";
    }
    let c = "";
    if (this._castling & 1) c += "K";
    if (this._castling & 2) c += "Q";
    if (this._castling & 4) c += "k";
    if (this._castling & 8) c += "q";
    return `${s} ${this._turn === WHITE ? "w" : "b"} ${c || "-"} ${this._epFen()} ${this._half} ${this._full}`;
  }
  // Поле взятия на проходе пишем, только если взять действительно можно (как lichess).
  _epFen() {
    if (this._ep < 0) return "-";
    const pawn = this._turn | PAWN;
    const offs = this._turn === WHITE ? [-15, -17] : [15, 17];
    for (const o of offs) {
      const s = this._ep + o;
      if (!(s & 136) && this._board[s] === pawn) return sqName(this._ep);
    }
    return "-";
  }
  _key() {
    return this.fen().split(" ").slice(0, 4).join(" ");
  }
  startFen() {
    return this._startFen;
  }
  // ---------- Доступ к позиции ----------
  turn() {
    return this._turn === WHITE ? "w" : "b";
  }
  moveNumber() {
    return this._full;
  }
  get(square) {
    const p = this._board[sqIndex(square)];
    return p ? { type: TYPE_CHARS[p & 7], color: p & WHITE ? "w" : "b" } : null;
  }
  pieces() {
    const res = [];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 136) {
        sq += 7;
        continue;
      }
      const p = this._board[sq];
      if (p) res.push({ square: sqName(sq), type: TYPE_CHARS[p & 7], color: p & WHITE ? "w" : "b" });
    }
    return res;
  }
  kingSquare(color) {
    return sqName(this._kings[color === "w" ? 0 : 1]);
  }
  // ---------- Атаки ----------
  _attacked(sq, by) {
    const b = this._board;
    const pawn = by | PAWN;
    for (const o of by === WHITE ? [-15, -17] : [15, 17]) {
      const s = sq + o;
      if (!(s & 136) && b[s] === pawn) return true;
    }
    for (const o of KNIGHT_OFF) {
      const s = sq + o;
      if (!(s & 136) && b[s] === (by | KNIGHT)) return true;
    }
    for (const o of KING_OFF) {
      const s = sq + o;
      if (!(s & 136) && b[s] === (by | KING)) return true;
    }
    for (const d of BISHOP_DIR) {
      for (let s = sq + d; !(s & 136); s += d) {
        const p = b[s];
        if (!p) continue;
        if (p === (by | BISHOP) || p === (by | QUEEN)) return true;
        break;
      }
    }
    for (const d of ROOK_DIR) {
      for (let s = sq + d; !(s & 136); s += d) {
        const p = b[s];
        if (!p) continue;
        if (p === (by | ROOK) || p === (by | QUEEN)) return true;
        break;
      }
    }
    return false;
  }
  isAttacked(square, byColor) {
    return this._attacked(sqIndex(square), byColor === "w" ? WHITE : BLACK);
  }
  _inCheck() {
    return this._attacked(this._kings[this._turn === WHITE ? 0 : 1], this._turn ^ 24);
  }
  inCheck() {
    return this._inCheck();
  }
  // ---------- Генерация ходов ----------
  _addPawn(out, from, to, flags, promoRank) {
    if (to >> 4 === promoRank) {
      for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) out.push(mk(from, to, flags | F_PROMO, pr));
    } else {
      out.push(mk(from, to, flags));
    }
  }
  _genPseudo(out) {
    const b = this._board, us = this._turn, them = us ^ 24;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 136) {
        sq += 7;
        continue;
      }
      const p = b[sq];
      if (!p || !(p & us)) continue;
      const t = p & 7;
      if (t === PAWN) {
        const fwd = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const promoRank = us === WHITE ? 7 : 0;
        const one = sq + fwd;
        if (!(one & 136) && !b[one]) {
          this._addPawn(out, sq, one, 0, promoRank);
          if (sq >> 4 === startRank && !b[one + fwd]) out.push(mk(sq, one + fwd, F_DOUBLE));
        }
        for (const c of us === WHITE ? [15, 17] : [-15, -17]) {
          const to = sq + c;
          if (to & 136) continue;
          if (b[to] & them) this._addPawn(out, sq, to, F_CAPTURE, promoRank);
          else if (to === this._ep && !b[to]) out.push(mk(sq, to, F_CAPTURE | F_EP));
        }
      } else if (t === KNIGHT || t === KING) {
        for (const o of t === KNIGHT ? KNIGHT_OFF : KING_OFF) {
          const to = sq + o;
          if (to & 136) continue;
          const q = b[to];
          if (!q) out.push(mk(sq, to, 0));
          else if (q & them) out.push(mk(sq, to, F_CAPTURE));
        }
      } else {
        const dirs = t === BISHOP ? BISHOP_DIR : t === ROOK ? ROOK_DIR : KING_OFF;
        for (const d of dirs) {
          for (let to = sq + d; !(to & 136); to += d) {
            const q = b[to];
            if (!q) {
              out.push(mk(sq, to, 0));
              continue;
            }
            if (q & them) out.push(mk(sq, to, F_CAPTURE));
            break;
          }
        }
      }
    }
    const base = us === WHITE ? 0 : 112;
    const kBit = us === WHITE ? 1 : 4, qBit = us === WHITE ? 2 : 8;
    if (this._castling & kBit && !b[base + 5] && !b[base + 6] && !this._attacked(base + 4, them) && !this._attacked(base + 5, them) && !this._attacked(base + 6, them)) {
      out.push(mk(base + 4, base + 6, F_KCASTLE));
    }
    if (this._castling & qBit && !b[base + 3] && !b[base + 2] && !b[base + 1] && !this._attacked(base + 4, them) && !this._attacked(base + 3, them) && !this._attacked(base + 2, them)) {
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
    b[to] = promo ? us | promo : piece;
    b[from] = 0;
    if (fl & F_KCASTLE) {
      b[to - 1] = b[to + 1];
      b[to + 1] = 0;
    }
    if (fl & F_QCASTLE) {
      b[to + 1] = b[to - 2];
      b[to - 2] = 0;
    }
    if ((piece & 7) === KING) this._kings[us === WHITE ? 0 : 1] = to;
    this._castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this._ep = fl & F_DOUBLE ? from + to >> 1 : -1;
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
    const piece = promo ? us | PAWN : b[to];
    b[from] = piece;
    if (fl & F_EP) {
      b[to] = 0;
      b[us === WHITE ? to - 16 : to + 16] = u.captured;
    } else {
      b[to] = u.captured;
    }
    if (fl & F_KCASTLE) {
      b[to + 1] = b[to - 1];
      b[to - 1] = 0;
    }
    if (fl & F_QCASTLE) {
      b[to - 2] = b[to + 1];
      b[to + 1] = 0;
    }
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
    if (fl & F_KCASTLE) s = "O-O";
    else if (fl & F_QCASTLE) s = "O-O-O";
    else if (t === PAWN) {
      s = fl & F_CAPTURE ? FILES[from & 7] + "x" + sqName(to) : sqName(to);
      if (promo) s += "=" + TYPE_CHARS[promo].toUpperCase();
    } else {
      s = TYPE_CHARS[t].toUpperCase();
      let ambiguous = false, sameFile = false, sameRank = false;
      for (const o of legal) {
        const of = mFrom(o);
        if (o === m || of === from || mTo(o) !== to || b[of] !== piece) continue;
        ambiguous = true;
        if ((of & 7) === (from & 7)) sameFile = true;
        if (of >> 4 === from >> 4) sameRank = true;
      }
      if (ambiguous) {
        if (!sameFile) s += FILES[from & 7];
        else if (!sameRank) s += (from >> 4) + 1;
        else s += sqName(from);
      }
      if (fl & F_CAPTURE) s += "x";
      s += sqName(to);
    }
    if (withSuffix) {
      this._make(m);
      if (this._inCheck()) s += this._legal().length ? "+" : "#";
      this._unmake();
    }
    return s;
  }
  _toObject(m, san) {
    const b = this._board;
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const piece = b[from];
    let captured;
    if (fl & F_EP) captured = "p";
    else if (b[to]) captured = TYPE_CHARS[b[to] & 7];
    let flags = "";
    if (fl & F_EP) flags += "e";
    else if (fl & F_CAPTURE) flags += "c";
    if (fl & F_DOUBLE) flags += "b";
    if (fl & F_KCASTLE) flags += "k";
    if (fl & F_QCASTLE) flags += "q";
    if (fl & F_PROMO) flags += "p";
    const obj = {
      color: piece & WHITE ? "w" : "b",
      from: sqName(from),
      to: sqName(to),
      piece: TYPE_CHARS[piece & 7],
      san,
      uci: sqName(from) + sqName(to) + (promo ? TYPE_CHARS[promo] : ""),
      flags
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
  movesCount() {
    return this._legal().length;
  }
  _find(input) {
    const legal = this._legal();
    if (input && typeof input === "object") {
      const promo2 = input.promotion ? TYPE_CHARS.indexOf(input.promotion) : 0;
      return legal.find((m) => sqName(mFrom(m)) === input.from && sqName(mTo(m)) === input.to && (mPromo(m) === promo2 || !promo2 && mPromo(m) === QUEEN)) ?? null;
    }
    const str = String(input).trim();
    const uci = str.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (uci) return this._find({ from: uci[1], to: uci[2], promotion: uci[3] });
    const clean = str.replace(/(e\.p\.|[+#!?]+)+$/g, "").replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O").replace(/^o-o-o$/i, "O-O-O").replace(/^o-o$/i, "O-O");
    for (const m of legal) if (this._san(m, legal, false) === clean) return m;
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
  history() {
    return this._history.slice();
  }
  // ---------- Конец партии ----------
  isCheckmate() {
    return this._inCheck() && this._legal().length === 0;
  }
  isStalemate() {
    return !this._inCheck() && this._legal().length === 0;
  }
  isFiftyMoves() {
    return this._half >= 100;
  }
  isThreefoldRepetition() {
    const k = this._keys[this._keys.length - 1];
    let n = 0;
    for (const x of this._keys) if (x === k) n++;
    return n >= 3;
  }
  isInsufficientMaterial() {
    const minors = [];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 136) {
        sq += 7;
        continue;
      }
      const p = this._board[sq];
      if (!p) continue;
      const t = p & 7;
      if (t === KING) continue;
      if (t !== BISHOP && t !== KNIGHT) return false;
      minors.push({ t, shade: (sq >> 4) + (sq & 7) & 1 });
    }
    if (minors.length <= 1) return true;
    return minors.every((x) => x.t === BISHOP && x.shade === minors[0].shade);
  }
  isDraw() {
    return this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this.isFiftyMoves();
  }
  isGameOver() {
    return this.isCheckmate() || this.isDraw();
  }
  // 'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty' | null
  gameOverReason() {
    if (this.isCheckmate()) return "checkmate";
    if (this.isStalemate()) return "stalemate";
    if (this.isInsufficientMaterial()) return "insufficient";
    if (this.isThreefoldRepetition()) return "threefold";
    if (this.isFiftyMoves()) return "fifty";
    return null;
  }
  // ---------- Материал и размены ----------
  // Итог размена на square, если его начинает byColor (в пешках, как SEE на chessprogramming.org).
  // Отрицательное — брать невыгодно; 0 — нечем брать или размен равный.
  see(square, byColor = this.turn()) {
    const sq = sqIndex(square);
    const side0 = byColor === "w" ? WHITE : BLACK;
    const target = this._board[sq];
    if (!target || target & side0) return 0;
    const b = this._board.slice();
    let side = side0;
    let from = leastAttacker(b, sq, side);
    if (from < 0) return 0;
    const kingBlocked = /* @__PURE__ */ __name((f, s) => {
      if ((b[f] & 7) !== KING) return false;
      const saved = b[f];
      b[f] = 0;
      const defended = leastAttacker(b, sq, s ^ 24) >= 0;
      b[f] = saved;
      return defended;
    }, "kingBlocked");
    if (kingBlocked(from, side)) return 0;
    const gain = [VALUES[target & 7]];
    let d = 0;
    for (; ; ) {
      d++;
      gain[d] = VALUES[b[from] & 7] - gain[d - 1];
      b[sq] = b[from];
      b[from] = 0;
      side ^= 24;
      from = leastAttacker(b, sq, side);
      if (from < 0 || kingBlocked(from, side)) break;
    }
    while (--d) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
    return gain[0] || 0;
  }
  // Фигуры цвета color, которые соперник может выгодно забрать прямо сейчас (без учёта связок).
  threatenedPieces(color) {
    const res = [];
    const enemy = color === "w" ? "b" : "w";
    for (const p of this.pieces()) {
      if (p.color !== color || p.type === "k") continue;
      const gain = this.see(p.square, enemy);
      if (gain > 0) res.push({ square: p.square, type: p.type, gain });
    }
    return res;
  }
  // Поля, которые бьёт фигура на square (независимо от очереди хода).
  attacksFrom(square) {
    const sq = sqIndex(square), b = this._board, p = b[sq];
    if (!p) return [];
    const t = p & 7, res = [];
    const add = /* @__PURE__ */ __name((s) => {
      if (!(s & 136)) res.push(sqName(s));
    }, "add");
    if (t === PAWN) {
      for (const o of p & WHITE ? [15, 17] : [-15, -17]) add(sq + o);
    } else if (t === KNIGHT || t === KING) {
      for (const o of t === KNIGHT ? KNIGHT_OFF : KING_OFF) add(sq + o);
    } else {
      for (const d of t === BISHOP ? BISHOP_DIR : t === ROOK ? ROOK_DIR : KING_OFF) {
        for (let s = sq + d; !(s & 136); s += d) {
          res.push(sqName(s));
          if (b[s]) break;
        }
      }
    }
    return res;
  }
  material(color) {
    let sum = 0;
    for (const p of this.pieces()) if (p.color === color && p.type !== "k") sum += PIECE_VALUES[p.type];
    return sum;
  }
};

// ../app/js/timecontrol.js
function canMate(fen, color) {
  const g = new Chess(fen);
  const mine = g.pieces().filter((p) => p.color === color && p.type !== "k");
  if (!mine.length) return false;
  if (mine.length === 1 && (mine[0].type === "n" || mine[0].type === "b")) return false;
  return true;
}
__name(canMate, "canMate");

// worker.js
var ROOM = /^[a-f0-9]{32}$/;
var TOKEN = /^[a-f0-9]{64}$/;
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = url.pathname.slice(1);
    const token = url.searchParams.get("token");
    if (!ROOM.test(room) || !TOKEN.test(token || "") || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Invalid request", { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  }
};
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(ctx) {
    this.ctx = ctx;
  }
  async fetch(request) {
    const token = new URL(request.url).searchParams.get("token");
    let state = await this.ctx.storage.get("game");
    if (!state) state = { players: {}, moves: [], clock: { w: 3e5, b: 3e5 }, turn: "w", started: false, deadline: null, result: null };
    let color = Object.keys(state.players).find((c) => state.players[c] === token);
    if (!color) {
      color = !state.players.w ? "w" : !state.players.b ? "b" : null;
      if (!color) return new Response("Room full", { status: 403 });
      state.players[color] = token;
    }
    if (state.players.w && state.players.b && !state.started) {
      state.started = true;
      state.deadline = Date.now() + state.clock.w;
      await this.ctx.storage.setAlarm(state.deadline);
    }
    await this.ctx.storage.put("game", state);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [color]);
    for (const socket of this.ctx.getWebSockets(color)) if (socket !== server) socket.close(1e3, "Reconnected");
    await this.broadcast(state);
    return new Response(null, { status: 101, webSocket: client });
  }
  async broadcast(state) {
    const { players, ...publicState } = state;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ ...publicState, color: this.ctx.getTags(ws)[0], serverTime: Date.now() }));
      } catch {
      }
    }
  }
  async expire(state, now) {
    if (state.started && !state.result && state.deadline <= now) {
      state.clock[state.turn] = 0;
      const game = new Chess();
      for (const move of state.moves) game.move(move);
      const winner = state.turn === "w" ? "b" : "w";
      state.result = canMate(game.fen(), winner) ? winner === "w" ? "1-0" : "0-1" : "1/2-1/2";
      state.reason = "timeout";
      state.deadline = null;
      await this.ctx.storage.put("game", state);
      return true;
    }
    return false;
  }
  async webSocketMessage(ws, message) {
    let data;
    try {
      if (typeof message !== "string" || message.length > 500) return;
      data = JSON.parse(message);
    } catch {
      return;
    }
    const state = await this.ctx.storage.get("game");
    const now = Date.now();
    if (await this.expire(state, now)) {
      await this.broadcast(state);
      return;
    }
    const color = this.ctx.getTags(ws)[0];
    if (!state.started || state.result) return;
    if (data.type === "resign") {
      state.result = color === "w" ? "0-1" : "1-0";
      state.reason = "resign";
      state.deadline = null;
    } else if (data.type === "move" && color === state.turn && data.ply === state.moves.length && typeof data.move === "object" && data.move) {
      const game = new Chess();
      for (const move2 of state.moves) if (!game.move(move2)) throw new Error("Invalid stored game");
      let move;
      try {
        move = game.move(data.move);
      } catch {
        return;
      }
      if (!move) {
        await this.broadcast(state);
        return;
      }
      state.clock[color] = Math.max(0, state.deadline - now);
      state.moves.push({ from: move.from, to: move.to, promotion: move.promotion });
      state.turn = game.turn();
      if (game.isGameOver()) {
        state.result = game.isCheckmate() ? color === "w" ? "1-0" : "0-1" : "1/2-1/2";
        state.reason = game.gameOverReason();
        state.deadline = null;
      } else {
        state.deadline = now + state.clock[state.turn];
        await this.ctx.storage.setAlarm(state.deadline);
      }
    } else {
      await this.broadcast(state);
      return;
    }
    await this.ctx.storage.put("game", state);
    await this.broadcast(state);
  }
  async alarm() {
    const state = await this.ctx.storage.get("game");
    if (!state || !state.deadline) return;
    if (await this.expire(state, Date.now())) await this.broadcast(state);
    else await this.ctx.storage.setAlarm(state.deadline);
  }
};

// ../../../home/agent/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../home/agent/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-AOgNE8/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../home/agent/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-AOgNE8/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
