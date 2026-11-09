// Единый реестр наборов фигур. Все сторонние наборы имеют свободные лицензии;
// подробные авторы, источники и лицензии: ../../THIRD_PARTY_ASSETS.md.
export const PIECE_SKINS = [
  { id: 'classic', name: 'Классика', folder: '' },
  { id: 'chessnut', name: 'Chessnut', folder: 'chessnut/' },
  { id: 'merida', name: 'Merida', folder: 'merida/' },
  { id: 'rhosgfx', name: 'RhosGFX', folder: 'rhosgfx/' },
  { id: 'fantasy', name: 'Fantasy', folder: 'fantasy/' },
  { id: 'spatial', name: 'Spatial', folder: 'spatial/' },
  { id: 'celtic', name: 'Celtic', folder: 'celtic/' },
  { id: 'kiwen-suwi', name: 'Kiwen Suwi', folder: 'kiwen-suwi/' },
];

const BY_ID = new Map(PIECE_SKINS.map((skin) => [skin.id, skin]));

export function normalizePieceSkin(id) {
  return BY_ID.has(id) ? id : 'classic';
}

export function pieceFolder(id) {
  return BY_ID.get(normalizePieceSkin(id)).folder;
}
