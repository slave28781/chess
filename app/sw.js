// Офлайн-режим. Код приложения: сначала сеть (обновления приходят сразу), без сети — кэш.
// cache: 'no-cache' — браузер сверяется с сайтом каждый раз, а не берёт файл из своего кэша на 10 минут.
// Движок и фигуры не меняются: сначала кэш, чтобы 7 МБ не качались каждый раз.
const CACHE = 'chess-v19';
const LICHESS_PIECE_PREFIX = 'https://raw.githubusercontent.com/lichess-org/lila/9ab61b48688f55f61c050b64322707a8c6f88f41/public/piece/';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/piece-skins.js', 'js/online-config.js', 'js/online-profile.js', 'js/screens/online.js', 'js/ui.js', 'js/board.js', 'js/chess.js', 'js/pgn.js', 'js/engine.js', 'js/review.js',
  'js/comments.js', 'js/openings.js', 'js/opening-lessons.js', 'js/notation.js', 'js/store.js', 'js/sound.js',
  'js/training-ui.js', 'js/icons.js', 'js/progress.js', 'js/timecontrol.js',
  'js/screens/play.js', 'js/screens/analysis.js', 'js/screens/puzzles.js', 'js/screens/themed-puzzles.js', 'js/screens/learn.js', 'js/screens/guided-opening.js', 'js/screens/games.js', 'js/screens/profile.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  ...['w', 'b'].flatMap((c) => ['K', 'Q', 'R', 'B', 'N', 'P'].map((p) => `pieces/${c}${p}.svg`)),
];
const STATIC = ['engine/stockfish-18-lite-single.js', 'engine/stockfish-18-lite-single.wasm'];
const IMMUTABLE = /\/(engine|pieces)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Движок докачиваем в фоне, чтобы он был доступен офлайн.
    const c = await caches.open(CACHE);
    for (const url of STATIC) if (!(await c.match(url))) c.add(url).catch(() => {});
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Свободные наборы Lichess грузятся с прибитого upstream-коммита.
  // После первого запроса выбранного набора держим SVG в PWA-кэше для офлайна.
  if (req.url.startsWith(LICHESS_PIECE_PREFIX)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
