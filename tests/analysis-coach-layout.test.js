import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../app/js/screens/analysis.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');

test('review coach card is rendered before the board and not duplicated below it', () => {
  const coach = screen.indexOf("root.append(moveCard(r, { coach: true }))");
  const board = screen.indexOf("root.append(h('div', { class: 'board-wrap' }");
  assert.ok(coach >= 0 && board >= 0 && coach < board, 'coach card must sit above board');
  const lower = screen.slice(board, screen.indexOf('if (!data && !reviewing'));
  assert.doesNotMatch(lower, /root\.append\(moveCard\(r\)\)/, 'reviewed move card is not duplicated below board');
  assert.match(lower, /root\.append\(noteCard\(r\)\)/, 'notes move into a secondary panel');
});

test('review coach remains compact and visible while scrolling', () => {
  assert.match(css, /\.move-card\.analysis-coach-card\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.analysis-coach-card \.mc-text\s*\{[^}]*line-height:/s);
  assert.match(css, /-webkit-line-clamp:\s*3/, 'mobile explanation is clamped');
  assert.match(css, /\.analysis-note-card\s*\{/, 'notes have a separate disclosure');
});

test('review board receives only semantic instructional arrows', () => {
  assert.match(screen, /board\.setArrows\(r \? moveVisuals\(r\) : \[\]\)/);
  assert.match(screen, /analysis-coach-legend/);
});
