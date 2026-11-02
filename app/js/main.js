// Точка входа: вкладки, настройки, service worker.
import { settings, puzzles, resetAll } from './store.js';
import { setSoundEnabled, playSound } from './sound.js';
import { h, icon, openSheet, segmented, switchEl, confirmSheet, getEngine, toast } from './ui.js';
import { mountPlay } from './screens/play.js';
import { mountAnalysis } from './screens/analysis.js';
import { mountPuzzles } from './screens/puzzles.js';
import { mountGames } from './screens/games.js';

const TABS = [
  ['play', 'Игра', mountPlay],
  ['analysis', 'Анализ', mountAnalysis],
  ['puzzles', 'Задачи', mountPuzzles],
  ['games', 'Партии', mountGames],
];

const view = document.getElementById('view');
const tabbar = document.getElementById('tabs');
let current = null;
let currentTab = null;

function applySettings() {
  const s = settings.get();
  document.documentElement.dataset.theme = s.theme;
  setSoundEnabled(s.sound);
}

function renderTabs() {
  tabbar.innerHTML = '';
  const todo = puzzles.list().filter((p) => !p.solved).length;
  for (const [id, label] of TABS) {
    tabbar.append(h('button', {
      class: 'tab' + (id === currentTab ? ' active' : ''),
      'aria-current': id === currentTab ? 'page' : null,
      onclick: () => go(id),
    }, icon(id), label, id === 'puzzles' && todo ? h('span', { class: 'dot' }, String(Math.min(todo, 99))) : null));
  }
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
  openSheet((sheet, close) => {
    const themes = [['green', '#ebecd0', '#739552'], ['brown', '#f0d9b5', '#b58863'], ['blue', '#dee3e6', '#8ca2ad'], ['purple', '#e8e1f2', '#8c74b4']];
    const sw = h('div', { class: 'swatches' });
    const drawSw = (v) => {
      sw.innerHTML = '';
      for (const [id, l, d] of themes) {
        sw.append(h('button', {
          class: 'swatch' + (v === id ? ' on' : ''),
          'aria-label': 'Тема доски ' + id,
          onclick: () => { settings.set({ theme: id }); applySettings(); drawSw(id); current?.refresh?.(); },
        }, h('i', { style: { background: `repeating-conic-gradient(${d} 0 25%, ${l} 0 50%) 0 0 / 50% 50%` } })));
      }
    };
    drawSw(s.theme);
    sheet.append(
      h('h2', {}, 'Настройки'),
      h('div', {}, h('div', { class: 'label' }, 'Запись ходов'), segmented([['en', 'Nf3 (англ.)'], ['ru', 'Кf3 (рус.)']], s.notation, (v) => { settings.set({ notation: v }); current?.refresh?.(); })),
      h('div', {}, h('div', { class: 'label' }, 'Доска'), sw),
      h('div', { class: 'toggle-row' }, h('span', {}, 'Звуки'), switchEl(s.sound, (v) => { settings.set({ sound: v }); applySettings(); if (v) playSound('move'); })),
      h('div', { class: 'toggle-row' }, h('span', {}, 'Координаты на доске'), switchEl(s.coords, (v) => { settings.set({ coords: v }); current?.refresh?.(); })),
      h('button', {
        class: 'btn btn-danger btn-block',
        onclick: async () => {
          close();
          if (!(await confirmSheet('Удалить все данные?', 'Партии, разборы, задачи и настройки будут удалены с этого телефона.', 'Удалить всё', true))) return;
          resetAll();
          applySettings();
          go('play');
          toast('Данные удалены');
        },
      }, 'Удалить все данные'),
      h('div', { class: 'about' },
        'Движок: Stockfish 18 (stockfish.js, GPL-3.0) — работает прямо на телефоне, без сервера. ',
        'Фигуры: cburnett (GPLv2+). Код приложения: GPL-3.0. ',
        'Партии и заметки хранятся только на этом устройстве.'),
      h('button', { class: 'btn btn-block', onclick: close }, 'Готово'),
    );
  });
}

document.getElementById('settingsBtn').addEventListener('click', settingsSheet);
document.getElementById('settingsBtn').replaceChildren(icon('settings'));
window.addEventListener('hashchange', () => {
  const tab = location.hash.slice(1);
  if (tab && tab !== currentTab && TABS.some((t) => t[0] === tab)) go(tab);
});

applySettings();
go(location.hash.slice(1) || 'play');

// Движок грузится заранее, чтобы первый ход и разбор не ждали загрузки 7 МБ.
setTimeout(() => { getEngine().catch(() => {}); }, 800);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
