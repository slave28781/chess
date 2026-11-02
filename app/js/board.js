// Доска: фигуры с анимацией, ходы тапом и перетаскиванием, подсветки, стрелки, значки силы хода.
// Доска не меняет партию сама: сообщает о ходе через onMove, хозяин партии вызывает setPosition.

const FILES = 'abcdefgh';
const SVG_NS = 'http://www.w3.org/2000/svg';

const fileOf = (sq) => sq.charCodeAt(0) - 97;
const rankOf = (sq) => sq.charCodeAt(1) - 49;

export class Board {
  constructor(root, { onMove, pieceBase = 'pieces/' } = {}) {
    this.root = root;
    this.onMove = onMove;
    this.pieceBase = pieceBase;
    this.orientation = 'w';
    this.interactive = null; // 'w' | 'b' | 'both' | null
    this.showCoords = true;
    this.chess = null;
    this.lastMove = null;
    this.selected = null;
    this.targets = [];
    this.badge = null;
    this.arrows = [];
    this.pieceEls = [];
    this.drag = null;
    this.hint = null;
    this.animMs = 300;

    root.classList.add('board');
    root.setAttribute('role', 'img');
    root.innerHTML = '';
    this.marksEl = this._div('b-marks');
    this.piecesEl = this._div('b-pieces');
    this.arrowsEl = document.createElementNS(SVG_NS, 'svg');
    this.arrowsEl.setAttribute('class', 'b-arrows');
    this.arrowsEl.setAttribute('viewBox', '0 0 8 8');
    root.appendChild(this.arrowsEl);
    this.coordsEl = this._div('b-coords');
    this.badgeEl = this._div('b-badge hidden');
    this.promoEl = this._div('b-promo hidden');

    root.addEventListener('pointerdown', (e) => this._down(e));
    root.addEventListener('pointermove', (e) => this._moveEvt(e));
    root.addEventListener('pointerup', (e) => this._up(e));
    root.addEventListener('pointercancel', () => this._cancelDrag());
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this._renderCoords();
  }

  _div(cls) {
    const d = document.createElement('div');
    d.className = cls;
    this.root.appendChild(d);
    return d;
  }

  // ---------- Координаты ----------
  _xy(sq) {
    const f = fileOf(sq), r = rankOf(sq);
    return this.orientation === 'w' ? [f, 7 - r] : [7 - f, r];
  }

  _sqAt(clientX, clientY) {
    const rect = this.root.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const y = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const f = this.orientation === 'w' ? x : 7 - x;
    const r = this.orientation === 'w' ? 7 - y : y;
    return FILES[f] + (r + 1);
  }

  _renderCoords() {
    this.coordsEl.innerHTML = '';
    this.coordsEl.classList.toggle('hidden', !this.showCoords);
    for (let i = 0; i < 8; i++) {
      const file = this.orientation === 'w' ? FILES[i] : FILES[7 - i];
      const rank = this.orientation === 'w' ? 8 - i : i + 1;
      const fe = document.createElement('span');
      fe.className = 'c-file ' + ((i + 7) % 2 ? 'on-dark' : 'on-light');
      fe.style.left = `${i * 12.5}%`;
      fe.textContent = file;
      const re = document.createElement('span');
      re.className = 'c-rank ' + (i % 2 ? 'on-dark' : 'on-light');
      re.style.top = `${i * 12.5}%`;
      re.textContent = rank;
      this.coordsEl.append(fe, re);
    }
  }

