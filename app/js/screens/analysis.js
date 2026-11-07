// Экран «Анализ»: ввод партии, разбор со Stockfish, просмотр ходов, свои варианты, заметки, экспорт.
import { Chess, START_FEN } from '../chess.js';
import { Board } from '../board.js';
import { parsePgn, writePgn } from '../pgn.js';
import { reviewGame, classifyGame, extractPuzzles, toWhitePov, formatScore, winPercent, CLASSES, CLASS_ORDER, CLASS_NAG, uciLineToSan, terminalEval } from '../review.js';
import { moveComment, gameSummary } from '../comments.js';
import { classIconSvg } from '../icons.js';
import { settings, games, puzzles, uid, profile as profileStore } from '../store.js';
import { applyReview } from '../progress.js';
import { animationMs } from '../timecontrol.js';
import { playSound, soundForMove } from '../sound.js';
import {
  h, icon, fmt, toast, openSheet, segmented, getEngine, EvalBar, evalGraph, clsIcon, resultText, pgnDate, confirmSheet, celebrate,
} from '../ui.js';

const EXAMPLE = `[Event "Opera Game"]
[Site "Paris"]
[Date "1858.??.??"]
[White "Пол Морфи"]
[Black "Герцог Брауншвейгский и граф Изуар"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const FEN_RE = /^\s*[rnbqkpRNBQKP1-8]+(\/[rnbqkpRNBQKP1-8]+){7}\s+[wb]\b/;
const NOTABLE = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']);
const DEPTHS = { fast: 12, normal: 16, deep: 20 };
const REVIEW_TIME_MS = { 12: 700, 16: 1400, 20: 2500 }; // Макс. время на позицию.
function liveDepth(chess) {
  const moves = chess.movesCount();
  return chess.inCheck() || moves <= 12 ? 22 : moves >= 32 ? 16 : 20;
}

export function mountAnalysis(root, { go, params = {} }) {
  let record = null;        // { id, headers, startFen, moves, result, myColor, review?, notes, source }
  let data = null;          // результат classifyGame
  let ply = -1;             // текущий ход основной партии (−1 — начальная позиция)
  let variation = null;     // { basePly, moves: [{ san, uci }], idx }
  let reviewing = null;     // { done, total, cancel }
  let live = { token: 0, running: false, lines: null, fen: null };
  let destroyed = false;
  let noteTimer = null;
  let fxToken = 0;
  let shownPly = null;
  let highlightUntil = 0;
  let moveEvalToken = 0, evaluatingMove = false;

  const board = new Board(h('div'), { onMove: (m, o) => boardMove(m, o) });
  const evalBar = new EvalBar();

  // ---------- Позиция ----------
  function chessAt(p = ply, v = variation) {
    const c = new Chess(record.startFen);
    const upto = v ? v.basePly : p;
    for (let i = 0; i <= upto; i++) c.move(record.moves[i].uci);
    if (v) for (let i = 0; i < v.idx; i++) c.move(v.moves[i].uci);
    return c;
  }

  function lastMoveOf(c) {
    const hist = c.history();
    return hist.length ? { from: hist.at(-1).from, to: hist.at(-1).to } : null;
  }

  // ---------- Живой анализ ----------
  async function startLive() {
    const my = ++live.token;
    live.lines = null;
    if (reviewing || destroyed) return;
    const c = chessAt();
    live.fen = c.fen();
    const term = terminalEval(live.fen);
    if (term) { updateLive(); return; }
    let engine;
    try { engine = await getEngine(); } catch (e) { toast(e.message || 'Движок не запустился'); return; }
    if (my !== live.token || destroyed) return;
    if (live.running) engine.stop();
    live.running = true;
    const turn = c.turn();
    let raf = 0;
    try {
      const cfg = settings.get();
      await engine.analyse(live.fen, {
        depth: liveDepth(c),
        movetime: 4000,
        multipv: Math.max(1, Math.min(5, Number(cfg.analysisLines) || 3)),
        shouldSkip: () => my !== live.token || destroyed || !needsLive(),
        onInfo: (lines) => {
          if (my !== live.token) return;
          live.lines = lines.map((l) => ({ ...l, score: toWhitePov(l.score, turn) }));
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (my === live.token) updateLive(); });
        },
      });
    } finally {
      if (my === live.token) live.running = false;
    }
  }

  async function stopLive() {
    live.token++;
    if (!live.running) return;
    live.running = false;
    try { (await getEngine()).stop(); } catch { /* движок не запущен */ }
  }

  function needsLive() {
    return !!record && !reviewing && (variation || !data);
  }

  // ---------- Ввод хода на доске ----------
  function boardMove(m, { animate }) {
    if (!record || reviewing || Date.now() < highlightUntil) return;
    const c = chessAt();
    const beforeFen = c.fen();
    const mv = c.move(m);
    if (!mv) return;
    playSound(soundForMove(mv, c));
    const step = { san: mv.san, uci: mv.uci };
    if (!variation) {
      if (record.moves[ply + 1] && record.moves[ply + 1].uci === mv.uci) { ply++; }
      else if (record.source === 'free' && ply === record.moves.length - 1) { record.moves.push(step); ply++; data = null; }
      else variation = { basePly: ply, moves: [step], idx: 1 };
    } else {
      variation.moves = variation.moves.slice(0, variation.idx);
      variation.moves.push(step);
      variation.idx++;
    }
    render({ animate });
    if ((variation && variation.moves[variation.idx - 1] === step) || (record.source === 'free' && record.moves[ply] === step)) evaluateMove(beforeFen, step);
  }

  async function evaluateMove(beforeFen, step) {
    const token = ++moveEvalToken;
    evaluatingMove = true;
    await stopLive();
    try {
      const engine = await getEngine();
      if (token !== moveEvalToken || destroyed) return;
      const result = await reviewGame(engine, { startFen: beforeFen, moves: [step] }, { depth: DEPTHS[settings.get().depth] || Number(settings.get().depth) || 14, shouldStop: () => token !== moveEvalToken || destroyed });
      if (token !== moveEvalToken || destroyed) return;
      step.evaluation = result.moves[0];
      const current = variation ? variation.moves[variation.idx - 1] : record?.moves[ply];
      if (current === step) render({ animate: true });
    } catch (e) { if (token === moveEvalToken && !destroyed) toast('Не удалось оценить ход'); }
    finally {
      if (token === moveEvalToken) { evaluatingMove = false; if (!destroyed && needsLive()) startLive(); }
    }
  }

  // ---------- Навигация ----------
  function nav(where) {
    if (!record || Date.now() < highlightUntil) return;
    if (variation) {
      if (where === 'prev') { variation.idx--; if (variation.idx <= 0) { ply = variation.basePly; variation = null; } }
      else if (where === 'next') variation.idx = Math.min(variation.moves.length, variation.idx + 1);
      else if (where === 'last') variation.idx = variation.moves.length;
      else if (where === 'first') { variation = null; ply = -1; }
    } else {
      if (where === 'prev') ply = Math.max(-1, ply - 1);
      else if (where === 'next') ply = Math.min(record.moves.length - 1, ply + 1);
      else if (where === 'first') ply = -1;
      else if (where === 'last') ply = record.moves.length - 1;
    }
    const c = chessAt();
    const last = c.history().at(-1);
    if (last) playSound(soundForMove(last, c));
    render();
  }

  function goPly(p, { scrollToBoard = false } = {}) {
    if (Date.now() < highlightUntil) return;
    variation = null;
    ply = p;
    const c = chessAt();
    const last = c.history().at(-1);
    if (last) playSound(soundForMove(last, c));
    render();
    if (scrollToBoard) {
      const top = board.root.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  // Показать лучшую линию движка как вариант от позиции перед ходом.
  function showBestLine(r) {
    if (Date.now() < highlightUntil) return;
    const ev = record.review.evals[r.ply];
    const pv = ev.lines[0] ? ev.lines[0].pv : [ev.bestMove];
    const c = new Chess(r.fenBefore);
    const moves = [];
    for (const u of pv.slice(0, 8)) { const mv = c.move(u); if (!mv) break; moves.push({ san: mv.san, uci: mv.uci }); }
    if (!moves.length) return;
    variation = { basePly: r.ply - 1, moves, idx: 1 };
    render();
  }

  // ---------- Разбор ----------
  async function runReview(depth) {
    if (!record || reviewing) return;
    await stopLive();
    let cancelled = false;
    reviewing = { done: 0, total: record.moves.length + 1, cancel: () => { cancelled = true; } };
    variation = null;
    render();
    try {
      const engine = await getEngine();
      await engine.newGame();
      const res = await reviewGame(engine, { startFen: record.startFen, moves: record.moves }, {
        depth,
        movetime: REVIEW_TIME_MS[depth] || 1400,
        onProgress: (d, t) => { if (reviewing) { reviewing.done = d; reviewing.total = t; updateProgress(); } },
        shouldStop: () => cancelled || destroyed,
      });
      if (destroyed) return;
      if (record.source === 'free') { record.source = 'import'; record.id = record.id || uid(); }
      record.review = { depth, evals: res.evals, at: Date.now() };
      record.opening = res.opening;
      data = classifyGame(record, res.evals);
      if (!games.save(record)) toast('Память телефона заполнена — разбор не сохранён');
      if (record.myColor) {
        const added = puzzles.addFromGame(record.id, extractPuzzles(data, record.myColor));
        if (added) toast(`Новых задач из ваших ошибок: ${added}`);
      }
      reviewing = null;
      playSound('good');
      ply = -1;
      render();
      if (record.myColor) {
        const me = record.myColor, sum = data.summary[me];
        const won = (record.result === '1-0' && me === 'w') || (record.result === '0-1' && me === 'b');
        const r = applyReview(profileStore.get(), { myCounts: sum.counts, accuracy: sum.accuracy, myMoves: sum.moves, won });
        if (r.fresh.length) { profileStore.set(r.profile); celebrate(r.fresh); }
      }
    } catch (e) {
      reviewing = null;
      if (!destroyed) { render(); if (!cancelled) toast(e.message || 'Разбор не удался'); }
    }
  }

  // ---------- Загрузка ----------
  function openRecord(rec, { autoReview = false } = {}) {
    record = { notes: {}, ...rec, moves: rec.moves.map((m) => ({ san: m.san, uci: m.uci })) };
    data = null;
    if (record.review && record.review.evals && record.review.evals.length === record.moves.length + 1) {
      try { data = classifyGame(record, record.review.evals); } catch { data = null; }
    }
    variation = null;
    ply = data ? -1 : record.moves.length - 1;
    board.setOrientation(record.myColor === 'b' ? 'b' : 'w');
    render({ animate: false });
    if (autoReview && !data) runReview(settings.get().depth);
  }

  function openFree(fen) {
    let c;
    try { c = new Chess(fen); } catch (e) { toast(e.message); return; }
    openRecord({ id: null, source: 'free', headers: { Event: 'Анализ', White: 'Белые', Black: 'Чёрные', Date: pgnDate() }, startFen: c.fen(), moves: [], result: '*', myColor: null, notes: {} });
  }

  function submitText(text, myColor) {
    const t = text.trim();
    if (!t) { toast('Вставьте PGN или FEN'); return; }
    if (FEN_RE.test(t)) { openFree(t); return; }
    let parsed;
    try { parsed = parsePgn(t); } catch (e) { toast(e.message); return; }
    const notes = {};
    parsed.moves.forEach((m, i) => { if (m.comment) notes[i] = m.comment; });
    const rec = {
      id: uid(),
      created: Date.now(),
      source: 'import',
      myColor: myColor === 'none' ? null : myColor,
      headers: parsed.headers,
      startFen: parsed.startFen,
      moves: parsed.moves.map((m) => ({ san: m.san, uci: m.uci })),
      result: parsed.result,
      notes,
    };
    games.save(rec);
    openRecord(rec, { autoReview: true });
  }

  // ---------- Экспорт ----------
  function exportPgn() {
    const f = (s) => s;
    const moves = record.moves.map((m, i) => {
      const r = data ? data.moves[i] : null;
      const parts = [];
      if (record.notes && record.notes[i]) parts.push(record.notes[i]);
      if (r && !['best', 'excellent', 'good', 'forced'].includes(r.cls)) parts.push(`${CLASSES[r.cls].label}. ${moveComment(r, f)}`);
      return { san: m.san, nag: r ? CLASS_NAG[r.cls] : undefined, comment: parts.join(' ') };
    });
    const headers = { ...(record.headers || {}) };
    if (data) {
      if (data.summary.w.accuracy !== null) headers.WhiteAccuracy = String(data.summary.w.accuracy);
      if (data.summary.b.accuracy !== null) headers.BlackAccuracy = String(data.summary.b.accuracy);
      if (data.opening) headers.Opening = data.opening;
      headers.Annotator = 'Stockfish 18';
    }
    return writePgn({ headers, startFen: record.startFen, moves, result: record.result });
  }

  async function sharePgn() {
    const text = exportPgn();
    try {
      if (navigator.share) await navigator.share({ title: 'Партия с разбором', text });
      else { await navigator.clipboard.writeText(text); toast('PGN с комментариями скопирован'); }
    } catch {
      openSheet((sheet, close) => {
        const ta = h('textarea', { readonly: true, style: { minHeight: '260px' } }, text);
        sheet.append(h('h2', {}, 'PGN'), h('p', { class: 'muted small', style: { margin: 0 } }, 'Выделите и скопируйте текст.'), ta, h('button', { class: 'btn btn-block', onclick: close }, 'Готово'));
      });
    }
  }

  // ---------- Отрисовка ----------
  let els = {};

  function openLoadSheet() {
    let myColor = settings.get().myColor || 'w';
    const ta = h('textarea', { placeholder: 'Вставьте PGN партии (chess.com, lichess) или FEN позиции', 'aria-label': 'PGN или FEN', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
    const username = h('input', { placeholder: 'Ник на сайте', 'aria-label': 'Ник игрока', autocomplete: 'off' });
    const source = h('select', { 'aria-label': 'Шахматный сайт' }, h('option', { value: 'lichess' }, 'Lichess'), h('option', { value: 'chesscom' }, 'Chess.com'));
    const results = h('div', { class: 'stack' });
    let sheetClose;
    async function loadGames() {
      const name = username.value.trim();
      if (!/^[a-zA-Z0-9_-]{2,30}$/.test(name)) { toast('Проверьте ник игрока'); return; }
      results.replaceChildren(h('p', {}, 'Загрузка партий…'));
      try {
        let list;
        if (source.value === 'lichess') {
          const response = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(name)}?max=20&pgnInJson=true`, { headers: { Accept: 'application/x-ndjson' } });
          if (!response.ok) throw new Error(`Ошибка сервиса: ${response.status}`);
          list = (await response.text()).trim().split('\n').filter(Boolean).map((line) => { const g = JSON.parse(line); return { pgn: g.pgn, label: `${g.players?.white?.user?.name || 'Белые'} — ${g.players?.black?.user?.name || 'Чёрные'}` }; });
        } else {
          const response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(name)}/games/archives`);
          if (!response.ok) throw new Error(`Ошибка сервиса: ${response.status}`);
          const archives = (await response.json()).archives || [];
          if (!archives.length) { results.replaceChildren(h('p', {}, 'Партий не найдено')); return; }
          const gamesResponse = await fetch(archives[archives.length - 1]);
          if (!gamesResponse.ok) throw new Error(`Ошибка сервиса: ${gamesResponse.status}`);
          list = ((await gamesResponse.json()).games || []).slice(-20).reverse().map((g) => ({ pgn: g.pgn, label: `${g.white?.username || 'Белые'} — ${g.black?.username || 'Чёрные'}` }));
        }
        results.replaceChildren();
        for (const game of list.filter((g) => g.pgn)) results.append(h('button', { class: 'btn btn-block', onclick: () => { sheetClose(); submitText(game.pgn, myColor); } }, game.label));
        if (!results.childNodes.length) results.append(h('p', {}, 'Партий не найдено'));
      } catch (e) { results.replaceChildren(h('p', {}, `Не удалось загрузить партии: ${e.message}`)); }
    }
    openSheet((sheet, close) => { sheetClose = close; sheet.append(
      h('div', { class: 'stack' },
        h('h2', {}, 'Разбор партии'),
        h('p', { style: { margin: 0 } }, 'Stockfish 18 оценит каждый ход: от 💎 бриллиантовых до ?? зевков, посчитает точность и объяснит ошибки.'),
        ta,
        h('div', { class: 'label' }, 'Импорт по нику (последние партии)'),
        h('div', { class: 'row' }, source, username),
        h('button', { class: 'btn btn-block', onclick: loadGames }, 'Найти партии'),
        results,
        h('div', { class: 'row' },
          h('button', {
            class: 'btn btn-sm grow',
            onclick: async () => { try { ta.value = await navigator.clipboard.readText(); } catch { toast('Не удалось прочитать буфер — вставьте вручную'); } },
          }, icon('paste'), 'Вставить'),
          h('button', { class: 'btn btn-sm grow', onclick: () => { ta.value = EXAMPLE; myColor = 'w'; } }, 'Пример: Морфи, 1858')),
        h('div', {}, h('div', { class: 'label' }, 'Я играл'), segmented([['w', 'Белыми'], ['b', 'Чёрными'], ['none', 'Не я']], myColor, (v) => { myColor = v; if (v !== 'none') settings.set({ myColor: v }); })),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => { close(); submitText(ta.value, myColor); } }, icon('analysis'), 'Разобрать'),
        h('button', { class: 'btn btn-ghost btn-block', onclick: () => { close(); go('games'); } }, 'Выбрать из моих партий')),
    ); });
  }

  function render({ animate = true } = {}) {
    if (destroyed) return;
    if (!record) { openFree(START_FEN); return; }
    const f = fmt();
    const c = chessAt();
    const keepY = window.scrollY;
    root.innerHTML = '';

    // Шапка с игроками
    root.append(playersHead());

    // Доска
    const selectedAnimation = animationMs(settings.get().animation);
    board.setAnimation(selectedAnimation ? Math.max(100, Math.min(selectedAnimation, 180)) : 0);
    board.setPosition(c, { lastMove: lastMoveOf(c), animate });
    board.setInteractive(reviewing ? null : 'both');
    board.setCoords(settings.get().coords);
    const r = variation ? variation.moves[variation.idx - 1]?.evaluation : (data && ply >= 0 ? data.moves[ply] : record.source === 'free' && ply >= 0 ? record.moves[ply]?.evaluation : null);
    const badge = r ? { square: r.uci.slice(2, 4), html: classIconSvg(r.cls), title: CLASSES[r.cls].label } : null;
    const fx = ++fxToken;
    const moveKey = variation ? variation.moves[variation.idx - 1] : record.moves[ply];
    const shine = r && animate && shownPly !== moveKey && (r.cls === 'brilliant' || r.cls === 'great');
    shownPly = r ? moveKey : null;
    if (shine) {
      // Пока воспроизводится эффект, переход к другому ходу заблокирован.
      board.setBadge(null);
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const delay = reduced ? 0 : 150;
      highlightUntil = Date.now() + (reduced ? 0 : 1050);
      setTimeout(() => { if (fx !== fxToken || destroyed) return; board.setBadge(badge); if (!reduced) board.flash(badge.square, CLASSES[r.cls].color); playSound(r.cls); }, delay);
    } else {
      board.setBadge(badge);
    }
    const arrows = [];
    if (r && r.bestMove && !['best', 'brilliant', 'great', 'book', 'forced', 'excellent'].includes(r.cls)) {
      arrows.push({ from: r.bestMove.slice(0, 2), to: r.bestMove.slice(2, 4), color: '#81b64c', opacity: 0.9 });
    }
    board.setArrows(arrows);
    root.append(h('div', { class: 'board-wrap' }, evalBar.el, board.root));

    // Вариант
    if (variation) {
      const base = chessAt(variation.basePly, null);
      let num = base.moveNumber(), white = base.turn() === 'w';
      const parts = variation.moves.slice(0, variation.idx).map((m, i) => {
        const s = (white ? `${num}.` : i === 0 ? `${num}…` : '') + f(m.san);
        if (!white) num++;
        white = !white;
        return s;
      });
      root.append(h('div', { class: 'var-bar' },
        h('span', { class: 'grow' }, 'Вариант: ', parts.join(' ')),
        h('button', { class: 'btn btn-sm', onclick: () => { ply = variation.basePly; variation = null; render(); } }, 'К партии')));
    }

    // Навигация
    const atStart = !variation && ply < 0;
    const atEnd = variation ? variation.idx >= variation.moves.length : ply >= record.moves.length - 1;
    root.append(h('div', { class: 'nav' },
      h('button', { class: 'btn', 'aria-label': 'В начало', disabled: atStart, onclick: () => nav('first') }, icon('first')),
      h('button', { class: 'btn', 'aria-label': 'Назад', disabled: atStart, onclick: () => nav('prev') }, icon('prev')),
      h('button', { class: 'btn', 'aria-label': 'Вперёд', disabled: atEnd, onclick: () => nav('next') }, icon('next')),
      h('button', { class: 'btn', 'aria-label': 'В конец', disabled: atEnd, onclick: () => nav('last') }, icon('last')),
      h('button', { class: 'btn', style: { padding: '0 14px' }, 'aria-label': 'Перевернуть доску', onclick: () => { board.flip(); updateEvalBar(); } }, icon('flip'))));

    if (record.moves.length && !variation) root.append(movesStrip());

    // Карточка хода / движка
    els.engineLine = null;
    if (reviewing) root.append(progressCard());
    else if (data && !variation) root.append(moveCard(r));
    else root.append(liveCard());

    if (!data && !reviewing && record.moves.length) root.append(reviewStartCard());

    if (data && !reviewing) {
      root.append(evalGraph(record.review.evals, data.moves, variation ? -2 : ply, (p) => goPly(p)));
    }
    if (record.moves.length) root.append(moveListCard());
    if (data && !reviewing) root.append(countsCard());
    root.append(actionsCard());

    window.scrollTo(0, keepY);
    const curChip = root.querySelector('.mchip.cur');
    if (curChip) curChip.parentElement.scrollLeft = curChip.offsetLeft - curChip.parentElement.clientWidth / 2 + curChip.clientWidth / 2;

    updateEvalBar();
    if (evaluatingMove) { /* оценка хода использует движок */ }
    else if (!needsLive()) stopLive();
    else if (live.running && live.fen === c.fen()) updateLive(); // та же позиция — анализ уже идёт
    else startLive();
  }

  function playersHead() {
    const hd = record.headers || {};
    const sideBlock = (color, right) => {
      const s = data ? data.summary[color] : null;
      return h('div', { class: 'ph-side' + (right ? ' right' : '') },
        h('div', { class: 'ph-name' }, h('span', { class: 'ph-chip', style: { background: color === 'w' ? '#eceef4' : '#3b3d48', border: '1px solid #555' } }), (color === 'w' ? hd.White : hd.Black) || (color === 'w' ? 'Белые' : 'Чёрные')),
        s && s.accuracy !== null ? h('div', { class: 'ph-acc' }, s.accuracy.toFixed(1), h('small', {}, '%')) : null);
    };
    const card = h('div', { class: 'card', style: { padding: '12px 14px' } },
      h('div', { class: 'players-head' },
        sideBlock('w', false),
        h('div', { class: 'ph-mid' }, data ? 'точность' : '', h('div', { style: { fontWeight: 800, color: 'var(--text)', fontSize: '15px' } }, record.result && record.result !== '*' ? record.result.replace('1/2-1/2', '½–½') : '')),
        sideBlock('b', true)));
    const opening = data ? data.opening : null;
    if (opening) card.append(h('div', { class: 'opening' }, opening));
    if (record.source === 'free') {
      card.innerHTML = '';
      card.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, 'Анализ с движком'), h('div', { class: 'muted small' }, 'Ходите за обе стороны, Stockfish считает в фоне')),
        record.moves.length ? h('button', { class: 'btn btn-sm', onclick: () => openFree(START_FEN) }, 'Сброс') : null,
        h('button', { class: 'btn btn-sm btn-primary', onclick: openLoadSheet }, 'Партия')));
    }
    return card;
  }

  function moveTitle(p) {
    const c = chessAt(p - 1, null);
    const n = c.moveNumber();
    return (c.turn() === 'w' ? `${n}. ` : `${n}… `) + fmt()(record.moves[p].san);
  }

  function moveCard(r) {
    const f = fmt();
    const card = h('div', { class: 'move-card' });
    if (!r) {
      const hd = record.headers || {};
      const lines = gameSummary(data, { w: hd.White, b: hd.Black }, f);
      card.append(
        h('div', { class: 'mc-head' }, h('div', { class: 'mc-title' }, 'Итоги партии')),
        h('ul', { class: 'summary' }, lines.map((t) => h('li', {}, t))),
        h('div', { class: 'muted small' }, 'Листайте ходы кнопкой ▶ или нажмите на ход в ленте. Свой ход на доске — это вариант: движок сразу его оценит.'));
      return card;
    }
    const sc = r.scoreAfter;
    const white = winPercent(sc) >= 50;
    card.append(h('div', { class: 'mc-head' },
      clsIcon(r.cls),
      h('div', { class: 'grow' }, h('div', { class: 'mc-title', style: { color: CLASSES[r.cls].color } }, CLASSES[r.cls].label), h('div', { class: 'mc-move' }, moveTitle(r.ply))),
      h('div', { class: 'mc-eval' + (white ? ' white' : '') }, formatScore(sc))));
    card.append(h('div', { class: 'mc-text' }, moveComment(r, f)));
    if (r.bestSan && r.bestSan !== r.san && !['book', 'forced', 'best'].includes(r.cls)) {
      card.append(h('div', { class: 'mc-best' }, 'Лучше:',
        h('button', { class: 'chip', onclick: () => showBestLine(r) }, f(r.bestSan)),
        h('button', { class: 'btn btn-sm btn-ghost', style: { minHeight: '32px', padding: '0 8px' }, onclick: () => showBestLine(r) }, icon('eye'), 'Показать')));
    }
    const note = h('textarea', { class: 'note', placeholder: 'Ваша заметка к этому ходу…', 'aria-label': 'Заметка к ходу' }, (record.notes && record.notes[r.ply]) || '');
    note.addEventListener('input', () => {
      record.notes = record.notes || {};
      if (note.value.trim()) record.notes[r.ply] = note.value; else delete record.notes[r.ply];
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { if (record.id && record.source !== 'free') games.save(record); }, 400);
    });
    card.append(note);
    return card;
  }

  function liveCard() {
    const card = h('div', { class: 'move-card' });
    const head = h('div', { class: 'mc-head' }, h('span', { class: 'sf-badge' }, 'SF'),
      h('div', { class: 'grow' }, h('div', { class: 'mc-title' }, 'Stockfish 18'), h('div', { class: 'mc-move', 'data-live': 'depth' }, 'анализ…')),
      h('div', { class: 'mc-eval', 'data-live': 'eval' }, '…'));
    els.engineLine = h('div', { class: 'engine-lines', 'data-live': 'line' }, '');
    const lineSelector = segmented([['1', '1'], ['2', '2'], ['3', '3'], ['5', '5']],
      String(settings.get().analysisLines || 3), (value) => {
        settings.set({ analysisLines: Number(value) });
        startLive();
      });
    card.append(head, h('div', { class: 'muted small' }, 'Линии анализа'), lineSelector, els.engineLine);
    return card;
  }

  function updateLive() {
    if (destroyed || !record) return;
    updateEvalBar();
    const card = root.querySelector('[data-live="eval"]');
    if (!card) return;
    const depthEl = root.querySelector('[data-live="depth"]');
    const term = live.fen ? terminalEval(live.fen) : null;
    if (term) {
      card.textContent = term.terminal === 'checkmate' ? 'Мат' : '½–½';
      depthEl.textContent = resultText(term.terminal === 'checkmate' ? (term.score.mated === 'w' ? '0-1' : '1-0') : '1/2-1/2', term.terminal);
      els.engineLine.textContent = '';
      board.setArrows([]);
      return;
    }
    const l = live.lines && live.lines[0];
    if (!l) return;
    card.textContent = formatScore(l.score);
    card.classList.toggle('white', winPercent(l.score) >= 50);
    depthEl.textContent = `глубина ${l.depth} · нажмите на линию, чтобы сыграть`;
    const f = fmt();
    const start = new Chess(live.fen);
    els.engineLine.innerHTML = '';
    for (const ln of live.lines.slice(0, Math.max(1, Math.min(5, Number(settings.get().analysisLines) || 3)))) {
      if (!ln || !ln.pv.length) continue;
      let num = start.moveNumber(), white = start.turn() === 'w';
      const sans = uciLineToSan(live.fen, ln.pv, 8).map((s, i) => {
        const t = (white ? `${num}.` : i === 0 ? `${num}…` : '') + f(s);
        if (!white) num++;
        white = !white;
        return t;
      });
      const u = ln.pv[0];
      els.engineLine.append(h('button', {
        class: 'eline',
        onclick: () => boardMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }, { animate: true }),
      }, h('b', { class: winPercent(ln.score) >= 50 ? 'pos' : 'neg' }, formatScore(ln.score)), h('span', {}, sans.join(' '))));
    }
    const arrows = live.lines.slice(0, 2).filter((x) => x && x.pv[0]).map((x, i) => ({ from: x.pv[0].slice(0, 2), to: x.pv[0].slice(2, 4), color: '#5b8bd9', opacity: i ? 0.4 : 0.85 }));
    board.setArrows(arrows);
  }

  function updateEvalBar() {
    let score = null;
    if (data && !variation) score = record.review.evals[ply + 1].score;
    else if (live.lines && live.lines[0] && live.fen === chessAt().fen()) score = live.lines[0].score;
    else if (live.fen) { const t = terminalEval(live.fen); if (t) score = t.score; }
    evalBar.set(score, board.orientation);
  }

  function progressCard() {
    const pct = reviewing.total ? Math.round((reviewing.done / reviewing.total) * 100) : 0;
    const bar = h('i', { style: { width: pct + '%' } });
    els.progressBar = bar;
    els.progressText = h('div', { class: 'muted small' }, `Позиция ${reviewing.done} из ${reviewing.total}`);
    return h('div', { class: 'card stack' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 750, fontSize: '17px' } }, 'Stockfish разбирает партию…'), els.progressText),
        h('button', { class: 'btn btn-sm', onclick: () => reviewing && reviewing.cancel() }, 'Стоп')),
      h('div', { class: 'progress' }, bar),
      h('div', { class: 'muted small' }, 'Время зависит от телефона и числа ходов. Для каждой позиции действует ограничение по времени.'));
  }

  function updateProgress() {
    if (!els.progressBar || !reviewing) return;
    els.progressBar.style.width = Math.round((reviewing.done / reviewing.total) * 100) + '%';
    els.progressText.textContent = `Позиция ${reviewing.done} из ${reviewing.total}`;
  }

  function reviewStartCard() {
    let depthKey = Object.entries(DEPTHS).find(([, d]) => d === settings.get().depth)?.[0] || 'normal';
    const showColor = record.source !== 'play';
    let myColor = record.myColor || 'none';
    return h('div', { class: 'card stack' },
      h('h2', {}, 'Разобрать партию'),
      h('p', { style: { margin: 0 } }, 'Оценка каждого хода, точность игроков, комментарии и задачи из ваших ошибок.'),
      showColor ? h('div', {}, h('div', { class: 'label' }, 'Я играл'), segmented([['w', 'Белыми'], ['b', 'Чёрными'], ['none', 'Не я']], myColor, (v) => { myColor = v; })) : null,
      h('div', {}, h('div', { class: 'label' }, 'Глубина'), segmented([['fast', 'Быстро'], ['normal', 'Обычно'], ['deep', 'Глубоко']], depthKey, (v) => { depthKey = v; })),
      h('button', {
        class: 'btn btn-primary btn-block',
        onclick: () => {
          if (showColor) record.myColor = myColor === 'none' ? null : myColor;
          settings.set({ depth: DEPTHS[depthKey] });
          runReview(DEPTHS[depthKey]);
        },
      }, icon('bolt'), 'Начать разбор'));
  }

  // Лента ходов под доской: листать партию, не прокручивая страницу.
  function movesStrip() {
    const f = fmt();
    const strip = h('div', { class: 'moves-strip', 'aria-label': 'Ходы партии' });
    const c = new Chess(record.startFen);
    let num = c.moveNumber(), white = c.turn() === 'w';
    record.moves.forEach((m, i) => {
      const r = data ? data.moves[i] : null;
      const label = white ? `${num}.` : i === 0 ? `${num}…` : '';
      strip.append(h('button', { class: 'mchip' + (i === ply ? ' cur' : ''), onclick: () => goPly(i) },
        label ? h('span', { class: 'num' }, label) : null, f(m.san), r && NOTABLE.has(r.cls) ? h('span', { style: { marginLeft: '4px', verticalAlign: '-2px', display: 'inline-block' } }, clsIcon(r.cls, 'xs')) : null));
      if (!white) num++;
      white = !white;
    });
    return strip;
  }

  function moveListCard() {
    const f = fmt();
    const list = h('div', { class: 'movelist' });
    const c = new Chess(record.startFen);
    let num = c.moveNumber();
    let col = c.turn() === 'w' ? 0 : 1;
    if (col === 1) list.append(h('div', { class: 'n' }, `${num}.`), h('div'));
    record.moves.forEach((m, i) => {
      if (col === 0) list.append(h('div', { class: 'n' }, `${num}.`));
      const r = data ? data.moves[i] : null;
      list.append(h('button', { class: 'ml-move' + (!variation && i === ply ? ' cur' : ''), onclick: () => goPly(i, { scrollToBoard: true }) },
        f(m.san), r && NOTABLE.has(r.cls) ? clsIcon(r.cls, 'xs') : null, record.notes && record.notes[i] ? h('span', { class: 'muted small', title: 'Есть заметка' }, '✎') : null));
      if (col === 1) num++;
      col ^= 1;
    });
    return h('div', { class: 'card' }, h('h3', {}, 'Ходы'), list);
  }

  function countsCard() {
    const grid = h('div', { class: 'counts' });
    for (const k of CLASS_ORDER) {
      grid.append(
        h('div', { class: 'c w', style: { color: CLASSES[k].color } }, String(data.summary.w.counts[k])),
        h('div', { class: 'lbl' }, clsIcon(k, 'sm'), CLASSES[k].label),
        h('div', { class: 'c b', style: { color: CLASSES[k].color } }, String(data.summary.b.counts[k])));
    }
    return h('div', { class: 'card' }, h('h3', {}, 'Итоги'), grid);
  }

  function actionsCard() {
    const card = h('div', { class: 'card stack' });
    if (data) {
      const mine = record.myColor ? extractPuzzles(data, record.myColor).length : 0;
      card.append(h('button', { class: 'btn btn-block', onclick: sharePgn }, icon('share'), 'PGN с комментариями'));
      if (mine) card.append(h('button', { class: 'btn btn-block', onclick: () => go('puzzles') }, icon('puzzles'), `Задачи из ваших ошибок: ${mine}`));
      card.append(h('button', { class: 'btn btn-block btn-ghost', onclick: () => runReview(20) }, 'Разобрать глубже (дольше)'));
    } else if (record.moves.length && record.source !== 'free') {
      card.append(h('button', { class: 'btn btn-block', onclick: sharePgn }, icon('share'), 'Скопировать PGN'));
    }
    card.append(h('button', { class: 'btn btn-block btn-ghost', onclick: openLoadSheet }, icon('plus'), 'Другая партия'));
    if (record.source !== 'free') card.append(h('button', { class: 'btn btn-block btn-ghost', onclick: () => openFree(START_FEN) }, icon('board'), 'Пустая доска с движком'));
    if (record.id && record.source !== 'free') {
      card.append(h('button', {
        class: 'btn btn-block btn-danger',
        onclick: async () => {
          if (!(await confirmSheet('Удалить партию?', 'Разбор, заметки и задачи из неё тоже удалятся.', 'Удалить', true))) return;
          games.remove(record.id);
          record = null; data = null;
          go('games');
        },
      }, icon('trash'), 'Удалить партию'));
    }
    return card;
  }

  function onKey(e) {
    if (!record || /textarea|input/i.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'ArrowLeft') nav('prev');
    else if (e.key === 'ArrowRight') nav('next');
    else if (e.key === 'Home') nav('first');
    else if (e.key === 'End') nav('last');
  }
  window.addEventListener('keydown', onKey);

  // ---------- Старт ----------
  if (params.gameId) {
    const rec = games.get(params.gameId);
    if (rec) openRecord(rec, { autoReview: !!params.autoReview }); else openFree(START_FEN);
  } else {
    openFree(START_FEN);
    if (params.load) openLoadSheet();
  }

  return {
    destroy() {
      destroyed = true;
      window.removeEventListener('keydown', onKey);
      if (reviewing) reviewing.cancel();
      moveEvalToken++;
      stopLive();
    },
    refresh() { render({ animate: false }); },
  };
}
