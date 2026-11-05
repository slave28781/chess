// Рейтинг (Эло), награды и то, что они открывают: новых соперников и стили доски.
// Чистая логика без DOM — проверяется тестами.

export const START_RATING = 500;

// Соперники-боты: рейтинг и условие открытия. Уровни движка — в engine.js (LEVELS), связь по id.
export const OPPONENTS = [
  { id: 1, name: 'Пешка', rating: 400, unlock: null },
  { id: 2, name: 'Конь', rating: 700, unlock: null },
  { id: 3, name: 'Слон', rating: 1000, unlock: { beat: 2, rating: 850 } },
  { id: 4, name: 'Ладья', rating: 1350, unlock: { beat: 3, rating: 1150 } },
  { id: 5, name: 'Ферзь', rating: 1650, unlock: { beat: 4, rating: 1450 } },
  { id: 6, name: 'Король', rating: 1950, unlock: { beat: 5, rating: 1750 } },
  { id: 7, name: 'Мастер', rating: 2300, unlock: { beat: 6, rating: 2050 } },
  { id: 8, name: 'Stockfish', rating: 3000, unlock: { beat: 7, rating: 2400 } },
];

// Стили доски. reward — id награды, которая открывает стиль (null — открыт сразу).
export const THEMES = [
  { id: 'green', name: 'Зелёная', light: '#ebecd0', dark: '#739552', reward: null },
  { id: 'slate', name: 'Сланец', light: '#e2e8e8', dark: '#667e87', reward: null },
  { id: 'rose', name: 'Роза', light: '#f6e5e4', dark: '#b77980', reward: null },
  { id: 'forest', name: 'Лес', light: '#e4e9d6', dark: '#547363', reward: null },
  { id: 'brown', name: 'Дерево', light: '#f0d9b5', dark: '#b58863', reward: null },
  { id: 'blue', name: 'Синяя', light: '#dee3e6', dark: '#8ca2ad', reward: 'first_win' },
  { id: 'purple', name: 'Фиолетовая', light: '#e8e1f2', dark: '#8c74b4', reward: 'rating_700' },
  { id: 'sand', name: 'Песок', light: '#f4ead5', dark: '#c9a66b', reward: 'streak_3' },
  { id: 'night', name: 'Ночь', light: '#aab3c5', dark: '#4f5a74', reward: 'bullet_win' },
  { id: 'coral', name: 'Коралл', light: '#f6e7dc', dark: '#d07c60', reward: 'rating_1000' },
  { id: 'teal', name: 'Бирюза', light: '#dff2ef', dark: '#3c9a92', reward: 'brilliant' },
  { id: 'emerald', name: 'Изумруд', light: '#e5f1e7', dark: '#2f7d5b', reward: 'accuracy_90' },
  { id: 'gold', name: 'Золото', light: '#f8efcf', dark: '#c49b2a', reward: 'beat_sf' },
];

export const ACHIEVEMENTS = [
  { id: 'first_win', icon: '🏆', title: 'Первая победа', desc: 'Выиграйте любую партию с рейтингом' },
  { id: 'black_win', icon: '♚', title: 'За чёрных', desc: 'Выиграйте чёрными' },
  { id: 'streak_3', icon: '🔥', title: 'Серия', desc: 'Три победы подряд' },
  { id: 'bullet_win', icon: '⚡', title: 'Пуля', desc: 'Выиграйте партию в пулю (1–2 минуты)' },
  { id: 'quick_mate', icon: '⏱', title: 'Быстрый мат', desc: 'Поставьте мат до 20-го хода' },
  { id: 'rating_700', icon: '📈', title: 'Рейтинг 700', desc: 'Наберите 700' },
  { id: 'rating_1000', icon: '🎯', title: 'Рейтинг 1000', desc: 'Наберите 1000' },
  { id: 'rating_1300', icon: '🥉', title: 'Рейтинг 1300', desc: 'Наберите 1300' },
  { id: 'rating_1600', icon: '🥈', title: 'Рейтинг 1600', desc: 'Наберите 1600' },
  { id: 'rating_2000', icon: '🥇', title: 'Рейтинг 2000', desc: 'Наберите 2000' },
  { id: 'brilliant', icon: '💎', title: 'Бриллиант', desc: 'Сделайте блестящий ход в своей партии' },
  { id: 'accuracy_90', icon: '🎖', title: 'Снайпер', desc: 'Точность 90% и выше в своей партии от 20 ходов' },
  { id: 'clean_win', icon: '🛡', title: 'Чистая победа', desc: 'Победа от 15 ходов без ошибок и зевков (по разбору)' },
  { id: 'puzzles_10', icon: '🧩', title: 'Решатель', desc: 'Решите 10 задач из своих ошибок' },
  { id: 'beat_sf', icon: '👑', title: 'Легенда', desc: 'Победите Stockfish на полной силе' },
];

export function newProfile() {
  return {
    rating: START_RATING,
    peak: START_RATING,
    games: 0, wins: 0, losses: 0, draws: 0,
    streak: 0,
    beaten: {},        // { [opponentId]: число побед }
    achievements: {},  // { [id]: время получения }
    puzzlesSolved: 0,
    history: [],       // [{ t, rating, delta, opp, score }]
  };
}

