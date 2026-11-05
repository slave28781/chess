import { Chess } from '../app/js/chess.js';
import { canMate } from '../app/js/timecontrol.js';

const ROOM = /^[a-f0-9]{32}$/;
const TOKEN = /^[a-f0-9]{64}$/;
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const origin = request.headers.get('Origin');
      const allowed = origin === 'https://slave28781.github.io' || origin === 'http://localhost:8000' || origin === 'http://127.0.0.1:8000';
      if (!allowed) return new Response('Forbidden', { status: 403 });
      const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
      const response = await env.PROFILES.get(env.PROFILES.idFromName('registry')).fetch(request);
      const resultHeaders = new Headers(response.headers); for (const [k, v] of Object.entries(headers)) resultHeaders.set(k, v);
      return new Response(response.body, { status: response.status, headers: resultHeaders });
    }
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
    if (!state) state = { players: {}, moves: [], clock: { w: 300000, b: 300000 }, turn: 'w', started: false, deadline: null, result: null };
    let color = Object.keys(state.players).find(c => state.players[c] === token);
    if (!color) {
      color = !state.players.w ? 'w' : !state.players.b ? 'b' : null;
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
      state.clock[color] = Math.max(0, state.deadline - now);
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

// A single registry serializes nickname reservations. Recovery codes are stored only as hashes.
export class Profiles {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
    let body;
    try { const text = await request.text(); if (text.length > 2048) return reply({ error: 'Слишком длинный запрос' }, 400); body = JSON.parse(text); } catch { return reply({ error: 'Неверный запрос' }, 400); }
    if (!body || typeof body !== 'object' || typeof body.code !== 'string' || !TOKEN.test(body.code)) return reply({ error: 'Неверный код' }, 400);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.code)))).map(b => b.toString(16).padStart(2, '0')).join('');
    const action = new URL(request.url).pathname.slice(5);
    return this.ctx.blockConcurrencyWhile(async () => {
      const store = this.ctx.storage;
      const profile = await store.get('key:' + hash);
      if (action === 'register') {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) return reply({ error: 'Ник: 3–20 латинских букв, цифр или знак подчёркивания' }, 400);
        const normalized = name.toLowerCase();
        // Basic filter only; it cannot catch every spelling or language.
        if (/(fuck|shit|nigger|nazi|хуй|пизд|бляд)/i.test(normalized.replace(/[_0-9]/g, ''))) return reply({ error: 'Выберите другой ник' }, 400);
        if (profile) return reply({ error: 'Этот код уже используется' }, 409);
        if (await store.get('name:' + normalized)) return reply({ error: 'Ник уже занят' }, 409);
        await store.put({ ['name:' + normalized]: hash, ['key:' + hash]: name });
        return reply({ name });
      }
      if (!profile) return reply({ error: 'Профиль не найден — проверьте код' }, 401);
      if (action === 'profile') return reply({ name: profile });
      if (action === 'invites') {
        const invites = (await store.get('inbox:' + hash) || []).filter(i => i.expires > Date.now());
        return reply({ name: profile, invites });
      }
      if (action === 'invite') {
        const target = typeof body.name === 'string' ? body.name.trim().toLowerCase() : '';
        if (!/^[a-z0-9_]{3,20}$/.test(target) || !ROOM.test(body.room || '')) return reply({ error: 'Проверьте ник и комнату' }, 400);
        const recipient = await store.get('name:' + target);
        if (!recipient) return reply({ error: 'Игрок не найден' }, 404);
        if (recipient === hash) return reply({ error: 'Нельзя пригласить себя' }, 400);
        const last = await store.get('sent:' + hash) || 0;
        if (Date.now() - last < 5000) return reply({ error: 'Подождите перед следующим приглашением' }, 429);
        const list = (await store.get('inbox:' + recipient) || []).filter(i => i.expires > Date.now()).slice(-19);
        list.push({ from: profile, room: body.room, expires: Date.now() + 3600000 });
        await store.put({ ['inbox:' + recipient]: list, ['sent:' + hash]: Date.now() });
        return reply({ ok: true });
      }
      if (action === 'dismiss') {
        if (!ROOM.test(body.room || '')) return reply({ error: 'Неверная комната' }, 400);
        const list = (await store.get('inbox:' + hash) || []).filter(i => i.room !== body.room && i.expires > Date.now());
        await store.put('inbox:' + hash, list); return reply({ ok: true });
      }
      return reply({ error: 'Неизвестная команда' }, 404);
    });
  }
}
