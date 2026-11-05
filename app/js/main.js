// Точка входа: вкладки, рейтинг в шапке, настройки, service worker.
import { settings, puzzles, resetAll, profile as profileStore } from './store.js';
import { THEMES, isThemeUnlocked, achievementById } from './progress.js';
import { setSoundEnabled, playSound } from './sound.js';
import { h, append, icon, openSheet, segmented, switchEl, confirmSheet, getEngine, toast, applyTheme } from './ui.js';
import { mountPlay } from './screens/play.js';
import { mountOnline } from './screens/online.js';
import { mountAnalysis } from './screens/analysis.js';
import { mountPuzzles } from './screens/puzzles.js';
import { mountGames } from './screens/games.js';
import { mountProfile } from './screens/profile.js';

const TABS = [
  ['play', 'Игра', mountPlay],
  ['online', 'С другом', mountOnline],
  ['analysis', 'Анализ', mountAnalysis],
  ['puzzles', 'Задачи', mountPuzzles],
  ['games', 'Партии', mountGames],
  ['profile', 'Профиль', mountProfile],
];

const view = document.getElementById('view');
const tabbar = document.getElementById('tabs');
const ratingBtn = h('button', { class: 'rating-badge', 'aria-label': 'Ваш рейтинг', onclick: () => go('profile') });
let current = null;
let currentTab = null;

function applySettings() {
  const s = settings.get();
  const p = profileStore.get();
  const theme = THEMES.find((t) => t.id === s.theme);
  // Стиль мог стать недоступен (например, после сброса наград) — вернуть зелёный.
  if (!theme || !isThemeUnlocked(p, theme)) settings.set({ theme: 'green' });
  applyTheme(settings.get().theme);
  setSoundEnabled(s.sound);
}

function renderHeader() {
  ratingBtn.replaceChildren('★ ', String(profileStore.get().rating), h('small', {}, ' рейтинг'));
}

function renderTabs() {
  tabbar.innerHTML = '';
  const todo = puzzles.list().filter((p) => !p.solved).length;
  for (const [id, label] of TABS) {
    append(tabbar, h('button', {
      class: 'tab' + (id === currentTab ? ' active' : ''),
      'aria-current': id === currentTab ? 'page' : null,
      onclick: () => go(id),
    }, icon(id), label, id === 'puzzles' && todo ? h('span', { class: 'dot' }, String(Math.min(todo, 99))) : null));
  }
  renderHeader();
}

export function go(tab, params = {}) {
  const entry = TABS.find((t) => t[0] === tab) || TABS[0];
  if (current) current.destroy();
  currentTab = entry[0];
  view.innerHTML = '';
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  current = entry[2](view, { go, params });
  if (location.hash !== '#' + currentTab) history.replaceState(null, '', '#' + currentTab);
  renderTabs();
}

function settingsSheet() {
  const s = settings.get();
  const p = profileStore.get();
  openSheet((sheet, close) => {
    const sw = h('div', { class: 'theme-grid' });
    const drawSw = (v) => {
      sw.innerHTML = '';
      for (const t of THEMES) {
        const open = isThemeUnlocked(p, t);
        sw.append(h('button', {
          class: 'theme-card' + (v === t.id ? ' on' : '') + (open ? '' : ' locked'),
          'aria-label': `Стиль «${t.name}»${open ? '' : ', закрыт'}`,
          onclick: () => {
            if (!open) { toast(`«${t.name}» откроется за награду «${achievementById(t.reward).title}»`); return; }
            settings.set({ theme: t.id }); applySettings(); drawSw(t.id); current?.refresh?.();
          },
        }, h('i', { style: { background: `repeating-conic-gradient(${t.dark} 0 25%, ${t.light} 0 50%) 0 0 / 50% 50%` } })));
      }
    };
    drawSw(s.theme);
    append(sheet,
      h('h2', {}, 'Настройки'),
      h('div', {}, h('div', { class: 'label' }, 'Запись ходов'), segmented([['en', 'Nf3 (англ.)'], ['ru', 'Кf3 (рус.)']], s.notation, (v) => { settings.set({ notation: v }); current?.refresh?.(); })),
      h('div', {},
        h('div', { class: 'label' }, 'Скорость анимации'),
        segmented([['auto', 'Авто'], ['slow', 'Медл.'], ['normal', 'Обычн.'], ['fast', 'Быстро'], ['off', 'Нет']], s.animation, (v) => { settings.set({ animation: v }); current?.refresh?.(); }),
        h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Авто: в пуле мгновенно, в блице быстро, в рапиде и без часов — плавно.')),
      h('div', {}, h('div', { class: 'label' }, 'Доска · новые стили открываются наградами'), sw),
      h('div', { class: 'toggle-row' }, h('span', {}, 'Звуки'), switchEl(s.sound, (v) => { settings.set({ sound: v }); applySettings(); if (v) playSound('move'); })),
      h('div', { class: 'toggle-row' }, h('span', {}, 'Координаты на доске'), switchEl(s.coords, (v) => { settings.set({ coords: v }); current?.refresh?.(); })),
      h('button', {
        class: 'btn btn-danger btn-block',
        onclick: async () => {
          close();
          if (!(await confirmSheet('Удалить все данные?', 'Партии, разборы, задачи, рейтинг и настройки будут удалены с этого телефона.', 'Удалить всё', true))) return;
          resetAll();
          applySettings();
          go('play');
          toast('Данные удалены');
        },
      }, 'Удалить все данные'),
      h('div', { class: 'about' },
        'Движок: Stockfish 18 (stockfish.js, GPL-3.0) — работает прямо на телефоне, без сервера. ',
        'Фигуры: cburnett (GPLv2+). Значки ходов нарисованы для этого приложения. Код приложения: GPL-3.0. ',
        'Партии, рейтинг и заметки хранятся только на этом устройстве.'),
      h('button', { class: 'btn btn-block', onclick: close }, 'Готово'),
    );
  });
}

const settingsBtn = document.getElementById('settingsBtn');
settingsBtn.addEventListener('click', settingsSheet);
settingsBtn.replaceChildren(icon('settings'));
settingsBtn.before(ratingBtn);
window.addEventListener('hashchange', () => {
  const tab = location.hash.slice(1);
  if (tab && tab !== currentTab && TABS.some((t) => t[0] === tab)) go(tab);
});
// Рейтинг в шапке обновляется, когда партия закончилась (профиль сохранён).
window.addEventListener('storage', renderHeader);
setInterval(renderHeader, 1500);

applySettings();
go(new URL(location.href).searchParams.has('room') ? 'online' : (location.hash.slice(1) || 'play'));

// Движок грузится заранее, чтобы первый ход и разбор не ждали загрузки 7 МБ.
setTimeout(() => { getEngine().catch(() => {}); }, 800);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Вышла новая версия — один раз перезагрузиться, чтобы сразу её показать.
  // Первая установка — не повод перезагружаться; последующие смены версии — повод.
  let hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      // При возвращении в приложение проверяем, нет ли обновления.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
