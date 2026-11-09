import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const play = readFileSync(new URL('../app/js/screens/play.js', import.meta.url), 'utf8');
const analysis = readFileSync(new URL('../app/js/screens/analysis.js', import.meta.url), 'utf8');

test('training hint uses the same Stockfish profile as post-game review', () => {
  const start = play.indexOf('async function hint()');
  const end = play.indexOf('async function undo', start);
  const block = play.slice(start, end);
  assert.match(block, /reviewSearchOptions\(settings\.get\(\)\.depth, \{ multipv: 2 \}\)/);
  assert.doesNotMatch(block, /depth:\s*14/);
});

test('analysis imports shared review depth and movetime constants', () => {
  assert.match(analysis, /REVIEW_DEPTHS as DEPTHS/);
  assert.match(analysis, /REVIEW_TIME_MS/);
  assert.doesNotMatch(analysis, /const DEPTHS = \{/);
  assert.doesNotMatch(analysis, /const REVIEW_TIME_MS = \{/);
});
