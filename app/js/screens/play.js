// Экран «Игра»: партия против Stockfish на выбранном уровне.
import { Chess, START_FEN } from '../chess.js';
import { Board } from '../board.js';
import { LEVELS, chooseMove } from '../engine.js';
import { writePgn } from '../pgn.js';
import { settings, currentPlay, games, uid } from '../store.js';
import { playSound, soundForMove } from '../sound.js';
import { h, append, icon, fmt, toast, openSheet, segmented, getEngine, resultText, capturedInfo, pgnDate, confirmSheet } from '../ui.js';

export function mountPlay(root, { go }) {
  let state = currentPlay.get();
  let chess = null;
  let thinking = false;
  let token = 0;
  let destroyed = false;

  const board = new Board(h('div'), { onMove: (m, o) => userMove(m, o) });
  const top = h('div', { class: 'player' });
  const bottom = h('div', { class: 'player' });
  const strip = h('div', { class: 'moves-strip', 'aria-label': 'Ходы партии' });
  const actHint = h('button', { class: 'action', onclick: () => hint() }, icon('hint'), 'Подсказка');
  const actUndo = h('button', { class: 'action', onclick: () => undo() }, icon('undo'), 'Отменить');
  const actFlip = h('button', { class: 'action', onclick: () => { board.flip(); renderPlayers(); } }, icon('flip'), 'Перевернуть');
  const actMore = h('button', { class: 'action', onclick: () => more() }, icon('more'), 'Ещё');
  root.append(top, h('div', { class: 'board-wrap' }, board.root), bottom, strip, h('div', { class: 'actions' }, actHint, actUndo, actFlip, actMore));

  const level = () => LEVELS.find((l) => l.id === state.level) || LEVELS[3];

  function save() { currentPlay.set(state); }

  function load() {
    chess = new Chess(state.startFen);
    for (const m of state.moves) chess.move(m.uci);
  }

  function lastMove() {
    const hist = chess.history();
    return hist.length ? { from: hist.at(-1).from, to: hist.at(-1).to } : null;
  }

  function renderPlayers() {
    const me = state.color, sf = me === 'w' ? 'b' : 'w';
    const onTop = board.orientation === me ? sf : me;
    const fill = (el, color) => {
      el.innerHTML = '';
      const isSf = color === sf;
      const cap = capturedInfo(chess, color);
      const turn = !state.result && chess.turn() === color;
      append(el,
        h('div', { class: 'avatar' + (isSf ? ' sf' : '') }, h('img', { src: `pieces/${color}${isSf ? 'N' : 'K'}.svg`, alt: '' })),
        h('div', { class: 'grow' },
          h('div', { class: 'player-name' }, isSf ? `Stockfish · ${level().name}` : 'Вы'),
          h('div', { class: 'player-sub' },
            isSf && thinking ? h('span', { class: 'thinking', 'aria-label': 'думает' }, h('i'), h('i'), h('i')) : null,
            h('span', { class: 'captured' }, cap.symbols, cap.diff > 0 ? h('b', {}, `+${cap.diff}`) : null),
            isSf && !thinking ? h('span', {}, level().note) : null)),
        turn ? h('span', { class: 'turn-pill' + (isSf ? '' : chess.inCheck() ? ' alert' : ' mine') }, isSf ? 'думает' : chess.inCheck() ? 'Шах!' : 'Ваш ход') : null,
      );
      if (state.result && color === me) el.append(h('span', { class: 'turn-pill' }, resultText(state.result, state.reason).split(' · ')[0]));
    };
    fill(onTop === sf ? top : bottom, sf);
    fill(onTop === sf ? bottom : top, me);
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
    board.setPosition(chess, { lastMove: lastMove(), animate });
    board.setArrows([]);
    const myTurn = !state.result && !thinking && chess.turn() === state.color;
    board.setInteractive(myTurn ? state.color : null);
    actHint.disabled = !myTurn;
    actUndo.disabled = thinking || !state.moves.length;
    renderPlayers();
    renderStrip();
  }

  function finishIfOver() {
    const reason = chess.gameOverReason();
    if (!reason) return false;
    state.result = reason === 'checkmate' ? (chess.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2';
    state.reason = reason;
    save();
    setTimeout(() => showResult(), 450);
    return true;
  }

  function applyMove(input, animate) {
    const mv = chess.move(input);
    if (!mv) return null;
    state.moves.push({ san: mv.san, uci: mv.uci });
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
      const uci = await chooseMove(engine, chess.fen(), level());
      const wait = Math.max(0, 450 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      if (my !== token || destroyed) return;
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
    if (thinking || state.result) return;
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
    if (thinking || !state.moves.length) return;
    token++;
    const n = chess.turn() === state.color ? 2 : 1;
    for (let i = 0; i < n && state.moves.length; i++) { chess.undo(); state.moves.pop(); }
    state.result = null;
    state.reason = null;
    save();
    render(true);
    if (chess.turn() !== state.color) engineMove();
  }

  function toRecord() {
    const lv = level();
    const white = state.color === 'w' ? 'Вы' : `Stockfish (${lv.name})`;
    const black = state.color === 'b' ? 'Вы' : `Stockfish (${lv.name})`;
    return {
      id: state.gameId || (state.gameId = uid()),
      created: state.created,
      source: 'play',
      myColor: state.color,
      headers: { Event: 'Игра против Stockfish', Site: 'Шахматы', Date: pgnDate(state.created), White: white, Black: black, Result: state.result || '*' },
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

  function showResult() {
    if (destroyed) return;
    const me = state.color;
    const won = (state.result === '1-0' && me === 'w') || (state.result === '0-1' && me === 'b');
    const draw = state.result === '1/2-1/2';
    playSound('end');
    openSheet((sheet, close) => {
      sheet.append(
        h('div', { class: 'result-hero' },
          h('div', { class: 'big' }, draw ? 'Ничья' : won ? 'Победа! 🎉' : 'Поражение'),
          h('div', { class: 'muted' }, resultText(state.result, state.reason))),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => { close(); reviewNow(); } }, icon('analysis'), 'Разобрать партию'),
        h('button', { class: 'btn btn-block', onclick: () => { close(); newGameSheet(); } }, 'Новая игра'),
        h('button', { class: 'btn btn-ghost btn-block', onclick: close }, 'Закрыть'),
      );
    });
  }

  function more() {
    openSheet((sheet, close) => {
      append(sheet,
        h('h2', {}, 'Партия'),
        h('button', { class: 'btn btn-block btn-primary', onclick: () => { close(); newGameSheet(); } }, icon('plus'), 'Новая игра'),
        state.moves.length ? h('button', { class: 'btn btn-block', onclick: () => { close(); reviewNow(); } }, icon('analysis'), 'Разобрать партию') : null,
        state.moves.length ? h('button', { class: 'btn btn-block', onclick: () => { close(); copyPgn(); } }, icon('share'), 'Скопировать PGN') : null,
        !state.result && state.moves.length ? h('button', {
          class: 'btn btn-block btn-danger',
          onclick: async () => {
            close();
            if (!(await confirmSheet('Сдаться?', 'Партия закончится поражением.', 'Сдаться', true))) return;
            token++;
            thinking = false;
            state.result = state.color === 'w' ? '0-1' : '1-0';
            state.reason = 'resign';
            save();
            render(false);
            showResult();
          },
        }, icon('flag'), 'Сдаться') : null,
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

  function newGameSheet() {
    const s = settings.get();
    let color = s.playColor, levelId = s.level;
    openSheet((sheet, close) => {
      const desc = h('div', { class: 'level-desc' });
      const levels = h('div', { class: 'levels' });
      const drawLevels = () => {
        levels.innerHTML = '';
        for (const l of LEVELS) levels.append(h('button', { class: l.id === levelId ? 'on' : '', 'aria-label': `Уровень ${l.id}: ${l.name}`, onclick: () => { levelId = l.id; drawLevels(); } }, String(l.id)));
        const l = LEVELS.find((x) => x.id === levelId);
        desc.innerHTML = '';
        desc.append(h('b', {}, l.name), ` — ${l.note}`);
      };
      drawLevels();
      sheet.append(
        h('h2', {}, 'Новая игра'),
        h('div', {}, h('div', { class: 'label' }, 'Играю'), segmented([['w', 'Белыми'], ['b', 'Чёрными'], ['r', 'Случайно']], color, (v) => { color = v; })),
        h('div', {}, h('div', { class: 'label' }, 'Сила соперника'), levels, desc),
        h('button', {
          class: 'btn btn-primary btn-block',
          onclick: () => {
            close();
            settings.set({ playColor: color, level: levelId });
            start(color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color, levelId);
          },
        }, 'Начать'),
      );
    });
  }

  async function start(color, levelId) {
    token++;
    thinking = false;
    state = { color, level: levelId, startFen: START_FEN, moves: [], result: null, reason: null, created: Date.now(), gameId: null };
    save();
    load();
    board.setOrientation(color);
    render(false);
    try { (await getEngine()).newGame(); } catch (e) { toast(e.message || 'Движок не запустился'); }
    if (color === 'b') engineMove();
  }

  board.setCoords(settings.get().coords);
  if (state) {
    load();
    board.setOrientation(state.color);
    render(false);
    if (!state.result && chess.turn() !== state.color) engineMove();
  } else {
    state = { color: 'w', level: settings.get().level, startFen: START_FEN, moves: [], result: null, reason: null, created: Date.now(), gameId: null };
    load();
    render(false);
    newGameSheet();
  }

  return {
    destroy() { destroyed = true; token++; },
    refresh() { board.setCoords(settings.get().coords); render(false); },
  };
}
