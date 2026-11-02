// Экран «Игра»: партия против соперника-бота, с часами и рейтингом.
import { Chess, START_FEN } from '../chess.js';
import { Board } from '../board.js';
import { LEVELS, chooseMove } from '../engine.js';
import { writePgn } from '../pgn.js';
import { settings, currentPlay, games, uid, profile as profileStore } from '../store.js';
import { OPPONENTS, isOpponentUnlocked, unlockText, applyGameResult } from '../progress.js';
import { TIME_CONTROLS, CATEGORIES, timeControl, tcLabel, formatClock, isLowTime, engineBudget, animationMs, flagResult, humanThinkMs } from '../timecontrol.js';
import { playSound, soundForMove } from '../sound.js';
import {
  h, append, icon, fmt, toast, openSheet, segmented, switchEl, getEngine, resultText, capturedInfo, pgnDate, confirmSheet, oppAvatar, oppPieceUrl, celebrate,
} from '../ui.js';

export function mountPlay(root, { go, params = {} }) {
  let state = currentPlay.get();
  let chess = null;
  let thinking = false;
  let token = 0;
  let destroyed = false;
  let since = null;      // когда пошли текущие часы (Date.now), null — часы стоят
  let ticker = null;
  let lowWarned = false;
  const clockEls = { w: null, b: null };

  const board = new Board(h('div'), { onMove: (m, o) => userMove(m, o) });
  const top = h('div', { class: 'player' });
  const bottom = h('div', { class: 'player' });
  const strip = h('div', { class: 'moves-strip', 'aria-label': 'Ходы партии' });
  const actHint = h('button', { class: 'action', onclick: () => hint() }, icon('hint'), 'Подсказка');
  const actUndo = h('button', { class: 'action', onclick: () => undo() }, icon('undo'), 'Отменить');
  const actFlip = h('button', { class: 'action', onclick: () => { board.flip(); renderPlayers(); } }, icon('flip'), 'Перевернуть');
  const actMore = h('button', { class: 'action', onclick: () => more() }, icon('more'), 'Ещё');
  root.append(top, h('div', { class: 'board-wrap full' }, board.root), bottom, strip, h('div', { class: 'actions' }, actHint, actUndo, actFlip, actMore));

  const level = () => LEVELS.find((l) => l.id === state.level) || LEVELS[1];
  const opponent = () => OPPONENTS.find((o) => o.id === state.level) || OPPONENTS[1];
  const tc = () => timeControl(state.tc);
  const hasClock = () => tc().cat !== 'none';
  const sfColor = () => (state.color === 'w' ? 'b' : 'w');
  const inProgress = () => !state.result && state.moves.length > 0;

  function save() { currentPlay.set(state); }

  function load() {
    chess = new Chess(state.startFen);
    for (const m of state.moves) chess.move(m.uci);
  }

  function lastMove() {
    const hist = chess.history();
    return hist.length ? { from: hist.at(-1).from, to: hist.at(-1).to } : null;
  }

  // ---------- Часы ----------
  function remaining(color) {
    if (!hasClock()) return 0;
    let t = state.clock[color];
    if (since && state.clock.running === color) t -= Date.now() - since;
    return t;
  }

  function startTicker() {
    stopTicker();
    if (!hasClock() || state.result) return;
    ticker = setInterval(tick, 100);
  }

  function stopTicker() { clearInterval(ticker); ticker = null; }

  function tick() {
    if (destroyed || state.result || !state.clock.running || !since) return;
    const side = state.clock.running;
    if (remaining(side) <= 0) { flag(side); return; }
    updateClocks();
  }

  function updateClocks() {
    if (!hasClock()) return;
    for (const c of ['w', 'b']) {
      const el = clockEls[c];
      if (!el) continue;
      const ms = remaining(c);
      el.textContent = formatClock(ms);
      el.classList.toggle('on', !state.result && state.clock.running === c && !!since);
      const low = isLowTime(ms, tc().base);
      el.classList.toggle('low', low);
      if (low && c === state.color && state.clock.running === c && !lowWarned) { lowWarned = true; playSound('lowtime'); }
    }
  }

  // Ход стороны color сделан: списать время, добавить прибавку, запустить часы соперника.
  function pressClock(color) {
    if (!hasClock()) return;
    const now = Date.now();
    if (state.clock.started && state.clock.running === color && since) {
      state.clock[color] -= now - since;
      state.clock[color] += tc().inc * 1000;
    }
    // Часы пускаются после первого хода партии — чтобы было время осмотреться.
    state.clock.started = true;
    state.clock.running = color === 'w' ? 'b' : 'w';
    since = now;
    startTicker();
  }

  function pauseClock() {
    if (!hasClock() || !since || !state.clock.running) return;
    state.clock[state.clock.running] -= Date.now() - since;
    since = null;
    save();
  }

  function resumeClock() {
    if (!hasClock() || state.result || !state.clock.started || since) return;
    since = Date.now();
    startTicker();
  }

  function flag(side) {
    state.clock[side] = 0;
    since = null;
    stopTicker();
    token++;
    thinking = false;
    const r = flagResult(chess.fen(), side);
    endGame(r.result, r.reason);
  }

  const onVisibility = () => { if (document.hidden) pauseClock(); else resumeClock(); };
  document.addEventListener('visibilitychange', onVisibility);

  // ---------- Отрисовка ----------
  function renderPlayers() {
    const me = state.color, sf = sfColor();
    const onTop = board.orientation === me ? sf : me;
    const prof = profileStore.get();
    const fill = (el, color) => {
      el.innerHTML = '';
      const isSf = color === sf;
      const cap = capturedInfo(chess, color);
      const clock = hasClock() ? h('div', { class: 'clock', 'aria-label': 'Часы' }) : null;
      clockEls[color] = clock;
      const turn = !state.result && chess.turn() === color;
      append(el,
        isSf ? oppAvatar(state.level) : h('div', { class: 'avatar' }, h('img', { src: `pieces/${color}K.svg`, alt: '' })),
        h('div', { class: 'grow' },
          h('div', { class: 'player-name' }, isSf ? `${opponent().name} · ${opponent().rating}` : `Вы · ${prof.rating}`),
          h('div', { class: 'player-sub' },
            isSf && thinking ? h('span', { class: 'thinking', 'aria-label': 'думает' }, h('i'), h('i'), h('i')) : null,
            h('span', { class: 'captured' }, cap.symbols, cap.diff > 0 ? h('b', {}, `+${cap.diff}`) : null),
            !isSf ? h('span', { class: 'rated-tag' + (state.rated ? '' : ' off') }, state.rated ? 'рейтинг' : 'тренировка') : null,
            !isSf && !hasClock() && turn ? h('span', { class: 'rated-tag' + (chess.inCheck() ? ' off' : '') }, chess.inCheck() ? 'Шах!' : 'Ваш ход') : null)),
        clock);
      if (state.result && color === me) el.append(h('span', { class: 'turn-pill' }, resultText(state.result, state.reason).split(' · ')[0]));
    };
    fill(onTop === sf ? top : bottom, sf);
    fill(onTop === sf ? bottom : top, me);
    updateClocks();
  }

  function renderStrip() {
    const f = fmt();
    strip.innerHTML = '';
    const hist = chess.history();
    hist.forEach((m, i) => {
      const num = m.color === 'w' ? `${Math.floor(i / 2) + 1}.` : (i === 0 ? '1…' : '');
      strip.append(h('span', { class: 'mchip' + (i === hist.length - 1 ? ' cur' : '') }, num ? h('span', { class: 'num' }, num) : null, f(m.san)));
    });
    strip.scrollLeft = strip.scrollWidth;
  }

  function render(animate = true) {
    board.setAnimation(animationMs(settings.get().animation, tc().cat));
    board.setPosition(chess, { lastMove: lastMove(), animate });
    board.setArrows([]);
    const myTurn = !state.result && !thinking && chess.turn() === state.color;
    board.setInteractive(myTurn ? state.color : null);
    actHint.disabled = !myTurn || state.rated;
    actUndo.disabled = thinking || !state.moves.length || (state.rated && !state.result) || !!state.result;
    renderPlayers();
    renderStrip();
  }

  // ---------- Ходы ----------
  function finishIfOver() {
    const reason = chess.gameOverReason();
    if (!reason) return false;
    endGame(reason === 'checkmate' ? (chess.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2', reason);
    return true;
  }

  function endGame(result, reason) {
    if (state.result) return;
    pauseClock();
    stopTicker();
    state.result = result;
    state.reason = reason;
    let outcome = null;
    if (state.rated && !state.ratingApplied && state.moves.length >= 2) {
      const me = state.color;
      const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (me === 'w') ? 1 : 0;
      outcome = applyGameResult(profileStore.get(), {
        opponentId: state.level, score, color: me, timeCategory: tc().cat, reason, fullMoves: Math.ceil(state.moves.length / 2),
      });
      profileStore.set(outcome.profile);
      state.ratingApplied = true;
      state.ratingDelta = outcome.delta;
    }
    save();
    render(false);
    setTimeout(() => showResult(outcome), 450);
  }

  function applyMove(input, animate) {
    const color = chess.turn();
    const mv = chess.move(input);
    if (!mv) return null;
    state.moves.push({ san: mv.san, uci: mv.uci });
    pressClock(color);
    save();
    playSound(soundForMove(mv, chess));
    if (navigator.vibrate) navigator.vibrate(8);
    render(animate);
    return mv;
  }

  function userMove(m, { animate }) {
    if (thinking || state.result) return;
    if (!applyMove(m, animate)) return;
    if (!finishIfOver()) engineMove();
  }

  async function engineMove() {
    const my = ++token;
    thinking = true;
    render(false);
    const started = Date.now();
    try {
      const engine = await getEngine();
      const lv = level();
      // Сила — по уровню (поиск не дольше, чем положено уровню), а время на часах — как у человека.
      const think = hasClock()
        ? humanThinkMs({ remainingMs: remaining(sfColor()), incSec: tc().inc, ply: state.moves.length, legalMoves: chess.movesCount() })
        : 450;
      const budget = hasClock() ? engineBudget(remaining(sfColor()), tc().inc, lv.movetime || 1000) : null;
      const uci = await chooseMove(engine, chess.fen(), lv, Math.random, budget ? Math.min(budget, think) : null);
      await new Promise((r) => setTimeout(r, Math.max(0, think - (Date.now() - started))));
      if (my !== token || destroyed || state.result) return;
      thinking = false;
      applyMove(uci, true);
      finishIfOver();
    } catch (e) {
      if (my !== token) return;
      thinking = false;
      render(false);
      toast(e.message || 'Движок не ответил');
    }
  }

  async function hint() {
    if (thinking || state.result || state.rated) return;
    try {
      toast('Ищу лучший ход…', 1500);
      const engine = await getEngine();
      const res = await engine.analyse(chess.fen(), { depth: 14 });
      if (!res.bestMove || chess.turn() !== state.color) return;
      board.setArrows([{ from: res.bestMove.slice(0, 2), to: res.bestMove.slice(2, 4), color: '#5b8bd9' }]);
    } catch (e) {
      toast(e.message || 'Движок не ответил');
    }
  }

  function undo() {
    if (thinking || !state.moves.length || state.rated || state.result) return;
    token++;
    const n = chess.turn() === state.color ? 2 : 1;
    for (let i = 0; i < n && state.moves.length; i++) { chess.undo(); state.moves.pop(); }
    save();
    render(true);
    if (chess.turn() !== state.color) engineMove();
  }

  // ---------- Партия в архив ----------
  function toRecord() {
    const opp = opponent();
    const myName = 'Вы';
    const sfName = `${opp.name} (бот)`;
    const prof = profileStore.get();
    return {
      id: state.gameId || (state.gameId = uid()),
      created: state.created,
      source: 'play',
      myColor: state.color,
      headers: {
        Event: state.rated ? 'Рейтинговая партия' : 'Тренировка', Site: 'Шахматы', Date: pgnDate(state.created),
        White: state.color === 'w' ? myName : sfName, Black: state.color === 'b' ? myName : sfName, Result: state.result || '*',
        WhiteElo: String(state.color === 'w' ? prof.rating : opp.rating), BlackElo: String(state.color === 'b' ? prof.rating : opp.rating),
        TimeControl: hasClock() ? `${tc().base}+${tc().inc}` : '-',
      },
      startFen: state.startFen,
      moves: state.moves.slice(),
      result: state.result || '*',
      reason: state.reason || null,
      notes: {},
    };
  }

  function reviewNow() {
    const rec = toRecord();
    const old = games.get(rec.id);
    if (old) { rec.notes = old.notes || {}; if (old.moves.length === rec.moves.length) rec.review = old.review; }
    save();
    if (!games.save(rec)) { toast('Память телефона заполнена — удалите старые партии'); return; }
    go('analysis', { gameId: rec.id, autoReview: true });
  }

  function showResult(outcome) {
    if (destroyed) return;
    const me = state.color;
    const won = (state.result === '1-0' && me === 'w') || (state.result === '0-1' && me === 'b');
    const draw = state.result === '1/2-1/2';
    playSound('end');
    const after = (fn) => () => celebrate(outcome ? outcome.fresh : [], outcome ? outcome.unlocked : []).then(fn);
    openSheet((sheet, close) => {
      const d = outcome ? outcome.delta : null;
      append(sheet,
        h('div', { class: 'result-hero' },
          h('div', { class: 'big' }, draw ? 'Ничья' : won ? 'Победа! 🎉' : 'Поражение'),
          h('div', { class: 'muted' }, resultText(state.result, state.reason)),
          outcome ? h('div', { class: 'rating-hero', style: { justifyContent: 'center', marginTop: '6px' } },
            h('div', { class: 'big', style: { fontSize: '40px' } }, String(outcome.profile.rating)),
            h('div', { class: 'delta ' + (d >= 0 ? 'up' : 'down'), style: { paddingBottom: '6px' } }, (d >= 0 ? '+' : '−') + Math.abs(d))) : null,
          outcome ? h('div', { class: 'muted small' }, 'ваш рейтинг') : null),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => { close(); after(reviewNow)(); } }, icon('analysis'), 'Разобрать партию'),
        h('button', { class: 'btn btn-block', onclick: () => { close(); after(newGameSheet)(); } }, 'Новая игра'),
        h('button', { class: 'btn btn-ghost btn-block', onclick: () => { close(); after(() => {})(); } }, 'Закрыть'),
      );
    });
  }

  async function resign() {
    if (!inProgress()) return;
    if (!(await confirmSheet('Сдаться?', state.rated ? 'Партия закончится поражением, рейтинг уменьшится.' : 'Партия закончится поражением.', 'Сдаться', true))) return;
    token++;
    thinking = false;
    endGame(state.color === 'w' ? '0-1' : '1-0', 'resign');
  }

  function more() {
    openSheet((sheet, close) => {
      append(sheet,
        h('h2', {}, 'Партия'),
        h('div', { class: 'muted small', style: { marginTop: '-8px' } }, `${opponent().name} · ${tcLabel(state.tc)} · ${state.rated ? 'рейтинговая' : 'тренировка'}`),
        h('button', { class: 'btn btn-block btn-primary', onclick: () => { close(); newGameSheet(); } }, icon('plus'), 'Новая игра'),
        state.moves.length ? h('button', { class: 'btn btn-block', onclick: () => { close(); reviewNow(); } }, icon('analysis'), 'Разобрать партию') : null,
        state.moves.length ? h('button', { class: 'btn btn-block', onclick: () => { close(); copyPgn(); } }, icon('share'), 'Скопировать PGN') : null,
        inProgress() ? h('button', { class: 'btn btn-block btn-danger', onclick: () => { close(); resign(); } }, icon('flag'), 'Сдаться') : null,
        h('button', { class: 'btn btn-ghost btn-block', onclick: close }, 'Закрыть'),
      );
    });
  }

  async function copyPgn() {
    const text = writePgn(toRecord());
    try {
      if (navigator.share) await navigator.share({ title: 'Партия', text });
      else { await navigator.clipboard.writeText(text); toast('PGN скопирован'); }
    } catch { /* пользователь закрыл окно */ }
  }

  // ---------- Новая игра ----------
  function newGameSheet(preset = {}) {
    const s = settings.get();
    const prof = profileStore.get();
    let color = s.playColor;
    let tcId = preset.tc || s.timeControl;
    let rated = s.rated;
    let levelId = preset.level || s.level;
    if (!isOpponentUnlocked(prof, OPPONENTS.find((o) => o.id === levelId) || OPPONENTS[0])) {
      levelId = OPPONENTS.filter((o) => isOpponentUnlocked(prof, o)).at(-1).id;
    }
    openSheet((sheet, close) => {
      const tcBox = h('div', { class: 'stack', style: { gap: '10px' } });
      const drawTc = () => {
        tcBox.innerHTML = '';
        for (const cat of CATEGORIES) {
          const row = h('div', { class: 'tc-row' });
          for (const t of TIME_CONTROLS.filter((x) => x.cat === cat.id)) {
            row.append(h('button', { class: t.id === tcId ? 'on' : '', onclick: () => { tcId = t.id; drawTc(); } }, t.id === 'none' ? '∞' : t.id));
          }
          tcBox.append(h('div', { class: 'tc-group' }, h('div', { class: 'tc-title' }, cat.icon, ' ', cat.name), row));
        }
      };
      drawTc();
      const desc = h('div', { class: 'level-desc' });
      const opps = h('div', { class: 'opp-grid' });
      const drawOpps = () => {
        opps.innerHTML = '';
        for (const o of OPPONENTS) {
          const open = isOpponentUnlocked(prof, o);
          opps.append(h('button', {
            class: 'opp' + (o.id === levelId ? ' on' : '') + (open ? '' : ' locked'),
            'aria-label': `${o.name}, рейтинг ${o.rating}${open ? '' : ', закрыт'}`,
            onclick: () => { if (!open) { toast(unlockText(o)); return; } levelId = o.id; drawOpps(); },
          }, h('img', { src: oppPieceUrl(o.id), alt: '' }), h('b', {}, o.name), h('span', {}, String(o.rating))));
        }
        const o = OPPONENTS.find((x) => x.id === levelId);
        const wins = prof.beaten[o.id] || 0;
        desc.innerHTML = '';
        desc.append(h('b', {}, o.name), ` — рейтинг ≈ ${o.rating}`, wins ? ` · побед: ${wins}` : '');
      };
      drawOpps();
      append(sheet,
        h('h2', {}, 'Новая игра'),
        h('div', {}, h('div', { class: 'label' }, 'Время'), tcBox),
        h('div', {}, h('div', { class: 'label' }, `Соперник · ваш рейтинг ${prof.rating}`), opps, desc),
        h('div', {}, h('div', { class: 'label' }, 'Играю'), segmented([['w', 'Белыми'], ['b', 'Чёрными'], ['r', 'Случайно']], color, (v) => { color = v; })),
        h('div', { class: 'toggle-row' },
          h('div', {}, h('div', {}, 'Рейтинговая'), h('div', { class: 'muted small' }, 'Без подсказок и отмены ходов')),
          switchEl(rated, (v) => { rated = v; })),
        h('button', {
          class: 'btn btn-primary btn-block',
          onclick: async () => {
            close();
            settings.set({ playColor: color, level: levelId, timeControl: tcId, rated });
            if (inProgress() && state.rated && state.moves.length >= 2) {
              if (!(await confirmSheet('Бросить текущую партию?', 'Она засчитается как поражение.', 'Да, начать новую', true))) return;
              token++;
              thinking = false;
              endGame(state.color === 'w' ? '0-1' : '1-0', 'resign');
              return; // покажется итог; новую партию можно начать оттуда
            }
            start(color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color, levelId, tcId, rated);
          },
        }, 'Начать'),
      );
    });
  }

  async function start(color, levelId, tcId, rated) {
    token++;
    thinking = false;
    since = null;
    stopTicker();
    const t = timeControl(tcId);
    state = {
      color, level: levelId, tc: tcId, rated, startFen: START_FEN, moves: [], result: null, reason: null, created: Date.now(), gameId: null,
      clock: { w: t.base * 1000, b: t.base * 1000, running: null, started: false }, ratingApplied: false,
    };
    lowWarned = false;
    save();
    load();
    board.setOrientation(color);
    render(false);
    playSound('start');
    try { (await getEngine()).newGame(); } catch (e) { toast(e.message || 'Движок не запустился'); }
    if (color === 'b') engineMove();
  }

  // ---------- Запуск ----------
  board.setCoords(settings.get().coords);
  if (state && !state.clock) { state.tc = 'none'; state.rated = false; state.clock = { w: 0, b: 0, running: null, started: false }; }
  if (state) {
    load();
    board.setOrientation(state.color);
    render(false);
    if (!state.result) {
      resumeClock();
      if (chess.turn() !== state.color) engineMove();
    }
    if (params.newGame) newGameSheet(params.newGame);
  } else {
    const s = settings.get();
    state = { color: 'w', level: s.level, tc: 'none', rated: false, startFen: START_FEN, moves: [], result: null, reason: null, created: Date.now(), gameId: null, clock: { w: 0, b: 0, running: null, started: false } };
    load();
    render(false);
    newGameSheet(params.newGame || {});
  }

  return {
    destroy() {
      destroyed = true;
      token++;
      pauseClock();
      stopTicker();
      document.removeEventListener('visibilitychange', onVisibility);
    },
    refresh() { board.setCoords(settings.get().coords); render(false); },
  };
}
