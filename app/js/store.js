// Хранение на телефоне (localStorage): настройки, партии с разбором, задачи, текущая игра.

import { newProfile } from './progress.js';

const KEYS = {
  profile: 'chess.profile.v1',
  settings: 'chess.settings.v1',
  games: 'chess.games.v1',
  puzzles: 'chess.puzzles.v1',
  play: 'chess.play.v1',
};

export const DEFAULT_SETTINGS = {
  notation: 'en',
  theme: 'green',
  pieceSkin: 'classic',
  sound: true,
  coords: true,
  depth: 14,
  level: 2,
  playColor: 'w',
  myColor: 'w',
  animation: 'auto', // auto | slow | normal | fast | off
  timeControl: '5+0',
  rated: true,
};

export const profile = {
  get() { return { ...newProfile(), ...read(KEYS.profile, {}) }; },
  set(p) { return write(KEYS.profile, p); },
};

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

// false — если хранилище переполнено или недоступно.
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const settings = {
  get() { return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) }; },
  set(patch) { const s = { ...this.get(), ...patch }; write(KEYS.settings, s); return s; },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const games = {
  list() { return read(KEYS.games, []).sort((a, b) => (b.updated || 0) - (a.updated || 0)); },
  get(id) { return read(KEYS.games, []).find((g) => g.id === id) || null; },
  save(game) {
    const all = read(KEYS.games, []).filter((g) => g.id !== game.id);
    game.updated = Date.now();
    all.push(game);
    return write(KEYS.games, all);
  },
  remove(id) {
    write(KEYS.games, read(KEYS.games, []).filter((g) => g.id !== id));
    write(KEYS.puzzles, read(KEYS.puzzles, []).filter((p) => p.gameId !== id));
  },
};

export const puzzles = {
  list() { return read(KEYS.puzzles, []); },
  // Добавляет задачи партии, не дублируя уже существующие.
  addFromGame(gameId, list) {
    const all = read(KEYS.puzzles, []);
    const have = new Set(all.map((p) => p.gameId + ':' + p.ply));
    let added = 0;
    for (const p of list) {
      if (have.has(gameId + ':' + p.ply)) continue;
      all.push({ ...p, id: uid(), gameId, attempts: 0, solved: 0, failed: 0, lastTry: 0 });
      added++;
    }
    write(KEYS.puzzles, all);
    return added;
  },
  update(id, patch) {
    const all = read(KEYS.puzzles, []);
    const p = all.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    write(KEYS.puzzles, all);
    return p;
  },
  // Следующая задача: сначала нерешённые и с ошибками, потом давно не виденные.
  next(exceptId) {
    const all = read(KEYS.puzzles, []).filter((p) => p.id !== exceptId);
    if (!all.length) return read(KEYS.puzzles, [])[0] || null;
    const weight = (p) => (p.solved > p.failed ? 1 : 0) * 1e13 + (p.lastTry || 0);
    return all.sort((a, b) => weight(a) - weight(b))[0];
  },
};

export const currentPlay = {
  get() { return read(KEYS.play, null); },
  set(v) { return write(KEYS.play, v); },
  clear() { try { localStorage.removeItem(KEYS.play); } catch { /* недоступно */ } },
};

export function resetAll() {
  for (const k of Object.values(KEYS)) { try { localStorage.removeItem(k); } catch { /* недоступно */ } }
}
