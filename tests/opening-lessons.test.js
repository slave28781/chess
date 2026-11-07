import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../app/js/chess.js';
import { OPENING_COURSES, courseByName, makeOpeningPosition } from '../app/js/opening-lessons.js';

const SQUARE = /^[a-h][1-8]$/;

test('Italian and Caro-Kann have distinct complete eight-chapter courses', () => {
  assert.equal(OPENING_COURSES.length, 2);
  assert.equal(courseByName('Итальянская партия', 'w')?.id, 'italian');
  assert.equal(courseByName('Защита Каро — Канн', 'b')?.id, 'caro');
  assert.equal(courseByName('Итальянская партия', 'b'), null);
  for (const course of OPENING_COURSES) {
    assert.equal(course.chapters.length, 8, course.id);
    assert.ok(course.intro.length > 70, 'each course needs a detailed introduction');
    assert.ok(course.principles.length >= 3, 'each course needs practical principles');
  }
});

for (const course of OPENING_COURSES) {
  test(course.title + ': every chapter has legal SAN, notes, arrows and legal sidelines', () => {
    const seen = new Set();
    for (const ch of course.chapters) {
      assert.ok(!seen.has(ch.id), 'unique chapter id ' + ch.id);
      seen.add(ch.id);
      assert.ok(ch.moves.length >= 10, ch.id + ' should cover an actual opening line');
      assert.ok(Object.keys(ch.notes).length >= 4, ch.id + ' needs explanatory key moments');
      assert.ok(ch.branches.length, ch.id + ' needs at least one variation');
      const game = new Chess();
      for (const [i, san] of ch.moves.entries()) {
        const before = game.fen();
        const move = game.move(san);
        assert.ok(move, ch.id + ' main move ' + (i + 1) + ': ' + san + ' from ' + before);
        const position = makeOpeningPosition(ch.moves, i + 1, Chess);
        assert.equal(position.game.fen(), game.fen(), 'position after ' + san);
      }
      for (const note of Object.values(ch.notes)) {
        assert.ok(note.ply > 0 && note.ply <= ch.moves.length, ch.id + ' note range');
        assert.ok(note.text.length >= 65, ch.id + ' note needs an explanation');
        for (const arrow of note.arrows) {
          assert.match(arrow.from, SQUARE, ch.id + ' arrow from');
          assert.match(arrow.to, SQUARE, ch.id + ' arrow to');
          assert.notEqual(arrow.from, arrow.to);
        }
      }
      for (const variation of ch.branches) {
        assert.ok(variation.at >= 0 && variation.at < ch.moves.length, ch.id + ' sideline start');
        assert.ok(variation.why.length >= 55, ch.id + ' branch explanation');
        assert.ok(variation.moves.length >= 2, ch.id + ' branch must show a reply');
        assert.notEqual(variation.moves[0], ch.moves[variation.at],
          ch.id + ' branch must actually differ from main line');
        const alternative = new Chess();
        for (const san of ch.moves.slice(0, variation.at).concat(variation.moves)) {
          const fen = alternative.fen();
          assert.ok(alternative.move(san), ch.id + ' invalid branch move ' + san + ' at ' + fen);
        }
      }
      const rehearsal = new Chess();
      let traineeMoves = 0;
      for (const san of ch.moves) {
        if (rehearsal.turn() === course.side) traineeMoves++;
        assert.ok(rehearsal.move(san), ch.id + ' rehearsal move ' + san);
      }
      assert.ok(traineeMoves >= 4, ch.id + ' should train several own moves');
    }
  });
}

test('academy lesson contents remain completely self-contained, with no network dependencies', () => {
  const text = JSON.stringify(OPENING_COURSES);
  assert.ok(text.includes('d4'));
  assert.ok(text.includes('c5'));
  assert.ok(!/https?:\/\//.test(text));
});


test('opening lesson screens import without syntax errors', async () => {
  const [{ mountGuidedOpening }, { mountLearn }] = await Promise.all([
    import('../app/js/screens/guided-opening.js'),
    import('../app/js/screens/learn.js'),
  ]);
  assert.equal(typeof mountGuidedOpening, 'function');
  assert.equal(typeof mountLearn, 'function');
});
