// Обёртка над Stockfish по протоколу UCI. Одна очередь задач: анализ, выбор хода, настройки.
// Транспорт подменяется: Web Worker в браузере, отдельный процесс Node в тестах.

export function parseInfo(line) {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'info') return null;
  const r = { multipv: 1 };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': r.depth = Number(t[++i]); break;
      case 'seldepth': r.seldepth = Number(t[++i]); break;
      case 'multipv': r.multipv = Number(t[++i]); break;
      case 'nodes': r.nodes = Number(t[++i]); break;
      case 'nps': r.nps = Number(t[++i]); break;
      case 'time': r.time = Number(t[++i]); break;
      case 'score': {
        const kind = t[++i], v = Number(t[++i]);
        r.score = kind === 'mate' ? { mate: v } : { cp: v };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') r.bound = t[++i];
        break;
      }
      case 'pv': r.pv = t.slice(i + 1); i = t.length; break;
      case 'string': return null;
      default: break;
    }
  }
  return r.pv && r.pv.length && r.score ? r : null;
}

export function workerTransport(url) {
  const w = new Worker(url);
  let onLine = () => {}, onError = () => {};
  w.onmessage = (e) => { for (const l of String(e.data).split('\n')) if (l) onLine(l); };
  w.onerror = (e) => onError(new Error('Движок не запустился: ' + (e.message || 'ошибка загрузки')));
  return {
    post: (cmd) => w.postMessage(cmd),
    onLine: (f) => { onLine = f; },
    onError: (f) => { onError = f; },
    terminate: () => w.terminate(),
  };
}

const ANALYSIS_OPTIONS = { UCI_LimitStrength: 'false', 'Skill Level': 20 };

export class Engine {
  constructor(transport, { initTimeout = 60000 } = {}) {
    this._t = transport;
    this._listeners = new Set();
    this._opts = {};
    this._queue = Promise.resolve();
    this._searching = false;
    this.name = 'Stockfish';
    transport.onLine((line) => { for (const fn of [...this._listeners]) fn(line); });
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Движок не ответил вовремя')), initTimeout);
      if (transport.onError) transport.onError((e) => { clearTimeout(timer); reject(e); });
      this._init().then(() => { clearTimeout(timer); resolve(); }, (e) => { clearTimeout(timer); reject(e); });
    });
    this.ready.catch(() => {});
  }

  _send(cmd) { this._t.post(cmd); }

  _waitFor(pred) {
    return new Promise((resolve) => {
      const fn = (line) => { if (pred(line)) { this._listeners.delete(fn); resolve(line); } };
      this._listeners.add(fn);
    });
  }

  async _init() {
    const ok = this._waitFor((l) => l === 'uciok');
    const nameLine = this._waitFor((l) => l.startsWith('id name'));
    this._send('uci');
    this.name = (await Promise.race([nameLine, ok.then(() => 'id name Stockfish')])).slice(8);
    await ok;
    await this._isReady();
  }

  async _isReady() {
    const p = this._waitFor((l) => l === 'readyok');
    this._send('isready');
    await p;
  }

  _enqueue(task) {
    const run = this._queue.then(() => this.ready).then(task);
    this._queue = run.catch(() => {});
    return run;
  }

  async _setOptions(opts) {
    let changed = false;
    for (const [k, v] of Object.entries(opts)) {
      if (this._opts[k] !== String(v)) { this._send(`setoption name ${k} value ${v}`); this._opts[k] = String(v); changed = true; }
    }
    if (changed) await this._isReady();
  }

  /**
   * Анализ позиции. → { bestMove, lines: [{ multipv, depth, score (от ходящего), pv }] }
   * onInfo(lines) вызывается по мере углубления — для живого анализа.
   */
  analyse(fen, { depth, movetime, multipv = 1, options = ANALYSIS_OPTIONS, onInfo } = {}) {
    return this._enqueue(() => this._search(fen, { depth, movetime, multipv, options, onInfo }));
  }

  async _search(fen, { depth, movetime, multipv, options, onInfo }) {
    await this._setOptions({ ...options, MultiPV: multipv });
    const lines = new Map();
    const snapshot = () => [...lines.values()].sort((a, b) => a.multipv - b.multipv);
    const done = new Promise((resolve) => {
      const fn = (line) => {
        if (line.startsWith('info ')) {
          const info = parseInfo(line);
          if (!info || info.bound) return;
          lines.set(info.multipv, info);
          if (onInfo) onInfo(snapshot());
        } else if (line.startsWith('bestmove')) {
          this._listeners.delete(fn);
          const bm = line.split(/\s+/)[1];
          resolve({ bestMove: bm && bm !== '(none)' ? bm : null, lines: snapshot() });
        }
      };
      this._listeners.add(fn);
    });
    this._searching = true;
    this._send(`position fen ${fen}`);
    let go = 'go';
    if (depth) go += ` depth ${depth}`;
    if (movetime) go += ` movetime ${movetime}`;
    if (!depth && !movetime) go += ' depth 12';
    this._send(go);
    try {
      return await done;
    } finally {
      this._searching = false;
    }
  }

  // Прервать текущий поиск (результат придёт сразу с тем, что уже найдено).
  stop() {
    if (this._searching) this._send('stop');
  }

  newGame() {
    return this._enqueue(async () => {
      this._send('ucinewgame');
      await this._isReady();
    });
  }

  terminate() {
    this._listeners.clear();
    this._t.terminate();
  }
}

