// Звуки синтезируются на лету (WebAudio) — без аудиофайлов.
let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = on; }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Короткий «деревянный» щелчок: шум через полосовой фильтр.
function knock(freq, gain, dur = 0.07, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.4;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

function tone(freq, dur, delay = 0, vol = 0.08) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function playSound(kind) {
  if (!enabled) return;
  try {
    if (kind === 'move') knock(1800, 0.9);
    else if (kind === 'capture') { knock(1200, 1.1, 0.09); knock(2400, 0.5, 0.05, 0.02); }
    else if (kind === 'check') { knock(1600, 0.8); tone(880, 0.18, 0.03); }
    else if (kind === 'end') { tone(523, 0.5); tone(659, 0.5, 0.08); tone(784, 0.7, 0.16); }
    else if (kind === 'good') { tone(660, 0.18); tone(990, 0.3, 0.09); }
    else if (kind === 'bad') { tone(300, 0.25, 0, 0.07); tone(220, 0.3, 0.12, 0.07); }
  } catch { /* звук не обязателен */ }
}

export function soundForMove(mv, chessAfter) {
  if (chessAfter.isGameOver()) return 'end';
  if (chessAfter.inCheck()) return 'check';
  return mv.captured ? 'capture' : 'move';
}
