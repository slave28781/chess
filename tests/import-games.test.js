import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLichessImport, normalizeChessComImport, scoreLabel,
  importFavoriteKey, toggleImportFavorite,
} from '../app/js/import-games.js';

test('Lichess import keeps colors, ratings, result and searched player color', () => {
  const g = normalizeLichessImport({
    createdAt: 123,
    winner: 'white',
    pgn: '[Result "1-0"]\n\n1. e4 e5 1-0',
    players: {
      white: { user: { name: 'Slava' }, rating: 1532 },
      black: { user: { name: 'Opponent' }, rating: 1498 },
    },
  }, 'slava');
  assert.deepEqual(
    { white: g.white, black: g.black, whiteRating: g.whiteRating, blackRating: g.blackRating, myColor: g.myColor, result: g.result },
    { white: 'Slava', black: 'Opponent', whiteRating: 1532, blackRating: 1498, myColor: 'w', result: '1-0' },
  );
});

test('Chess.com import detects black side and PGN draw result', () => {
  const g = normalizeChessComImport({
    end_time: 100,
    pgn: '[Result "1/2-1/2"]\n\n1. Nf3 Nf6 1/2-1/2',
    white: { username: 'Opponent', rating: 1601, result: 'agreed' },
    black: { username: 'SLAVA', rating: 1588, result: 'agreed' },
  }, 'slava');
  assert.equal(g.myColor, 'b');
  assert.equal(g.result, '1/2-1/2');
  assert.equal(g.whiteRating, 1601);
  assert.equal(g.blackRating, 1588);
  assert.equal(g.createdAt, 100000);
  assert.equal(scoreLabel(g.result), '½–½');
});

test('favorite players are unique per service and toggle off cleanly', () => {
  let list = [];
  list = toggleImportFavorite(list, { source: 'lichess', name: 'Slava' });
  list = toggleImportFavorite(list, { source: 'chesscom', name: 'Slava' });
  assert.equal(list.length, 2);
  assert.notEqual(importFavoriteKey(list[0]), importFavoriteKey(list[1]));
  list = toggleImportFavorite(list, { source: 'lichess', name: 'slava' });
  assert.equal(list.length, 1);
  assert.equal(list[0].source, 'chesscom');
});

test('favorite list is capped and newest player appears first', () => {
  let list = [];
  for (let i = 0; i < 10; i++) list = toggleImportFavorite(list, { source: 'lichess', name: `player${i}` });
  assert.equal(list.length, 8);
  assert.equal(list[0].name, 'player9');
});
