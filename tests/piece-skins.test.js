import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PIECE_SKINS, normalizePieceSkin, pieceFolder } from '../app/js/piece-skins.js';

const expected = ['classic', 'chessnut', 'merida', 'rhosgfx', 'fantasy', 'spatial', 'celtic', 'kiwen-suwi'];
const pieces = ['K', 'Q', 'R', 'B', 'N', 'P'];

test('piece skin registry exposes classic plus seven licensed sets', () => {
  assert.deepEqual(PIECE_SKINS.map((x) => x.id), expected);
  assert.equal(normalizePieceSkin('ivory'), 'classic', 'removed AI skin falls back safely');
  assert.equal(pieceFolder('classic'), '');
  assert.equal(pieceFolder('chessnut'), 'chessnut/');
});

test('every selectable piece skin has all 12 SVG files', () => {
  for (const skin of PIECE_SKINS) {
    const folder = skin.folder;
    for (const color of ['w', 'b']) {
      for (const piece of pieces) {
        const path = new URL(`../app/pieces/${folder}${color}${piece}.svg`, import.meta.url);
        assert.ok(existsSync(path), `${skin.id}: missing ${color}${piece}.svg`);
      }
    }
  }
});

test('service worker caches every licensed piece set and removed AI skins are gone', () => {
  const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../app/js/main.js', import.meta.url), 'utf8');
  for (const id of expected.slice(1)) assert.match(sw, new RegExp(`['"]${id}['"]`));
  for (const old of ['ivory', 'marble', 'royal', 'copper', 'ocean']) {
    assert.doesNotMatch(sw, new RegExp(`['"]${old}['"]`));
    assert.doesNotMatch(main, new RegExp(`['"]${old}['"]`));
    assert.equal(existsSync(new URL(`../app/pieces/${old}/wK.svg`, import.meta.url)), false, `${old} assets should be removed`);
  }
});

test('third-party asset manifest names every selectable set', () => {
  const licenses = readFileSync(new URL('../THIRD_PARTY_ASSETS.md', import.meta.url), 'utf8');
  for (const id of expected) assert.ok(licenses.includes(`\`${id}\``), `license manifest must mention ${id}`);
  assert.match(licenses, /Apache-2\.0/);
  assert.match(licenses, /GPL-2\.0-or-later/);
  assert.match(licenses, /CC0-1\.0/);
  assert.match(licenses, /MIT/);
  assert.match(licenses, /CC-BY-4\.0/);
});
