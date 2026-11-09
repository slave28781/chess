// Каталог шахматных фигур. Ассеты сохраняют исходные лицензии:
// см. THIRD_PARTY_NOTICES.md в корне репозитория.
export const PIECE_SKINS = [
  { id: 'classic', name: 'Cburnett', folder: '', author: 'Colin M.L. Burnett', license: 'GPL-2.0+' },
  { id: 'mono', name: 'Mono', folder: 'mono', author: 'Thibault Duplessis & Colin M.L. Burnett', license: 'GPL-2.0+' },
  { id: 'chessnut', name: 'Chessnut', folder: 'chessnut', author: 'Alexis Luengas', license: 'Apache-2.0' },
  { id: 'letter', name: 'Letter', folder: 'letter', author: 'usolando', license: 'AGPL-3.0+' },
  { id: 'pirouetti', name: 'Pirouetti', folder: 'pirouetti', author: 'pirouetti', license: 'AGPL-3.0+' },
  { id: 'merida', name: 'Merida', folder: 'merida', author: 'Armando Hernandez Marroquin', license: 'GPL-2.0+' },
  { id: 'shapes', name: 'Shapes', folder: 'shapes', author: 'flugsio', license: 'CC-BY-SA-4.0' },
  { id: 'pixel', name: 'Pixel', folder: 'pixel', author: 'therealqtpi', license: 'AGPL-3.0+' },
  { id: 'rhosgfx', name: 'RhosGFX', folder: 'rhosgfx', author: 'RhosGFX', license: 'CC0-1.0' },
  { id: 'fantasy', name: 'Fantasy', folder: 'fantasy', author: 'Maurizio Monge', license: 'MIT' },
  { id: 'spatial', name: 'Spatial', folder: 'spatial', author: 'Maurizio Monge', license: 'MIT' },
  { id: 'celtic', name: 'Celtic', folder: 'celtic', author: 'Maurizio Monge', license: 'MIT' },
  { id: 'kiwen-suwi', name: 'Kiwen Suwi', folder: 'kiwen-suwi', author: 'neverRare', license: 'CC-BY-4.0' },
  { id: 'mpchess', name: 'MPChess', folder: 'mpchess', author: 'Maxime Chupin', license: 'GPL-3.0+' },
  { id: 'firi', name: 'Firi', folder: 'firi', author: 'James Faure', license: 'CC-BY-4.0' },
  { id: 'governor', name: 'Governor', folder: 'governor', author: 'Lichess authors', license: 'AGPL-3.0+' },
  { id: 'kosal', name: 'Kosal', folder: 'kosal', author: 'Philatype', license: 'CC-BY-4.0' },
];

export function pieceSkin(id) {
  return PIECE_SKINS.find((skin) => skin.id === id) || PIECE_SKINS[0];
}

export function pieceSkinFolder(id) {
  const folder = pieceSkin(id).folder;
  return folder ? folder + '/' : '';
}

export function pieceSkinUrl(id, code, base = 'pieces/') {
  return `${base}${pieceSkinFolder(id)}${code[0]}${code[1].toUpperCase()}.svg`;
}
