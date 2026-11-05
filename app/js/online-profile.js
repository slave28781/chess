import { h, toast } from './ui.js';
import { ONLINE_SERVER } from './online-config.js';

const KEY = 'chess.online.profile.v1';
const randomCode = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
export function onlineProfile(getRoom, joinRoom) {
  const root = h('details', { class: 'online-menu' }, h('summary', {}, 'Ник и приглашения'));
  const box = h('div', { class: 'stack online-menu-content' }); root.append(box);
  let current = null, interval = null, stopped = false;
  try { current = JSON.parse(localStorage.getItem(KEY)); } catch {}
  async function api(action, data) {
    const response = await fetch(`${ONLINE_SERVER}/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Ошибка сервера');
    return result;
  }
  function save(profile) { localStorage.setItem(KEY, JSON.stringify(profile)); current = profile; }
  function draw() {
    box.replaceChildren();
    if (!current) {
      const name = h('input', { type: 'text', placeholder: 'Ник: латинские буквы и цифры', maxlength: 20, 'aria-label': 'Ник' });
      const code = h('input', { type: 'text', placeholder: 'Код восстановления', 'aria-label': 'Код восстановления', autocomplete: 'off', spellcheck: 'false' });
      box.append(h('div', { class: 'muted small' }, 'Ник должен быть уникальным: 3–20 латинских букв, цифр или _. Выберите ник один раз.'), name,
        h('button', { class: 'btn btn-primary btn-block', onclick: async () => { try { const secret = randomCode(); const result = await api('register', { name: name.value, code: secret }); save({ name: result.name, code: secret }); draw(); toast('Ник сохранён'); } catch (e) { toast(e.message); } } }, 'Занять ник'),
        h('div', { class: 'label' }, 'Уже есть профиль?'), code,
        h('button', { class: 'btn btn-block', onclick: async () => { try { const secret = code.value.trim().toLowerCase(); const result = await api('profile', { code: secret }); save({ name: result.name, code: secret }); draw(); toast('Профиль восстановлен'); } catch (e) { toast(e.message); } } }, 'Восстановить'));
      return;
    }
    const target = h('input', { type: 'text', placeholder: 'Ник друга', maxlength: 20, 'aria-label': 'Ник друга' });
    const inbox = h('div', { class: 'stack' });
    box.append(h('div', {}, 'Ваш ник: ', h('b', {}, current.name)),
      h('button', { class: 'btn btn-block', onclick: () => { const field = h('textarea', { readonly: true, 'aria-label': 'Ваш секретный код восстановления' }); field.value = current.code; box.append(h('p', { class: 'muted small' }, 'Сохраните код в надёжном месте. Он даёт доступ к нику; никому его не отправляйте.'), field); } }, 'Показать код восстановления'),
      target, h('button', { class: 'btn btn-block', onclick: async () => { try { const room = getRoom(); if (!room) throw new Error('Сначала создайте партию и дождитесь подключения'); await api('invite', { code: current.code, name: target.value, room }); toast('Приглашение отправлено'); } catch (e) { toast(e.message); } } }, 'Пригласить по нику'), h('div', { class: 'label' }, 'Приглашения'), inbox);
    const refresh = async () => { try { const result = await api('invites', { code: current.code }); if (stopped || !inbox.isConnected) return; inbox.replaceChildren(); for (const invite of result.invites) inbox.append(h('div', { class: 'row' }, h('span', { class: 'grow' }, invite.from), h('button', { class: 'btn btn-sm', onclick: async () => { try { await api('dismiss', { code: current.code, room: invite.room }); joinRoom(invite.room); await refresh(); } catch (e) { toast(e.message); } } }, 'Играть'), h('button', { class: 'btn btn-sm', onclick: async () => { try { await api('dismiss', { code: current.code, room: invite.room }); await refresh(); } catch (e) { toast(e.message); } } }, '×'))); if (!result.invites.length) inbox.append(h('span', { class: 'muted small' }, 'Нет приглашений')); } catch { if (inbox.isConnected) inbox.textContent = 'Не удалось загрузить приглашения'; } };
    clearInterval(interval); refresh(); interval = setInterval(refresh, 15000);
  }
  draw();
  return { root, destroy() { stopped = true; clearInterval(interval); } };
}
