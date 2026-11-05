import { Chess } from '../app/js/chess.js';
import { canMate } from '../app/js/timecontrol.js';

const ROOM = /^[a-f0-9]{32}$/;
const TOKEN = /^[a-f0-9]{64}$/;
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = url.pathname.slice(1);
    const token = url.searchParams.get('token');
    if (!ROOM.test(room) || !TOKEN.test(token || '') || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Invalid request', { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  },
};

export class Room {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const token = new URL(request.url).searchParams.get('token');
    let state = await this.ctx.storage.get('game');
    if (!state) {
      const url = new URL(request.url);
      const controls = { '1+0': [60000, 0], '3+0': [180000, 0], '3+2': [180000, 2000], '5+0': [300000, 0], '5+3': [300000, 3000], '10+0': [600000, 0], '10+5': [600000, 5000], '15+10': [900000, 10000] };
      const tc = Object.hasOwn(controls, url.searchParams.get('tc')) ? url.searchParams.get('tc') : '5+0';
      const [base, increment] = controls[tc];
      const side = url.searchParams.get('side');
      const creatorColor = side === 'b' ? 'b' : side === 'random' ? (crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 'w' : 'b') : 'w';
      state = { players: {}, moves: [], clock: { w: base, b: base }, tc, increment, creatorColor, turn: 'w', started: false, deadline: null, result: null };
    }
    let color = Object.keys(state.players).find(c => state.players[c] === token);
    if (!color) {
      color = !state.players.w && !state.players.b ? (state.creatorColor || 'w') : !state.players.w ? 'w' : !state.players.b ? 'b' : null;
      if (!color) return new Response('Room full', { status: 403 });
      state.players[color] = token;
    }
    if (state.players.w && state.players.b && !state.started) {
      state.started = true;
      state.deadline = Date.now() + state.clock.w;
      await this.ctx.storage.setAlarm(state.deadline);
    }
    await this.ctx.storage.put('game', state);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [color]);
    for (const socket of this.ctx.getWebSockets(color)) if (socket !== server) socket.close(1000, 'Reconnected');
    await this.broadcast(state);
    return new Response(null, { status: 101, webSocket: client });
  }
  async broadcast(state) {
    const { players, ...publicState } = state;
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({ ...publicState, color: this.ctx.getTags(ws)[0], serverTime: Date.now() })); } catch {}
    }
  }
  async expire(state, now) {
    if (state.started && !state.result && state.deadline <= now) {
      state.clock[state.turn] = 0;
      const game = new Chess();
      for (const move of state.moves) game.move(move);
      const winner = state.turn === 'w' ? 'b' : 'w';
      state.result = canMate(game.fen(), winner) ? (winner === 'w' ? '1-0' : '0-1') : '1/2-1/2';
      state.reason = 'timeout';
      state.deadline = null;
      await this.ctx.storage.put('game', state);
      return true;
    }
    return false;
  }
  async webSocketMessage(ws, message) {
    let data;
    try { if (typeof message !== 'string' || message.length > 500) return; data = JSON.parse(message); } catch { return; }
    const state = await this.ctx.storage.get('game');
    const now = Date.now();
    if (await this.expire(state, now)) { await this.broadcast(state); return; }
    const color = this.ctx.getTags(ws)[0];
    if (!state.started || state.result) return;
    if (data.type === 'resign') {
      state.result = color === 'w' ? '0-1' : '1-0'; state.reason = 'resign'; state.deadline = null;
    } else if (data.type === 'move' && color === state.turn && data.ply === state.moves.length && typeof data.move === 'object' && data.move) {
      const game = new Chess();
      for (const move of state.moves) if (!game.move(move)) throw new Error('Invalid stored game');
      let move;
      try { move = game.move(data.move); } catch { return; }
      if (!move) { await this.broadcast(state); return; }
      state.clock[color] = Math.max(0, state.deadline - now) + (state.increment || 0);
      state.moves.push({ from: move.from, to: move.to, promotion: move.promotion });
      state.turn = game.turn();
      if (game.isGameOver()) {
        state.result = game.isCheckmate() ? (color === 'w' ? '1-0' : '0-1') : '1/2-1/2';
        state.reason = game.gameOverReason(); state.deadline = null;
      } else { state.deadline = now + state.clock[state.turn]; await this.ctx.storage.setAlarm(state.deadline); }
    } else { await this.broadcast(state); return; }
    await this.ctx.storage.put('game', state);
    await this.broadcast(state);
  }
  async alarm() {
    const state = await this.ctx.storage.get('game');
    if (!state || !state.deadline) return;
    if (await this.expire(state, Date.now())) await this.broadcast(state);
    else await this.ctx.storage.setAlarm(state.deadline);
  }
}
