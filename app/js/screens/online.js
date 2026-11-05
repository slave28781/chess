import { Chess } from '../chess.js';
import { Board } from '../board.js';
import { settings } from '../store.js';
import { animationMs, formatClock } from '../timecontrol.js';
import { playSound, soundForMove } from '../sound.js';
import { h, toast, confirmSheet } from '../ui.js';
import { ONLINE_SERVER } from '../online-config.js';

const randomHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
export function mountOnline(root) {
  let socket, timer, reconnect, destroyed = false, state = null, previous = 0, offset = 0;
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
  const create = h('button', { class: 'btn btn-primary btn-block', onclick: () => {
    room = randomHex(16);
    const url = new URL(location.href); url.searchParams.set('room', room); history.replaceState(null, '', url);
    connect();
  } }, 'Создать партию');
  root.append(h('div', { class: 'card stack' }, title, status, create, share, clocks), h('div', { class: 'board-wrap full' }, board.root), h('div', { class: 'card stack' }, resign));
  function drawClock() {
    if (!state) return;
    const values = { ...state.clock };
    if (state.started && !state.result && state.deadline) values[state.turn] = Math.max(0, state.deadline - (Date.now() + offset));
    clocks.replaceChildren(h('span', { class: 'grow' }, `Белые: ${formatClock(values.w)}`), h('span', {}, `Чёрные: ${formatClock(values.b)}`));
  }
  function render(data) {
    const game = new Chess();
    let last;
    for (const move of data.moves) { last = game.move(move); if (!last) throw new Error('Некорректная партия'); }
    offset = data.serverTime - Date.now();
    const sound = previous > 0 && data.moves.length === previous + 1;
    state = data;
    board.setOrientation(data.color);
    board.setInteractive(data.started && !data.result && data.turn === data.color ? data.color : null);
    board.setPosition(game, { lastMove: last && { from: last.from, to: last.to }, animate: sound });
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
    const url = new URL('/' + room, ONLINE_SERVER); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('token', token);
    status.textContent = 'Подключение…';
    socket = new WebSocket(url);
    socket.onmessage = e => { try { render(JSON.parse(e.data)); } catch { status.textContent = 'Ошибка данных партии'; } };
    socket.onclose = () => { if (destroyed) return; board.setInteractive(null); status.textContent = 'Связь потеряна. Повторное подключение…'; reconnect = setTimeout(connect, 2500); };
  }
  timer = setInterval(drawClock, 200);
  if (room) connect();
  return { refresh() { board.setAnimation(animationMs(settings.get().animation)); board.setCoords(settings.get().coords); }, destroy() { destroyed = true; clearInterval(timer); clearTimeout(reconnect); socket?.close(); } };
}
