import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PIECE_SKINS, pieceSkinFolder, pieceSkinUrl } from '../app/js/piece-skins.js';

const pieces = ['K', 'Q', 'R', 'B', 'N', 'P'];

test('piece skin catalog contains only unique open-licensed sets', () => {
  assert.equal(PIECE_SKINS.length, 17);
  assert.equal(new Set(PIECE_SKINS.map((x) => x.id)).size, PIECE_SKINS.length);
  for (const skin of PIECE_SKINS) {
    assert.ok(skin.license && !/NC|freeware|personal/i.test(skin.license));
    assert.ok(skin.author);
  }
});

test('every listed skin has all twelve SVG pieces', () => {
  for (const skin of PIECE_SKINS) {
    for (const color of ['w', 'b']) for (const piece of pieces) {
      const rel = pieceSkinUrl(skin.id, color + piece);
      assert.ok(existsSync(new URL('../app/' + rel, import.meta.url)), skin.id + ': ' + rel);
    }
  }
});

test('legacy AI skin folders are no longer referenced or shipped', () => {
  const legacy = ['ivory', 'marble', 'royal', 'copper', 'ocean'];
  const board = readFileSync(new URL('../app/js/board.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../app/js/main.js', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  for (const id of legacy) {
    assert.equal(existsSync(new URL('../app/pieces/' + id, import.meta.url)), false, id);
    assert.ok(!board.includes("'" + id + "'"));
    assert.ok(!main.includes("'" + id + "'"));
    assert.ok(!sw.includes("'" + id + "'"));
  }
});

test('unknown saved skin safely falls back to classic Cburnett', () => {
  assert.equal(pieceSkinFolder('old-removed-skin'), '');
  assert.equal(pieceSkinUrl('old-removed-skin', 'wN'), 'pieces/wN.svg');
});
