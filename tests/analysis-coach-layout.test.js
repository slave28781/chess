import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../app/js/screens/analysis.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');

test('review coach sits above the board but scrolls away normally', () => {
  const coach = screen.indexOf("root.append(moveCard(r, { coach: true }))");
  const board = screen.indexOf("root.append(h('div', { class: 'board-wrap' }");
  assert.ok(coach >= 0 && board >= 0 && coach < board, 'coach card must sit above board');
  assert.match(css, /\.move-card\.analysis-coach-card\s*\{[^}]*position:\s*static/s);
  assert.doesNotMatch(css, /\.move-card\.analysis-coach-card\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.analysis-coach-card \.mc-text\s*\{[^}]*line-height:/s);
  assert.match(css, /-webkit-line-clamp:\s*3/, 'mobile explanation stays compact');
});

test('review removes accuracy header and large move table from the main flow', () => {
  assert.match(screen, /if \(record\.source === 'free'\) root\.append\(playersHead\(\)\)/,
    'player header remains only for free analysis controls');
  const freeHeader = screen.match(/if \(record\.source === 'free'\) root\.append\(playersHead\(\)\)/g) || [];
  assert.equal(freeHeader.length, 1, 'accuracy/player header is only mounted for free analysis controls');
  const renderStart = screen.indexOf('function render({ animate = true } = {})');
  const renderEnd = screen.indexOf('function playersHead()', renderStart);
  const renderBody = screen.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderBody, /root\.append\(moveListCard\(\)\)/,
    'full move list is not rendered');
  assert.match(css, /#view\[data-screen="analysis"\] > \.board-wrap \.evalbar\s*\{[^}]*width:\s*12px/s,
    'left evaluation bar stays as a slim line');
});

test('compact move strip is followed immediately by the advantage graph', () => {
  const strip = screen.indexOf("if (record.moves.length && !variation) root.append(movesStrip())");
  const graph = screen.indexOf('root.append(evalGraph(', strip);
  const details = screen.indexOf('// Вторичные детали ниже графика', strip);
  assert.ok(strip >= 0 && graph > strip && details > graph,
    'move strip -> advantage graph -> secondary details');
  assert.match(css, /#view\[data-screen="analysis"\] > \.moves-strip\s*\{[^}]*min-height:\s*38px/s);
});

test('review board receives only semantic instructional arrows', () => {
  assert.match(screen, /board\.setArrows\(r \? moveVisuals\(r\) : \[\]\)/);
  assert.match(screen, /analysis-coach-legend/);
});

test('show best move animates a short engine line instead of teleporting', () => {
  const start = screen.indexOf('function showBestLine(r)');
  const end = screen.indexOf('// ---------- Разбор ----------', start);
  const block = screen.slice(start, end);
  assert.match(block, /pv\.slice\(0, 4\)/, 'playback is intentionally short');
  assert.match(block, /variation = \{ basePly: r\.ply - 1, moves, idx: 0 \}/,
    'playback starts from the position before the mistake');
  assert.match(block, /setTimeout\(advance,/);
  assert.match(block, /render\(\{ animate: !reduced \}\)/);
  assert.match(block, /playSound\(soundForMove\(last, cNow\)\)/);
  assert.match(screen, /stopBestLine\(\);[\s\S]*stopLive\(\);/,
    'playback is cancelled when leaving analysis');
});