// Эло: ожидаемый результат и изменение рейтинга. K как у ФИДЕ: 40 для новичков (первые 30 партий), 20 до 2400, затем 10.
export function expectedScore(rating, opp) {
  return 1 / (1 + Math.pow(10, (opp - rating) / 400));
}

export function kFactor(profile) {
  if (profile.games < 30) return 40;
  return profile.rating < 2400 ? 20 : 10;
}

export function eloDelta(profile, oppRating, score) {
  return Math.round(kFactor(profile) * (score - expectedScore(profile.rating, oppRating)));
}

function grant(profile, id, now, fresh) {
  if (profile.achievements[id]) return;
  profile.achievements[id] = now;
  fresh.push(id);
}

function ratingAchievements(profile, now, fresh) {
  for (const r of [700, 1000, 1300, 1600, 2000]) if (profile.rating >= r) grant(profile, `rating_${r}`, now, fresh);
}

/**
 * Итог рейтинговой партии.
 * game: { opponentId, score: 1 | 0.5 | 0, color: 'w'|'b', timeCategory: 'bullet'|'blitz'|'rapid'|'none', reason, fullMoves }
 * → { profile (новый объект), delta, fresh: [id новых наград], unlocked: [id открытых соперников] }
 */
export function applyGameResult(profile0, game, now = Date.now()) {
  const profile = structuredClone(profile0);
  const opp = OPPONENTS.find((o) => o.id === game.opponentId);
  const before = unlockedOpponents(profile).map((o) => o.id);
  const delta = eloDelta(profile, opp.rating, game.score);
  profile.rating = Math.max(100, profile.rating + delta);
  profile.peak = Math.max(profile.peak, profile.rating);
  profile.games++;
  const fresh = [];
  if (game.score === 1) {
    profile.wins++;
    profile.streak = Math.max(0, profile.streak) + 1;
    profile.beaten[opp.id] = (profile.beaten[opp.id] || 0) + 1;
    grant(profile, 'first_win', now, fresh);
    if (game.color === 'b') grant(profile, 'black_win', now, fresh);
    if (profile.streak >= 3) grant(profile, 'streak_3', now, fresh);
    if (game.timeCategory === 'bullet') grant(profile, 'bullet_win', now, fresh);
    if (game.reason === 'checkmate' && game.fullMoves && game.fullMoves < 20) grant(profile, 'quick_mate', now, fresh);
    if (opp.id === 8) grant(profile, 'beat_sf', now, fresh);
  } else if (game.score === 0) {
    profile.losses++;
    profile.streak = 0;
  } else {
    profile.draws++;
    profile.streak = 0;
  }
  ratingAchievements(profile, now, fresh);
  profile.history.push({ t: now, rating: profile.rating, delta, opp: opp.id, score: game.score });
  if (profile.history.length > 300) profile.history = profile.history.slice(-300);
  const unlocked = unlockedOpponents(profile).map((o) => o.id).filter((id) => !before.includes(id));
  return { profile, delta, fresh, unlocked };
}

/**
 * Награды по разбору своей партии.
 * info: { myCounts: { brilliant, mistake, blunder, miss, ... }, accuracy, myMoves, won }
 */
export function applyReview(profile0, info, now = Date.now()) {
  const profile = structuredClone(profile0);
  const fresh = [];
  if (info.myCounts.brilliant > 0) grant(profile, 'brilliant', now, fresh);
  if (info.accuracy !== null && info.accuracy >= 90 && info.myMoves >= 20) grant(profile, 'accuracy_90', now, fresh);
  if (info.won && info.myMoves >= 15 && !info.myCounts.mistake && !info.myCounts.blunder && !info.myCounts.miss) grant(profile, 'clean_win', now, fresh);
  return { profile, fresh };
}

export function applyPuzzleSolved(profile0, now = Date.now()) {
  const profile = structuredClone(profile0);
  profile.puzzlesSolved = (profile.puzzlesSolved || 0) + 1;
  const fresh = [];
  if (profile.puzzlesSolved >= 10) grant(profile, 'puzzles_10', now, fresh);
  return { profile, fresh };
}

export function isOpponentUnlocked(profile, opp) {
  if (!opp.unlock) return true;
  return (profile.beaten[opp.unlock.beat] || 0) > 0 || profile.rating >= opp.unlock.rating;
}

export function unlockedOpponents(profile) {
  return OPPONENTS.filter((o) => isOpponentUnlocked(profile, o));
}

export function unlockText(opp) {
  if (!opp.unlock) return '';
  const prev = OPPONENTS.find((o) => o.id === opp.unlock.beat);
  return `Победите «${prev.name}» или наберите ${opp.unlock.rating}`;
}

export function isThemeUnlocked(profile, theme) {
  return !theme.reward || !!profile.achievements[theme.reward];
}

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

// Что открывает награда (для поздравления).
export function rewardsOf(achievementId) {
  return THEMES.filter((t) => t.reward === achievementId);
}
