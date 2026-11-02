// Звуки синтезируются на лету (WebAudio) — без чужих аудиофайлов.
// Ход: деревянная фигура ставится на доску — глухой «тук» корпуса + короткий щелчок о доску.
let ctx = null;
let enabled = true;
let master = null;

export function setSoundEnabled(on) { enabled = on; }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // Общая громкость подобрана замером: самые громкие звуки не выше ~0.8 (без хрипа на динамике).
    master = ctx.createGain();
    master.gain.value = 1.7;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
  return ctx;
}

let noiseBuf = null;
function noise(a) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.25, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

// Удар дерева о дерево. pitch — «размер» фигуры (1 — обычный ход), vol — громкость.
const WOOD = 0.42; // уровни выровнены по замеру пиков
const TONE = 2.5;

function woodHit(t, { pitch = 1, vol = 1 } = {}) {
  const a = ctx;
  vol *= WOOD;
  // 1. Тело: короткий тон с быстрым падением высоты — глухой «тук».
  const body = a.createOscillator();
  const bodyGain = a.createGain();
  body.type = 'sine';
  body.frequency.setValueAtTime(240 * pitch, t);
  body.frequency.exponentialRampToValueAtTime(95 * pitch, t + 0.06);
  bodyGain.gain.setValueAtTime(0.0001, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.75 * vol, t + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  body.connect(bodyGain).connect(master);
  body.start(t);
  body.stop(t + 0.13);

  // 2. Щелчок о доску: шум через полосовой фильтр — «дерево».
  const n = noise(a);
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500 * pitch;
  bp.Q.value = 1.1;
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  n.connect(bp).connect(ng).connect(master);
  n.start(t, 0.02);
  n.stop(t + 0.06);

  // 3. Короткий резонанс доски — делает звук «плотнее».
  const res = a.createOscillator();
  const rg = a.createGain();
  res.type = 'triangle';
  res.frequency.value = 520 * pitch;
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.003);
  rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  res.connect(rg).connect(master);
  res.start(t);
  res.stop(t + 0.08);
}

// Резкий щелчок: шум через фильтр высоких частот, очень короткий. freq — «высота» щелчка.
function snap(t, { freq = 3000, dur = 0.03, vol = 1 } = {}) {
  const a = ctx;
  const n = noise(a);
  const hp = a.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = freq;
  const bp = a.createBiquadFilter();
  bp.type = 'peaking';
  bp.frequency.value = freq * 1.3;
  bp.gain.value = 9;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * WOOD * 0.42, t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(hp).connect(bp).connect(g).connect(master);
  n.start(t, 0.05);
  n.stop(t + dur + 0.01);
}

function tone(t, freq, dur, { vol = 0.12, type = 'sine' } = {}) {
  vol *= TONE;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Колокольчик: основной тон + обертон — для шаха, наград и блестящих ходов.
function bell(t, freq, dur = 0.6, vol = 0.1) {
  tone(t, freq, dur, { vol });
  tone(t, freq * 2.01, dur * 0.6, { vol: vol * 0.35 });
  tone(t, freq * 3.02, dur * 0.35, { vol: vol * 0.15 });
}

const SOUNDS = {
  move: (t) => woodHit(t),
  // Взятие — один резкий «тх»: яркий щелчок одновременно с ударом, без второго удара.
  capture: (t) => { snap(t, { freq: 2400, dur: 0.04, vol: 1 }); woodHit(t, { pitch: 0.8, vol: 0.95 }); },
  castle: (t) => { woodHit(t, { pitch: 0.95 }); woodHit(t + 0.11, { pitch: 1.05, vol: 0.85 }); },
  // Шах — ход и сразу короткое высокое «чик».
  check: (t) => { woodHit(t, { vol: 0.85 }); snap(t + 0.055, { freq: 5200, dur: 0.022, vol: 0.9 }); tone(t + 0.055, 2350, 0.05, { vol: 0.05, type: 'triangle' }); },
  promote: (t) => { woodHit(t); tone(t + 0.03, 660, 0.12, { vol: 0.08, type: 'triangle' }); tone(t + 0.1, 990, 0.2, { vol: 0.08, type: 'triangle' }); },
  start: (t) => { bell(t, 659, 0.5, 0.07); bell(t + 0.12, 988, 0.6, 0.07); },
  end: (t) => { bell(t, 523, 0.7, 0.08); bell(t + 0.12, 659, 0.7, 0.08); bell(t + 0.24, 784, 0.9, 0.08); },
  illegal: (t) => { tone(t, 180, 0.12, { vol: 0.08, type: 'square' }); },
  lowtime: (t) => { tone(t, 1760, 0.07, { vol: 0.08 }); tone(t + 0.14, 1760, 0.07, { vol: 0.08 }); },
  good: (t) => { bell(t, 784, 0.35, 0.07); bell(t + 0.09, 1175, 0.5, 0.07); },
  bad: (t) => { tone(t, 330, 0.25, { vol: 0.07, type: 'triangle' }); tone(t + 0.12, 247, 0.32, { vol: 0.07, type: 'triangle' }); },
  // Блестящий ход: искристое арпеджио вверх.
  brilliant: (t) => [1047, 1319, 1568, 2093, 2637].forEach((f, i) => bell(t + i * 0.07, f, 0.7 - i * 0.06, 0.06)),
  great: (t) => { bell(t, 880, 0.45, 0.07); bell(t + 0.1, 1319, 0.6, 0.07); },
};

export function playSound(kind) {
  if (!enabled || !SOUNDS[kind]) return;
  try {
    const a = audio();
    if (!a) return;
    SOUNDS[kind](a.currentTime + 0.005);
  } catch { /* звук не обязателен */ }
}

export function soundForMove(mv, chessAfter) {
  if (chessAfter.isGameOver()) return chessAfter.isCheckmate() ? 'check' : 'move';
  if (chessAfter.inCheck()) return 'check';
  if (mv.flags && (mv.flags.includes('k') || mv.flags.includes('q'))) return 'castle';
  if (mv.promotion) return 'promote';
  return mv.captured ? 'capture' : 'move';
}
