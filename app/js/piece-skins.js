// Свободные наборы шахматных фигур из Lichess.
// Upstream прибит к конкретному коммиту, чтобы внешний вид не менялся без нашего PR.
// Лицензии и авторы перечислены в /THIRD_PARTY_NOTICES.md.
export const LICHESS_PIECE_COMMIT = '9ab61b48688f55f61c050b64322707a8c6f88f41';
export const PIECE_CACHE = 'chess-piece-skins-' + LICHESS_PIECE_COMMIT.slice(0, 8);
const RAW = `https://raw.githubusercontent.com/lichess-org/lila/${LICHESS_PIECE_COMMIT}/public/piece`;

export const PIECE_SKINS = [
  { id: 'classic', name: 'Классика', source: 'cburnett', license: 'GPLv2+', local: true },
  { id: 'celtic', name: 'Celtic', source: 'celtic', license: 'MIT' },
  { id: 'chessnut', name: 'Chessnut', source: 'chessnut', license: 'Apache-2.0' },
  { id: 'fantasy', name: 'Fantasy', source: 'fantasy', license: 'MIT' },
  { id: 'firi', name: 'Firi', source: 'firi', license: 'CC BY 4.0' },
  { id: 'governor', name: 'Governor', source: 'governor', license: 'AGPLv3+' },
  { id: 'kiwen-suwi', name: 'Kiwen Suwi', source: 'kiwen-suwi', license: 'CC BY 4.0' },
  { id: 'kosal', name: 'Kosal', source: 'kosal', license: 'AGPLv3+' },
  { id: 'letter', name: 'Letter', source: 'letter', license: 'AGPLv3+' },
  { id: 'merida', name: 'Merida', source: 'merida', license: 'GPLv2+' },
  { id: 'mono', name: 'Mono', source: 'mono', license: 'GPLv2+', mode: 'mask' },
  { id: 'mpchess', name: 'MPChess', source: 'mpchess', license: 'GPLv3+' },
  { id: 'pirouetti', name: 'Pirouetti', source: 'pirouetti', license: 'AGPLv3+' },
  { id: 'pixel', name: 'Pixel', source: 'pixel', license: 'AGPLv3+' },
  { id: 'rhosgfx', name: 'RhosGFX', source: 'rhosgfx', license: 'CC0-1.0' },
  { id: 'shapes', name: 'Shapes', source: 'shapes', license: 'CC BY-SA 4.0' },
  { id: 'spatial', name: 'Spatial', source: 'spatial', license: 'MIT' },
];

export function pieceSkinInfo(id) {
  return PIECE_SKINS.find((skin) => skin.id === id) || PIECE_SKINS[0];
}

export function pieceAssetUrl(id, code, localBase = 'pieces/') {
  const skin = pieceSkinInfo(id);
  const piece = code[1].toUpperCase();
  if (skin.local) return `${localBase}${code[0]}${piece}.svg`;
  const file = skin.mode === 'mask' ? `${piece}.svg` : `${code[0]}${piece}.svg`;
  return `${RAW}/${skin.source}/${file}`;
}

export function pieceSkinAssetUrls(id) {
  const skin = pieceSkinInfo(id);
  if (skin.local) return [];
  if (skin.mode === 'mask') return ['K', 'Q', 'R', 'B', 'N', 'P'].map((p) => `${RAW}/${skin.source}/${p}.svg`);
  return ['w', 'b'].flatMap((c) => ['K', 'Q', 'R', 'B', 'N', 'P'].map((p) => `${RAW}/${skin.source}/${c}${p}.svg`));
}

// После выбора прогреваем весь набор. Service Worker перехватит эти запросы
// и оставит их в кэше, чтобы выбранные фигуры работали офлайн.
export async function warmPieceSkin(id) {
  const urls = pieceSkinAssetUrls(id);
  if (!urls.length || !navigator.onLine) return;
  const cache = typeof caches !== 'undefined' ? await caches.open(PIECE_CACHE).catch(() => null) : null;
  await Promise.allSettled(urls.map(async (url) => {
    const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (cache && res.ok) await cache.put(url, res.clone());
  }));
}
