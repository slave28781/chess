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
  assert.match(container[1], /\bwidth:\s*min\(100%,\s*var\(--opening-board-limit\),\s*520px\)/, 'board must not shrink to zero');
  assert.match(container[1], /--opening-board-limit:\s*38svh/, 'phone board must fit its viewport height');
  assert.match(container[1], /\balign-self:\s*center/, 'board is centered in column layout');
  assert.match(screen, /class:\s*'board-wrap opening-board'/, 'screen uses the sized wrapper');
  assert.match(screen, /width:\s*'min\(100%, var\(--opening-board-limit, 38svh\), 520px\)'/, 'fallback width works with stale CSS');
});

test('training board remains square and displays beginner coordinates', () => {
  assert.match(css, /\.opening-board\s*>\s*\.board\s*\{[^}]*\baspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(screen, /board\.setCoords\(true\)/, 'always show labels during lessons');
  assert.match(screen, /board\.setOrientation\(course\.side\)/, 'board faces the learner');
  assert.match(screen, /boardGuide/, 'screen includes human-readable square movement');
});

test('navigation stays beside the visible board instead of below changing explanation text', () => {
  const boardIndex = screen.indexOf('markUpBoard(game, lastMove, animate, note);');
  const controlsIndex = screen.indexOf("opening-controls opening-controls-primary");
  const stripIndex = screen.indexOf("const moveStrip =");
  const explanationIndex = screen.indexOf("root.append(h('section', { class: 'opening-explanation' }");
  assert.ok(boardIndex < controlsIndex && controlsIndex < stripIndex && stripIndex < explanationIndex,
    'board -> navigation -> move list -> explanation remains the visual order');
  assert.match(screen, /boardTop[\s\S]*getBoundingClientRect\(\)\.top/);
  assert.match(screen, /window\.scrollBy\(0, shift\)/, 'keep board at the same viewport position after moves');
  assert.match(screen, /moveStrip\.scrollLeft\s*=/, 'center current move independently without moving page');
  assert.match(css, /main#view\.opening-lesson-active\s*\{[^}]*gap:/);
});


test('alternative opening lines cannot stretch the page with intrinsic SVG dimensions', () => {
  assert.match(screen, /opening-branch-chevron/, 'branches use a compact chevron instead of unbounded SVG');
  assert.match(css, /\.opening-branch-chevron\s*\{[^}]*width:\s*22px/s, 'chevron width is constrained');
  assert.match(css, /\.opening-branch\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*22px/s);
  assert.match(css, /\.opening-branch, \.opening-branches\s*\{[^}]*max-width:\s*100%/s);
});

test('double tap zoom is disabled, while pinch zoom remains available to the browser', () => {
  assert.match(css, /html,\s*body,\s*#app\s*\{\s*touch-action:\s*manipulation;\s*\}/);
  assert.doesNotMatch(css, /user-scalable\s*=\s*(?:no|0)/i);
});

test('practice has a full-size board and a replayable, accessible completion screen', () => {
  assert.match(screen, /opening-practice-mode/);
  assert.match(css, /\.opening-practice-mode \.board-wrap\.opening-board\s*\{\s*--opening-board-limit:\s*calc\(100vw - 32px\)/);
  assert.match(screen, /opening-completion-overlay/);
  assert.match(css, /\.opening-completion-overlay\s*\{[^}]*position:\s*fixed/s);
  assert.match(screen, /Перейти к следующей главе/);
  assert.match(screen, /opening-completion-retry[\s\S]*Ещё раз/);
  assert.match(screen, /saveCompletion\(course\.id, selected\.id, errors\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*opening-completion-medal/s);
});

test('end of theory allows practice or skipping to the next chapter', () => {
  const end = screen.indexOf("if (ply >= moves.length && !variation)");
  const block = screen.slice(end, end + 750);
  assert.match(block, /Закрепить на практике/);
  assert.match(block, /Следующая глава/);
  assert.ok(block.indexOf('Закрепить на практике') < block.indexOf('Следующая глава'));
});
