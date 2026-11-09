import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  LICHESS_PIECE_COMMIT, PIECE_SKINS, pieceAssetUrl, pieceSkinAssetUrls, pieceSkinInfo,
} from '../app/js/piece-skins.js';

const board = readFileSync(new URL('../app/js/board.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../app/js/main.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');

test('catalog contains exactly the 17 freely licensed piece sets', () => {
  assert.equal(PIECE_SKINS.length, 17);
  assert.deepEqual(PIECE_SKINS.map((s) => s.id), [
    'classic', 'celtic', 'chessnut', 'fantasy', 'firi', 'governor',
    'kiwen-suwi', 'kosal', 'letter', 'merida', 'mono', 'mpchess',
    'pirouetti', 'pixel', 'rhosgfx', 'shapes', 'spatial',
  ]);
  for (const skin of PIECE_SKINS) {
    assert.ok(skin.name);
    assert.ok(skin.license);
    assert.ok(skin.source);
  }
});

test('old AI-generated piece folders are gone and no longer referenced', () => {
  for (const id of ['ivory', 'marble', 'royal', 'copper', 'ocean']) {
    assert.equal(existsSync(new URL(`../app/pieces/${id}`, import.meta.url)), false, `${id} folder must be removed`);
    assert.doesNotMatch(board, new RegExp(`['"]${id}['"]`));
    assert.doesNotMatch(main, new RegExp(`['"]${id}['"]`));
    assert.doesNotMatch(sw, new RegExp(`['"]${id}['"]`));
  }
});

test('external piece URLs are pinned to a Lichess commit rather than master', () => {
  assert.match(LICHESS_PIECE_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(LICHESS_PIECE_COMMIT, '9ab61b48688f55f61c050b64322707a8c6f88f41');
  assert.equal(pieceAssetUrl('classic', 'wN'), 'pieces/wN.svg');
  assert.equal(
    pieceAssetUrl('merida', 'bQ'),
    `https://raw.githubusercontent.com/lichess-org/lila/${LICHESS_PIECE_COMMIT}/public/piece/merida/bQ.svg`,
  );
  assert.doesNotMatch(pieceAssetUrl('merida', 'bQ'), /\/master\//);
});

test('mono set uses six neutral SVG masks while normal sets use twelve colored SVGs', () => {
  assert.equal(pieceSkinInfo('mono').mode, 'mask');
  assert.match(pieceAssetUrl('mono', 'wN'), /\/mono\/N\.svg$/);
  assert.match(pieceAssetUrl('mono', 'bN'), /\/mono\/N\.svg$/);
  assert.equal(pieceSkinAssetUrls('mono').length, 6);
  assert.equal(pieceSkinAssetUrls('merida').length, 12);
  assert.match(board, /pieceSkinInfo\(settings\.get\(\)\.pieceSkin\)/);
  assert.match(board, /webkitMaskImage/);
});

test('settings uses a preview gallery and PWA caches pinned upstream piece requests', () => {
  assert.match(main, /piece-skin-grid/);
  assert.match(main, /Фигуры · 17 свободных наборов/);
  assert.match(main, /warmPieceSkin\(skin\.id\)/);
  assert.match(sw, /const CACHE = 'chess-v19'/);
  assert.match(sw, /LICHESS_PIECE_PREFIX/);
  assert.match(sw, /raw\.githubusercontent\.com\/lichess-org\/lila\/9ab61b48688f55f61c050b64322707a8c6f88f41\/public\/piece/);
  assert.match(sw, /caches\.match\(req\)/);
  assert.match(sw, /'js\/piece-skins\.js'/);
});
