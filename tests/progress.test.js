import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newProfile, expectedScore, eloDelta, applyGameResult, applyReview, applyPuzzleSolved,
  isOpponentUnlocked, unlockedOpponents, OPPONENTS, THEMES, ACHIEVEMENTS, isThemeUnlocked, START_RATING,
} from '../app/js/progress.js';

const game = (opponentId, score, extra = {}) => ({ opponentId, score, color: 'w', timeCategory: 'none', reason: 'checkmate', fullMoves: 40, ...extra });

test('Эло: ожидаемый результат и K-фактор', () => {
  assert.equal(expectedScore(1500, 1500), 0.5);
  assert.ok(Math.abs(expectedScore(1500, 1900) - 0.0909) < 0.001, 'разница 400 → ~9%');
  const p = newProfile();
  assert.equal(p.rating, START_RATING);
  assert.equal(eloDelta(p, 500, 1), 20, 'равный соперник, K=40: +20');
  assert.equal(eloDelta(p, 500, 0), -20);
  assert.equal(eloDelta(p, 500, 0.5), 0);
  assert.ok(eloDelta(p, 700, 1) > eloDelta(p, 400, 1), 'за победу над сильным дают больше');
  assert.ok(eloDelta(p, 400, 0) < eloDelta(p, 700, 0), 'проигрыш слабому стоит дороже');
  assert.equal(eloDelta({ ...p, games: 30, rating: 1500 }, 1500, 1), 10, 'после 30 партий K=20');
  assert.equal(eloDelta({ ...p, games: 30, rating: 2500 }, 2500, 1), 5, 'выше 2400 K=10');
});

test('победа: рейтинг, счётчики, первые награды, исходный профиль не меняется', () => {
  const p0 = newProfile();
  const { profile, delta, fresh } = applyGameResult(p0, game(2, 1, { color: 'b', fullMoves: 15 }), 1000);
  assert.equal(p0.rating, 500, 'исходный профиль не изменён');
  assert.equal(delta, 30, 'победа над 700 при 500: 40 × (1 − 0.24) ≈ 30');
  assert.equal(profile.rating, 530);
  assert.equal(profile.wins, 1);
  assert.equal(profile.beaten[2], 1);
  assert.deepEqual(fresh.sort(), ['black_win', 'first_win', 'quick_mate']);
  assert.equal(profile.history.length, 1);
});

test('серия из трёх побед и сброс серии', () => {
  let p = newProfile();
  let fresh = [];
  for (let i = 0; i < 3; i++) ({ profile: p, fresh } = applyGameResult(p, game(1, 1)));
  assert.ok(fresh.includes('streak_3'));
  ({ profile: p } = applyGameResult(p, game(1, 0)));
  assert.equal(p.streak, 0);
  assert.equal(p.losses, 1);
});

test('соперники открываются победой над предыдущим или рейтингом', () => {
  let p = newProfile();
  assert.deepEqual(unlockedOpponents(p).map((o) => o.id), [1, 2]);
  const r = applyGameResult(p, game(2, 1));
  assert.deepEqual(r.unlocked, [3], 'победа над «Конём» открывает «Слона»');
  p = { ...newProfile(), rating: 1200 };
  assert.ok(isOpponentUnlocked(p, OPPONENTS[3]), 'рейтинг 1150+ открывает «Ладью»');
  assert.ok(!isOpponentUnlocked(p, OPPONENTS[4]));
});

test('награды за рейтинг, пулю и победу над Stockfish открывают стили', () => {
  let p = { ...newProfile(), rating: 690 };
  const r = applyGameResult(p, game(2, 1, { timeCategory: 'bullet' }));
  assert.ok(r.fresh.includes('rating_700'));
  assert.ok(r.fresh.includes('bullet_win'));
  assert.ok(isThemeUnlocked(r.profile, THEMES.find((t) => t.id === 'night')));
  assert.ok(isThemeUnlocked(r.profile, THEMES.find((t) => t.id === 'purple')));
  assert.ok(!isThemeUnlocked(r.profile, THEMES.find((t) => t.id === 'gold')));
  p = { ...newProfile(), rating: 2500 };
  assert.ok(applyGameResult(p, game(8, 1)).fresh.includes('beat_sf'));
});

test('награды по разбору и за задачи', () => {
  const p = newProfile();
  const r = applyReview(p, { myCounts: { brilliant: 1, mistake: 0, blunder: 0, miss: 0 }, accuracy: 93.2, myMoves: 25, won: true });
  assert.deepEqual(r.fresh.sort(), ['accuracy_90', 'brilliant', 'clean_win']);
  const short = applyReview(p, { myCounts: { brilliant: 0, mistake: 1, blunder: 0, miss: 0 }, accuracy: 95, myMoves: 10, won: true });
  assert.deepEqual(short.fresh, [], 'мало ходов и была ошибка — наград нет');
  const quick = applyReview(p, { myCounts: { brilliant: 0, mistake: 0, blunder: 0, miss: 0 }, accuracy: 80, myMoves: 4, won: true });
  assert.deepEqual(quick.fresh, [], 'детский мат за 4 хода — не «чистая победа»');
  let q = p;
  let fresh = [];
  for (let i = 0; i < 10; i++) ({ profile: q, fresh } = applyPuzzleSolved(q));
  assert.deepEqual(fresh, ['puzzles_10']);
});

test('у каждого стиля есть существующая награда', () => {
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  for (const t of THEMES) if (t.reward) assert.ok(ids.has(t.reward), t.id);
});
