import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, engineBudget, animationMs, flagResult, canMate, timeControl, tcLabel, isLowTime, TIME_CONTROLS, humanThinkMs } from '../app/js/timecontrol.js';

test('часы: формат', () => {
  assert.equal(formatClock(300000), '5:00');
  assert.equal(formatClock(61000), '1:01');
  assert.equal(formatClock(10000), '0:10');
  assert.equal(formatClock(9450), '0:09.4');
  assert.equal(formatClock(-5), '0:00.0');
  assert.equal(formatClock(3600000), '1:00:00');
});

test('контроли времени: пуля, блиц, рапид', () => {
  assert.equal(timeControl('1+0').cat, 'bullet');
  assert.equal(timeControl('3+2').cat, 'blitz');
  assert.equal(timeControl('10+10').cat, 'rapid');
  assert.equal(timeControl('???').cat, 'none');
  assert.equal(tcLabel('5+5'), '5 + 5 мин');
  assert.equal(tcLabel('1+0'), '1 мин');
  assert.ok(TIME_CONTROLS.some((t) => t.id === '5+5') && TIME_CONTROLS.some((t) => t.id === '30+0'));
  assert.ok(isLowTime(9000, 300));
  assert.ok(isLowTime(25000, 300), '10% от 5 минут = 30 секунд');
  assert.ok(!isLowTime(40000, 300));
});

test('движок думает меньше, когда времени мало', () => {
  assert.equal(engineBudget(60000, 0, 3000), 1714, 'минута на часах: ~1/35');
  assert.equal(engineBudget(60000, 0, 1200), 1200, 'но не дольше, чем думает уровень');
  assert.equal(engineBudget(600000, 10, 800), 800, 'много времени — ограничение уровня');
  assert.equal(engineBudget(2000, 0, 800), 57);
  assert.equal(engineBudget(300, 0, 800), 30, 'почти без времени — минимум');
});

test('анимация подстраивается под контроль', () => {
  assert.equal(animationMs('auto', 'bullet'), 0, 'в пуле мгновенно');
  assert.equal(animationMs('auto', 'blitz'), 160);
  assert.equal(animationMs('auto', 'rapid'), 300);
  assert.equal(animationMs('auto'), 300);
  assert.equal(animationMs('slow', 'bullet'), 450, 'ручная настройка важнее');
  assert.equal(animationMs('off'), 0);
});

test('проигрыш по времени и ничья, если сопернику нечем матовать', () => {
  const full = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.deepEqual(flagResult(full, 'w'), { result: '0-1', reason: 'timeout' });
  const loneKnight = '4k3/8/8/8/8/8/n7/4K2R w - - 0 1';
  assert.ok(!canMate(loneKnight, 'b'));
  assert.deepEqual(flagResult(loneKnight, 'w'), { result: '1/2-1/2', reason: 'timeout-draw' });
  assert.deepEqual(flagResult(loneKnight, 'b'), { result: '1-0', reason: 'timeout' });
});

test('бот тратит время как человек, а не по полсекунды', () => {
  const mid = () => 0.5; // без случайности
  // 10 минут на часах, середина партии: ~20 секунд на ход
  assert.equal(humanThinkMs({ remainingMs: 600000, ply: 30, random: mid }), 20000);
  // в дебюте втрое быстрее
  assert.equal(humanThinkMs({ remainingMs: 600000, ply: 4, random: mid }), 6000);
  // вынужденный ход — почти сразу
  assert.ok(humanThinkMs({ remainingMs: 600000, ply: 30, legalMoves: 1, random: mid }) < 1000);
  // мало времени — быстро, но не больше 12% остатка
  assert.ok(humanThinkMs({ remainingMs: 8000, ply: 50, random: () => 1 }) <= 960);
  // за партию 10+0 (40 ходов) бот тратит заметную часть времени, но не всё
  let left = 600000;
  for (let ply = 1; ply < 80; ply += 2) left -= humanThinkMs({ remainingMs: left, ply, random: mid });
  const spent = 600000 - left;
  assert.ok(spent > 240000 && spent < 520000, `потрачено ${Math.round(spent / 1000)} с`);
});
