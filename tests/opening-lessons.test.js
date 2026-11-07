import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../app/js/chess.js';
import { OPENING_LESSONS } from '../app/js/opening-lessons.js';

test('учебные дебюты: у каждого две полные линии, идеи атаки и контригра', () => {
  assert.equal(Object.keys(OPENING_LESSONS).length, 20);
  for (const [name, lesson] of Object.entries(OPENING_LESSONS)) {
    assert.equal(lesson.variants.length, 2, name);
    assert.ok(lesson.attack && lesson.counterplay, name);
    assert.equal(new Set(lesson.variants.map(v => v.name)).size, 2, name);
    for (const v of lesson.variants) { assert.ok(v.moves.length >= 8, `${name}: ${v.name}`); assert.ok(v.idea, name); }
  }
});

test('учебные дебюты: все ходы линий и показанные планы допустимы', () => {
  for (const [name, lesson] of Object.entries(OPENING_LESSONS)) for (const v of lesson.variants) {
    const game = new Chess();
    for (const san of v.moves) assert.ok(game.move(san), `${name} / ${v.name}: ${san}`);
    assert.ok(game.move(v.plan), `${name} / ${v.name}: план ${v.plan}`);
  }
});