  setCoords(show) {
    this.showCoords = show;
    this._renderCoords();
  }

  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this._renderCoords();
    for (const p of this.pieceEls) this._place(p, true);
    this._renderMarks();
    this._renderArrows();
    this._renderBadge();
  }

  flip() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }

  setInteractive(mode) {
    this.interactive = mode;
    if (!mode) this._deselect();
  }

  // ---------- Позиция ----------
  setPosition(chess, { lastMove = null, animate = true } = {}) {
    this.chess = chess;
    this.lastMove = lastMove;
    this.selected = null;
    this.targets = [];
    this.hint = null;
    this._closePromo();
    this._renderPieces(animate);
    this._renderMarks();
    this.root.setAttribute('aria-label', 'Шахматная доска, позиция ' + chess.fen());
  }

  _pieceUrl(code) {
    return `${this.pieceBase}${code[0]}${code[1].toUpperCase()}.svg`;
  }

  _create(code, sq) {
    const el = document.createElement('div');
    el.className = 'b-piece';
    el.style.backgroundImage = `url("${this._pieceUrl(code)}")`;
    this.piecesEl.appendChild(el);
    return { el, code, sq };
  }

  // Длительность анимации хода (мс). 0 — без анимации, как в пуле.
  setAnimation(ms) {
    this.animMs = ms;
    this.root.style.setProperty('--anim', `${ms}ms`);
  }

  _place(p, animate) {
    const [x, y] = this._xy(p.sq);
    if (!this.animMs) animate = false;
    if (!animate) p.el.style.transition = 'none';
    p.el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    if (!animate) { void p.el.offsetWidth; p.el.style.transition = ''; }
  }

  _renderPieces(animate) {
    const target = this.chess.pieces().map((p) => ({ sq: p.square, code: p.color + p.type }));
    const old = this.pieceEls;
    const used = new Set();
    const next = [];
    const pending = [];
    for (const t of target) {
      const i = old.findIndex((o, k) => !used.has(k) && o.sq === t.sq && o.code === t.code);
      if (i >= 0) { used.add(i); next.push(old[i]); } else pending.push(t);
    }
    const dist = (a, b) => Math.abs(fileOf(a) - fileOf(b)) + Math.abs(rankOf(a) - rankOf(b));
    for (const t of pending) {
      let best = -1, bestD = 99;
      old.forEach((o, k) => {
        if (used.has(k) || o.code !== t.code) return;
        const d = dist(o.sq, t.sq);
        if (d < bestD) { bestD = d; best = k; }
      });
      if (best >= 0 && bestD <= 8) {
        used.add(best);
        const o = old[best];
        o.sq = t.sq;
        o.el.classList.remove('dragging');
        this._place(o, animate);
        next.push(o);
      } else {
        const o = this._create(t.code, t.sq);
        this._place(o, false);
        if (animate) { o.el.classList.add('appear'); requestAnimationFrame(() => o.el.classList.remove('appear')); }
        next.push(o);
      }
    }
    old.forEach((o, k) => {
      if (used.has(k)) return;
      // Взятая фигура исчезает, когда бьющая уже почти пришла.
      if (animate && this.animMs) {
        setTimeout(() => o.el.classList.add('vanish'), this.animMs * 0.6);
        setTimeout(() => o.el.remove(), this.animMs * 0.6 + 200);
      } else o.el.remove();
    });
    for (const p of next) p.el.classList.remove('dragging');
    this.pieceEls = next;
  }

  _mark(sq, cls) {
    const [x, y] = this._xy(sq);
    const d = document.createElement('div');
    d.className = 'b-mark ' + cls;
    d.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    this.marksEl.appendChild(d);
  }

  _renderMarks() {
    this.marksEl.innerHTML = '';
    if (!this.chess) return;
    if (this.lastMove) { this._mark(this.lastMove.from, 'm-last'); this._mark(this.lastMove.to, 'm-last to'); }
    if (this.chess.inCheck()) this._mark(this.chess.kingSquare(this.chess.turn()), 'm-check');
    if (this.hint) this._mark(this.hint, 'm-hint');
    if (this.selected) {
      this._mark(this.selected, 'm-sel');
      const seen = new Set();
      for (const t of this.targets) {
        if (seen.has(t.to)) continue;
        seen.add(t.to);
        this._mark(t.to, t.captured ? 'm-cap' : 'm-dot');
      }
    }
    if (this.drag && this.drag.over) this._mark(this.drag.over, 'm-over');
  }

  // Подсветить поле (подсказка в задачах).
  setHint(sq) {
    this.hint = sq;
    this._renderMarks();
  }

  // ---------- Значок силы хода ----------
  setBadge(badge) {
    this.badge = badge; // { square, text, color, title } | null
    this._renderBadge();
  }

  _renderBadge() {
    const b = this.badge;
    this.badgeEl.classList.toggle('hidden', !b);
    if (!b) return;
    const [x, y] = this._xy(b.square);
    this.badgeEl.innerHTML = b.html;
    this.badgeEl.title = b.title || '';
    this.badgeEl.style.left = `calc(${(x + 1) * 12.5}% - 4.6%)`;
    this.badgeEl.style.top = `calc(${y * 12.5}% - 1.6%)`;
    this.badgeEl.classList.remove('pop');
    void this.badgeEl.offsetWidth;
    this.badgeEl.classList.add('pop');
  }

  // ---------- Стрелки ----------
  setArrows(arrows) {
    this.arrows = arrows || [];
    this._renderArrows();
  }

  _renderArrows() {
    this.arrowsEl.innerHTML = '';
    for (const a of this.arrows) {
      const [x1, y1] = this._xy(a.from), [x2, y2] = this._xy(a.to);
      const sx = x1 + 0.5, sy = y1 + 0.5, ex = x2 + 0.5, ey = y2 + 0.5;
      const len = Math.hypot(ex - sx, ey - sy);
      if (!len) continue;
      const ux = (ex - sx) / len, uy = (ey - sy) / len;
      const head = 0.42, half = 0.24, w = 0.17;
      const bx = ex - ux * head, by = ey - uy * head;
      const nx = -uy, ny = ux;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('opacity', a.opacity ?? 0.85);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', sx + ux * 0.18); line.setAttribute('y1', sy + uy * 0.18);
      line.setAttribute('x2', bx); line.setAttribute('y2', by);
      line.setAttribute('stroke', a.color); line.setAttribute('stroke-width', w); line.setAttribute('stroke-linecap', 'round');
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', `${ex},${ey} ${bx + nx * half},${by + ny * half} ${bx - nx * half},${by - ny * half}`);
      poly.setAttribute('fill', a.color);
      g.append(line, poly);
      this.arrowsEl.appendChild(g);
    }
  }

  // ---------- Ввод ----------
  _canMove(piece) {
    if (!this.interactive || !piece || !this.chess) return false;
    if (piece.color !== this.chess.turn()) return false;
    return this.interactive === 'both' || this.interactive === piece.color;
  }

  _select(sq) {
    this.selected = sq;
    this.targets = this.chess.moves({ square: sq });
    this._renderMarks();
  }

  _deselect() {
    this.selected = null;
    this.targets = [];
    this._renderMarks();
  }

  _pieceAt(sq) { return this.pieceEls.find((p) => p.sq === sq); }

  _down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (!this.promoEl.classList.contains('hidden')) return;
    if (!this.interactive || !this.chess) return;
    const sq = this._sqAt(e.clientX, e.clientY);
    if (!sq) return;
    if (this.selected && this.targets.some((t) => t.to === sq)) {
      this._attempt(this.selected, sq, true);
      return;
    }
    const piece = this.chess.get(sq);
    if (!this._canMove(piece)) { this._deselect(); return; }
    const wasSelected = this.selected === sq;
    this._select(sq);
    const p = this._pieceAt(sq);
    if (!p) return;
    e.preventDefault();
    this.root.setPointerCapture?.(e.pointerId);
    this.drag = { from: sq, piece: p, x0: e.clientX, y0: e.clientY, moved: false, wasSelected, over: null };
  }

  _moveEvt(e) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    d.moved = true;
    const rect = this.root.getBoundingClientRect();
    const size = rect.width / 8;
    const px = e.clientX - rect.left - size / 2;
    const py = e.clientY - rect.top - size / 2 - (e.pointerType === 'touch' ? size * 0.35 : 0);
    d.piece.el.classList.add('dragging');
    d.piece.el.style.transition = 'none';
    d.piece.el.style.transform = `translate(${px}px, ${py}px) scale(1.15)`;
    const over = this._sqAt(e.clientX, e.clientY - (e.pointerType === 'touch' ? size * 0.35 : 0));
    if (over !== d.over) { d.over = over; this._renderMarks(); }
  }

  _up(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.moved) {
      // Повторный тап по выбранной фигуре снимает выбор.
      if (d.wasSelected) this._deselect();
      return;
    }
    const size = this.root.getBoundingClientRect().width / 8;
    const sq = this._sqAt(e.clientX, e.clientY - (e.pointerType === 'touch' ? size * 0.35 : 0));
    d.piece.el.classList.remove('dragging');
    d.piece.el.style.transition = '';
    if (sq && sq !== d.from && this.targets.some((t) => t.to === sq)) {
      this._attempt(d.from, sq, false);
    } else {
      this._place(d.piece, true);
      this._renderMarks();
    }
  }

  _cancelDrag() {
    if (!this.drag) return;
    const p = this.drag.piece;
    this.drag = null;
    p.el.classList.remove('dragging');
    p.el.style.transition = '';
    this._place(p, true);
    this._renderMarks();
  }

  _attempt(from, to, animate) {
    const options = this.targets.filter((t) => t.from === from && t.to === to);
    if (!options.length) return;
    if (options.length > 1 && options[0].promotion) {
      if (!animate) {
        const p = this._pieceAt(from);
        if (p) { p.sq = to; this._place(p, false); }
      }
      this._openPromo(from, to, options[0].color, (promotion) => {
        if (!promotion) { this.setPosition(this.chess, { lastMove: this.lastMove, animate: true }); return; }
        this.onMove?.({ from, to, promotion }, { animate: false });
      });
      return;
    }
    this.selected = null;
    this.targets = [];
    this.onMove?.({ from, to }, { animate });
  }

  _openPromo(from, to, color, done) {
    const [x, y] = this._xy(to);
    const down = y === 0;
    this.promoEl.innerHTML = '';
    this.promoEl.classList.remove('hidden');
    const types = ['q', 'n', 'r', 'b'];
    types.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'promo-btn';
      b.style.left = `${x * 12.5}%`;
      b.style.top = `${(down ? i : 7 - i) * 12.5}%`;
      b.style.backgroundImage = `url("${this._pieceUrl(color + t)}")`;
      b.setAttribute('aria-label', { q: 'Ферзь', n: 'Конь', r: 'Ладья', b: 'Слон' }[t]);
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._closePromo(); done(t); });
      this.promoEl.appendChild(b);
    });
    this.promoEl.onpointerdown = (e) => { e.stopPropagation(); this._closePromo(); done(null); };
  }

  _closePromo() {
    this.promoEl.classList.add('hidden');
    this.promoEl.innerHTML = '';
  }
}
