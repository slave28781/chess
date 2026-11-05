import { Chess, START_FEN } from '../chess.js';
import { Board } from '../board.js';
import { settings, games } from '../store.js';
import { animationMs, formatClock, TIME_CONTROLS, CATEGORIES } from '../timecontrol.js';
import { playSound, soundForMove } from '../sound.js';
import { h, toast, confirmSheet, openSheet, segmented, pgnDate } from '../ui.js';
import { ONLINE_SERVER } from '../online-config.js';
import { onlineProfile } from '../online-profile.js';

const randomHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
export function mountOnline(root) {
  let socket, timer, reconnect, destroyed = false, state = null, previous = 0, offset = 0, viewedPly = null;
  let room = new URL(location.href).searchParams.get('room');
  if (!/^[a-f0-9]{32}$/.test(room || '')) room = null;
  const title = h('h2', {}, 'Игра с другом');
  const status = h('p', { class: 'muted' }, 'Создайте партию и отправьте другу ссылку.');
  const clocks = h('div', { class: 'row' });
  const board = new Board(h('div'), { onMove(move) {
    if (socket?.readyState !== WebSocket.OPEN || !state || state.result || state.turn !== state.color) return;
    socket.send(JSON.stringify({ type: 'move', move, ply: state.moves.length }));
    board.setInteractive(null);
  } });
  board.setAnimation(animationMs(settings.get().animation));
  board.setCoords(settings.get().coords);
  board.setPosition(new Chess(), { animate: false });
  const share = h('button', { class: 'btn btn-block', onclick: async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Ссылка скопирована'); }
    catch { toast('Скопируйте адрес страницы из браузера'); }
  } }, 'Скопировать приглашение');
  const resign = h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
    if (await confirmSheet('Сдаться?', 'Партия завершится поражением.', 'Сдаться', true)) socket?.send(JSON.stringify({ type: 'resign' }));
  } }, 'Сдаться');
  let requestedTime = '5+0', requestedSide = 'w';
  const create = () => {
    room = randomHex(16);
    const url = new URL(location.href); url.searchParams.set('room', room); history.replaceState(null, '', url);
    connect();
  };
  function openMenu() {
    openSheet((sheet, close) => {
      const tcBox = h('div', { class: 'stack', style: { gap: '10px' } });
      const supported = ['1+0', '3+0', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10'];
      const controls = [...TIME_CONTROLS, { id: '5+3', cat: 'blitz' }, { id: '10+5', cat: 'rapid' }];
      function drawTc() {
        tcBox.replaceChildren();
        for (const cat of CATEGORIES) {
          const options = controls.filter(t => t.cat === cat.id && supported.includes(t.id));
          if (!options.length) continue;
          const row = h('div', { class: 'tc-row' });
          for (const t of options) row.append(h('button', { class: t.id === requestedTime ? 'on' : '', onclick: () => { requestedTime = t.id; drawTc(); } }, t.id));
          tcBox.append(h('div', { class: 'tc-group' }, h('div', { class: 'tc-title' }, cat.icon, ' ', cat.name), row));
        }
      }
      drawTc();
      sheet.append(h('h2', {}, 'Игра с другом'), h('div', {}, h('div', { class: 'label' }, 'Время'), tcBox),
        h('div', {}, h('div', { class: 'label' }, 'Играю'), segmented([['w', 'Белыми'], ['b', 'Чёрными'], ['random', 'Случайно']], requestedSide, value => { requestedSide = value; })),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => { close(); create(); } }, 'Создать партию'),
        h('button', { class: 'btn btn-block', onclick: () => { close(); share.click(); } }, 'Скопировать приглашение'),
        h('button', { class: 'btn btn-danger btn-block', onclick: () => { close(); resign.click(); } }, 'Сдаться'),
        h('button', { class: 'btn btn-ghost btn-block', onclick: close }, 'Закрыть'));
    });
  }
  const strip = h('div', { class: 'moves-strip', 'aria-label': 'Ходы партии' });
  const prev = h('button', { class: 'history-arrow', 'aria-label': 'Предыдущий ход', onclick: () => navigate(-1) }, '‹');
  const next = h('button', { class: 'history-arrow', 'aria-label': 'Следующий ход', onclick: () => navigate(1) }, '›');
  function navigate(delta) { if (!state) return; viewedPly = Math.max(0, Math.min(state.moves.length, (viewedPly ?? state.moves.length) + delta)); drawPosition(false); }
  const menu = h('button', { class: 'btn btn-block', onclick: openMenu }, 'Меню партии');
  const profile = onlineProfile(() => state && socket?.readyState === WebSocket.OPEN ? room : null, (id) => { room = id; const url = new URL(location.href); url.searchParams.set('room', room); history.replaceState(null, '', url); connect(); });
  resign.style.display = 'none';
  root.append(profile.root, h('div', { class: 'history-bar' }, prev, strip, next), h('div', { class: 'online-status' }, title, status), clocks, h('div', { class: 'board-wrap full' }, board.root), menu, resign);
  function drawPosition(animate) {
    if (!state) { prev.disabled = next.disabled = true; return; }
    const ply = Math.min(viewedPly ?? state.moves.length, state.moves.length);
    const game = new Chess(); let last; strip.replaceChildren();
    const replay = new Chess();
    state.moves.forEach((move, i) => { last = replay.move(move); strip.append(h('span', { class: 'mchip' + (i === ply - 1 ? ' cur' : '') }, `${i % 2 === 0 ? (Math.floor(i / 2) + 1) + '. ' : ''}${last.san}`)); });
    last = null; for (const move of state.moves.slice(0, ply)) last = game.move(move);
    board.setInteractive(ply === state.moves.length && socket?.readyState === WebSocket.OPEN && state.started && !state.result && state.turn === state.color ? state.color : null);
    board.setPosition(game, { lastMove: last && { from: last.from, to: last.to }, animate });
    prev.disabled = ply === 0; next.disabled = ply === state.moves.length;
    strip.querySelector('.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  drawPosition(false);
  function drawClock() {
    if (!state) return;
    const values = { ...state.clock };
    if (state.started && !state.result && state.deadline) values[state.turn] = Math.max(0, state.deadline - (Date.now() + offset));
    clocks.replaceChildren(...['w', 'b'].map(color => h('div', { class: 'player grow' },
      h('div', { class: 'player-name grow' }, color === 'w' ? 'Белые' : 'Чёрные'),
      h('div', { class: 'clock' + (state.started && !state.result && state.turn === color ? ' on' : '') + (values[color] < 10000 ? ' low' : ''), 'aria-label': color === 'w' ? 'Часы белых' : 'Часы чёрных' }, formatClock(values[color])))));
  }
  function render(data) {
    const game = new Chess();
    let last;
    for (const move of data.moves) { last = game.move(move); if (!last) throw new Error('Некорректная партия'); }
    offset = data.serverTime - Date.now();
    const sound = previous > 0 && data.moves.length === previous + 1;
    if (!state || data.moves.length !== previous) viewedPly = null;
    state = data;
    if (data.result && data.moves.length) {
      const id = 'online-' + room;
      if (!games.get(id)) {
        const saved = games.save({ id, created: Date.now(), source: 'online', myColor: data.color, startFen: START_FEN, moves: game.history().map(m => ({ san: m.san, uci: m.uci })), result: data.result, reason: data.reason || null, notes: {}, headers: { Event: 'Онлайн-партия', Site: 'Шахматы', Date: pgnDate(), White: data.color === 'w' ? 'Вы' : 'Соперник', Black: data.color === 'b' ? 'Вы' : 'Соперник', Result: data.result } });
        if (!saved) toast('Не удалось сохранить партию: проверьте память устройства');
      }
    }
    menu.style.display = data.started && !data.result ? 'none' : '';
    resign.style.display = data.started && !data.result ? '' : 'none';
    board.setOrientation(data.color);
    drawPosition(sound);
    if (sound) playSound(soundForMove(last, game));
    previous = data.moves.length;
    status.textContent = data.result ? `Партия завершена: ${data.result}` : !data.started ? 'Ожидаем соперника. Отправьте приглашение.' : `Вы играете ${data.color === 'w' ? 'белыми' : 'чёрными'} · ${data.turn === data.color ? 'ваш ход' : 'ход соперника'}`;
    drawClock();
  }
  function connect() {
    clearTimeout(reconnect);
    if (!ONLINE_SERVER) { status.textContent = 'Онлайн-игра ещё не настроена: сервер не опубликован.'; return; }
    if (socket) { socket.onclose = null; socket.close(); }
    state = null; previous = 0; board.setInteractive(null);
    let token = localStorage.getItem('chess.online.' + room);
    if (!/^[a-f0-9]{64}$/.test(token || '')) { token = randomHex(32); localStorage.setItem('chess.online.' + room, token); }
    const url = new URL('/' + room, ONLINE_SERVER); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('token', token); url.searchParams.set('tc', requestedTime); url.searchParams.set('side', requestedSide);
    status.textContent = 'Подключение…';
    socket = new WebSocket(url);
    socket.onmessage = e => { try { render(JSON.parse(e.data)); } catch { status.textContent = 'Ошибка данных партии'; } };
    socket.onclose = () => { if (destroyed) return; board.setInteractive(null); status.textContent = 'Связь потеряна. Повторное подключение…'; reconnect = setTimeout(connect, 2500); };
  }
  timer = setInterval(drawClock, 200);
  if (room) connect();
  return { refresh() { board.setAnimation(animationMs(settings.get().animation)); board.setCoords(settings.get().coords); }, destroy() { profile.destroy(); destroyed = true; clearInterval(timer); clearTimeout(reconnect); socket?.close(); } };
}
