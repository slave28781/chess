// Guard against the zero-width opening board seen in mobile Safari.
// This is a layout regression check, not a substitute for a real-device screenshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../app/js/screens/guided-opening.js', import.meta.url), 'utf8');

test('guided opening board container has an explicit mobile width', () => {
  const container = css.match(/\.board-wrap\.opening-board\s*\{([^}]*)\}/);
  assert.ok(container, 'academy board container CSS exists');
  assert.match(container[1], /\bwidth:\s*min\(100%,\s*520px\)/, 'board must not shrink to zero');
  assert.match(container[1], /\balign-self:\s*center/, 'board is centered in column layout');
  assert.match(screen, /class:\s*'board-wrap opening-board'/, 'screen uses the sized wrapper');
  assert.match(screen, /width:\s*'min\(100%, 520px\)'/, 'fallback width works with stale CSS');
});

test('training board remains square and displays beginner coordinates', () => {
  assert.match(css, /\.opening-board\s*>\s*\.board\s*\{[^}]*\baspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(screen, /board\.setCoords\(true\)/, 'always show labels during lessons');
  assert.match(screen, /board\.setOrientation\(course\.side\)/, 'board faces the learner');
  assert.match(screen, /boardGuide/, 'screen includes human-readable square movement');
});
