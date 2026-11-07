// Интерактивные дебютные уроки: анимация последовательностей, варианты и тренировка.
import { Board } from '../board.js';
import { Chess } from '../chess.js';
import { makeOpeningPosition } from '../opening-lessons.js';
import { settings } from '../store.js';
import { animationMs } from '../timecontrol.js';
import { playSound, soundForMove } from '../sound.js';
import { h, icon, segmented } from '../ui.js';

const PROGRESS_KEY = 'chess.opening.academy.v1';

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch { return {}; }
}

function saveCompletion(courseId, chapterId, mistakes) {
  const progress = readProgress();
  const current = progress[courseId] || {};
  const old = current[chapterId];
  current[chapterId] = {
    completed: true,
    bestMistakes: Math.min(old?.bestMistakes ?? Infinity, mistakes),
    updated: Date.now(),
  };
  progress[courseId] = current;
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* private mode */ }
}

const arrow = (from, to, color = '#81b64c') => ({ from, to, color, opacity: 0.82 });

export function mountGuidedOpening(root, course, onBack) {
  let selected = null;
  let ply = 0;
  let variation = null;
  let mode = 'theory';
  let playing = false;
  let timer = null;
  let errors = 0;
  let feedback = '';
  let hintSquare = null;
  let finished = false;
  let destroyed = false;
  let paintToken = 0;

  const board = new Board(h('div'), { onMove: attemptMove });

  const currentMoves = () => variation
    ? selected.moves.slice(0, variation.at).concat(variation.moves)
    : selected.moves;

  function stop() {
    playing = false;
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function schedule(fn, delay) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!destroyed) fn();
    }, delay);
  }

  function goCatalog() {
    stop();
    paintToken++;
    selected = null;
    variation = null;
    mode = 'theory';
    hintSquare = null;
    board.setInteractive(null);
    render();
  }

  function openChapter(chapter) {
    stop();
    selected = chapter;
    ply = 0;
    variation = null;
    errors = 0;
    feedback = '';
    hintSquare = null;
    finished = false;
    mode = 'theory';
    render(false);
  }

  function setMode(next) {
    stop();
    variation = null;
    ply = 0;
    mode = next;
    errors = 0;
    feedback = '';
    hintSquare = null;
    finished = false;
    render(false);
    if (mode === 'practice') schedule(opponentTurn, 450);
  }

  function step(delta) {
    stop();
    ply = Math.max(0, Math.min(currentMoves().length, ply + delta));
    render(Math.abs(delta) === 1);
  }

  function autoplay() {
    if (playing) { stop(); render(false); return; }
    if (ply >= currentMoves().length) ply = 0;
    playing = true;
    render(false);
    schedule(tick, 350);
  }

  function tick() {
    if (!playing || mode !== 'theory') return;
    const moves = currentMoves();
    if (ply >= moves.length) { playing = false; render(false); return; }
    ply++;
    render(true);
    const isKey = !variation && !!selected.notes[ply];
    schedule(tick, isKey ? 2000 : 1100);
  }

  function openVariation(item) {
    stop();
    variation = item;
    ply = item.at;
    feedback = '';
    render(false);
    // Показываем первое ответвление отдельным плавным ходом.
    schedule(() => {
      if (variation === item && mode === 'theory') step(1);
    }, 450);
  }

  function opponentTurn() {
    if (mode !== 'practice' || !selected || finished) return;
    const moves = currentMoves();
    if (ply >= moves.length) { complete(); return; }
    const { game } = makeOpeningPosition(moves, ply, Chess);
    if (game.turn() === course.side) return;
    const played = game.move(moves[ply]);
    if (!played) return;
    ply++;
    feedback = '';
    hintSquare = null;
    playSound(soundForMove(played, game));
    render(true);
    schedule(opponentTurn, 600);
  }

  function complete() {
    if (finished) return;
    stop();
    finished = true;
    feedback = 'Глава пройдена! Ты воспроизвёл все ходы за ' +
      (course.side === 'w' ? 'белых' : 'чёрных') + '.';
    saveCompletion(course.id, selected.id, errors);
    playSound('good');
    render(false);
  }

  function attemptMove(move) {
    if (!selected || mode !== 'practice' || finished) return;
    const moves = currentMoves();
    if (ply >= moves.length) return;
    const { game } = makeOpeningPosition(moves, ply, Chess);
    if (game.turn() !== course.side) return;
    const expected = new Chess(game.fen()).move(moves[ply]);
    const played = game.move(move);
    if (!played || !expected) return;
    if (played.uci !== expected.uci) {
      errors++;
      feedback = 'Это допустимый ход, но мы учим конкретный план. ' +
        (errors >= 2 ? 'Подсказка: сыграй ' + moves[ply] + '.' : 'Подумай, что мы готовим в этой позиции.');
      hintSquare = errors >= 2 ? expected.from : null;
      playSound('bad');
      render(false);
      return;
    }
    ply++;
    hintSquare = null;
    const explanation = selected.notes[ply];
    feedback = explanation ? explanation.title + ': ' + explanation.text : 'Верно! Продолжаем линию.';
    playSound(soundForMove(played, game));
    render(true);
    if (ply >= moves.length) schedule(complete, 850);
    else schedule(opponentTurn, explanation ? 1300 : 650);
  }

  function hint() {
    if (mode !== 'practice' || finished) return;
    const moves = currentMoves();
    const { game } = makeOpeningPosition(moves, ply, Chess);
    const expected = new Chess(game.fen()).move(moves[ply]);
    if (!expected) return;
    hintSquare = expected.from;
    feedback = 'Подумай о ходе из ' + expected.from + '. ' +
      (selected.notes[ply + 1]?.text || selected.summary);
    render(false);
  }

  function markUpBoard(game, lastMove, animate, annotation) {
    const moveMs = animationMs(settings.get().animation);
    board.setAnimation(moveMs === 0 ? 0 : Math.max(320, moveMs));
    board.setOrientation(course.side);
    // В уроках координаты важны даже для игроков, скрывших их в обычной игре.
    board.setCoords(true);
    board.setInteractive(null);
    // Доска уже находится в DOM. Обновляем её на кадре после перерисовки панели:
    // это сохраняет CSS-переходы фигур и плавное движение при разборе.
    const frame = ++paintToken;
    requestAnimationFrame(() => {
      if (destroyed || frame !== paintToken) return;
      board.setPosition(game, {
        lastMove: lastMove ? { from: lastMove.from, to: lastMove.to } : null,
        animate,
      });
      if (hintSquare && mode === 'practice') board.setHint(hintSquare);
      board.setArrows(annotation?.arrows?.length
        ? annotation.arrows.map((a) => arrow(a.from, a.to, '#e2b86d'))
        : lastMove ? [arrow(lastMove.from, lastMove.to)] : []);
      board.setInteractive(mode === 'practice' && !finished &&
        ply < selected.moves.length && game.turn() === course.side ? course.side : null);
    });
  }

  function render(animate = false) {
    if (destroyed) return;
    root.replaceChildren();
    if (!selected) {
      const progress = readProgress()[course.id] || {};
      const done = course.chapters.filter((item) => progress[item.id]?.completed).length;
      root.append(
        h('button', { class: 'btn btn-block', onclick: onBack }, icon('prev'), 'К дебютам'),
        h('section', { class: 'opening-hero' },
          h('span', { class: 'opening-kicker' }, course.subtitle),
          h('h2', {}, course.title),
          h('p', {}, course.intro),
          h('div', { class: 'opening-progress-track' },
            h('span', { style: { width: Math.round(done / course.chapters.length * 100) + '%' } })),
          h('div', { class: 'muted small' }, 'Освоено глав: ' + done + ' из ' + course.chapters.length)),
        h('section', { class: 'opening-principles' },
          h('h3', {}, 'Главные идеи дебюта'),
          ...course.principles.map((text, index) =>
            h('div', { class: 'opening-principle' }, h('b', {}, String(index + 1)), h('p', {}, text)))),
        h('div', { class: 'opening-chapters' },
          ...course.chapters.map((chapter, index) =>
            h('button', { class: 'opening-chapter', onclick: () => openChapter(chapter) },
              h('span', { class: 'opening-chapter-num' }, String(index + 1).padStart(2, '0')),
              h('span', { class: 'opening-chapter-body' },
                h('strong', {}, chapter.title),
                h('small', {}, chapter.summary),
                h('span', { class: 'opening-chapter-meta' },
                  Math.ceil(chapter.moves.length / 2) + ' ходов · ' + chapter.branches.length + ' развилок')),
              progress[chapter.id]?.completed ? h('span', { class: 'opening-done' }, '✓') : icon('next')))));
      return;
    }

    const moves = currentMoves();
    const { game, lastMove } = makeOpeningPosition(moves, ply, Chess);
    const note = variation && ply > variation.at
      ? { title: variation.title, text: variation.why }
      : selected.notes[ply];
    const heading = ply === 0 ? 'С чего начинаем?' : note?.title || 'Развитие позиции';
    const explanation = ply === 0 ? selected.summary
      : note?.text || 'Обрати внимание на развитие фигур, безопасность короля и центр. Используй стрелки, чтобы проследить сделанный ход.';
    const moveText = ply ? moves[ply - 1] : 'Начальная позиция';

    root.append(h('button', { class: 'btn btn-block', onclick: goCatalog }, icon('prev'), 'К главам'),
      h('section', { class: 'opening-lesson-head' },
        h('span', { class: 'opening-kicker' }, course.title + ' · глава ' +
          (course.chapters.indexOf(selected) + 1) + '/' + course.chapters.length),
        h('h2', {}, selected.title),
        h('p', {}, selected.summary),
        segmented([['theory', 'Объяснения'], ['practice', 'Тренировка']], mode, setMode)));

    const positionCard = h('div', { class: 'opening-position-card' },
      h('div', { class: 'opening-position-meta' },
        h('span', {}, mode === 'practice' ? 'Повтори линию самостоятельно' :
          variation ? 'Вариант: ' + variation.title : 'Основная линия'),
        h('b', {}, 'Ход ' + ply + ' / ' + moves.length)));
    const boardWrap = h('div', {
      class: 'board-wrap opening-board',
      // Защита от старых закэшированных стилей и Safari flex shrink-to-fit:
      // у внутренней .board дети позиционированы абсолютно.
      style: { width: 'min(100%, 520px)', minWidth: '0', alignSelf: 'center' },
    }, board.root);
    const boardGuide = h('div', { class: 'opening-board-guide' },
      h('span', {}, 'Доска со стороны ' + (course.side === 'w' ? 'белых' : 'чёрных') + ' · координаты a–h / 1–8'),
      h('strong', {}, lastMove ? lastMove.from + ' → ' + lastMove.to : 'Начальная расстановка'));
    root.append(positionCard, boardWrap, boardGuide);

    markUpBoard(game, lastMove, animate, note);

    const moveStrip = h('div', { class: 'opening-moves', role: 'list', 'aria-label': 'Ходы дебюта' });
    moves.forEach((san, index) => {
      moveStrip.append(h('button', {
        class: 'opening-move' + (index + 1 === ply ? ' current' : '') +
          (index + 1 > ply ? ' upcoming' : ''),
        disabled: mode === 'practice',
        onclick: () => {
          const distance = Math.abs(ply - (index + 1));
          stop(); ply = index + 1; render(distance === 1);
        },
      }, ((index % 2 === 0) ? Math.floor(index / 2) + 1 + '. ' : '') + san));
    });
    root.append(moveStrip);

    root.append(h('section', { class: 'opening-explanation' },
      h('div', { class: 'opening-explanation-label' },
        note ? 'КЛЮЧЕВОЙ МОМЕНТ' : 'РАЗБОР ХОДА',
        h('span', {}, moveText)),
      h('h3', {}, heading),
      h('p', {}, explanation)));

    if (mode === 'theory') {
      root.append(h('div', { class: 'opening-controls' },
        h('button', { class: 'btn', disabled: ply === 0, onclick: () => step(-1) }, icon('prev'), 'Назад'),
        h('button', { class: 'btn', onclick: autoplay },
          icon(playing ? 'pause' : 'play'), playing ? 'Пауза' : 'Анимация'),
        h('button', { class: 'btn btn-primary', disabled: ply >= moves.length, onclick: () => step(1) }, 'Дальше', icon('next'))));

      const alternatives = !variation ? selected.branches.filter((item) => item.at === ply) : [];
      if (alternatives.length || variation) {
        const holder = h('section', { class: 'opening-branches' }, h('h3', {}, 'А если соперник сыграет иначе?'));
        if (variation) holder.append(
          h('p', {}, variation.why),
          h('button', { class: 'btn btn-block', onclick: () => {
            stop(); const at = variation.at; variation = null; ply = at; render(false);
          } }, 'Вернуться к основной линии'));
        else for (const item of alternatives) holder.append(
          h('button', { class: 'opening-branch', onclick: () => openVariation(item) },
            h('b', {}, item.title), h('small', {}, item.why), icon('next')));
        root.append(holder);
      }
      if (ply >= moves.length && !variation) {
        root.append(h('button', { class: 'btn btn-primary btn-block', onclick: () => setMode('practice') },
          'Закрепить главу на практике', icon('next')));
      }
    } else {
      const userToMove = game.turn() === course.side;
      root.append(h('div', { class: 'opening-practice-prompt' },
        h('strong', {}, finished ? 'Глава освоена' :
          userToMove ? 'Твой ход: ' + (course.side === 'w' ? 'белыми' : 'чёрными') : 'Ход соперника…'),
        h('p', {}, finished ? 'Результат сохранён на этом устройстве.' :
          'Сыграй фигурами на доске. Соперник отвечает автоматически по изученному варианту.'),
        feedback ? h('div', { class: 'banner ' + (finished ? 'ok' : 'info'), 'data-training-feedback': '' }, feedback) : null),
      h('div', { class: 'opening-controls' },
        h('button', { class: 'btn', disabled: finished || !userToMove, onclick: hint }, icon('hint'), 'Подсказка'),
        h('button', { class: 'btn', onclick: () => setMode('practice') }, 'Заново'),
        h('button', { class: 'btn btn-primary', onclick: () => setMode('theory') }, 'К объяснениям')));
      if (finished) {
        const next = course.chapters[course.chapters.indexOf(selected) + 1];
        root.append(h('button', { class: 'btn btn-primary btn-block', onclick: () =>
          next ? openChapter(next) : goCatalog() },
          next ? 'Следующая глава' : 'Все главы', icon('next')));
      }
    }
  }

  render();
  return {
    destroy() {
      destroyed = true;
      stop();
      paintToken++;
      board.setInteractive(null);
    },
    refresh() { render(false); },
  };
}