// Уровни игры. Первые три — свой «ослабитель»: случайный выбор из нескольких неплохих ходов.
export const LEVELS = [
  { id: 1, name: 'Пешка', note: '≈ 400', kind: 'random', depth: 2, multipv: 8, window: 600 },
  { id: 2, name: 'Конь', note: '≈ 700', kind: 'random', depth: 4, multipv: 6, window: 250 },
  { id: 3, name: 'Слон', note: '≈ 1000', kind: 'random', depth: 7, multipv: 4, window: 120 },
  { id: 4, name: 'Ладья', note: '≈ 1350', kind: 'elo', elo: 1350, movetime: 400 },
  { id: 5, name: 'Ферзь', note: '≈ 1650', kind: 'elo', elo: 1650, movetime: 500 },
  { id: 6, name: 'Король', note: '≈ 1950', kind: 'elo', elo: 1950, movetime: 600 },
  { id: 7, name: 'Мастер', note: '≈ 2300', kind: 'elo', elo: 2300, movetime: 800 },
  { id: 8, name: 'Stockfish', note: 'полная сила', kind: 'full', movetime: 1200 },
];

const scoreValue = (s) => (s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp);

// Выбор хода движком на уровне level. random — для тестов можно подменить.
// budgetMs — сколько можно думать при игре на время (иначе — время уровня).
export async function chooseMove(engine, fen, level, random = Math.random, budgetMs = null) {
  if (level.kind === 'random') {
    const res = await engine.analyse(fen, { depth: level.depth, multipv: level.multipv });
    if (!res.lines.length) return res.bestMove;
    const best = scoreValue(res.lines[0].score);
    const pool = res.lines.filter((l) => best - scoreValue(l.score) <= level.window);
    // Чуть чаще выбираем ходы получше: вес убывает с номером линии.
    const weights = pool.map((_, i) => 1 / (i + 1.5));
    let x = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) return pool[i].pv[0]; }
    return pool[0].pv[0];
  }
  const options = level.kind === 'elo'
    ? { UCI_LimitStrength: 'true', UCI_Elo: level.elo, 'Skill Level': 20 }
    : ANALYSIS_OPTIONS;
  const movetime = budgetMs ? Math.max(30, Math.min(level.movetime, budgetMs)) : level.movetime;
  const res = await engine.analyse(fen, { movetime, multipv: 1, options });
  return res.bestMove;
}
