// 未知律 — tiny WebAudio voice. Every law owns one pitch; its trigger owns the timbre.

let ac = null;
let master = null;

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.35;
    master.connect(ac.destination);
  } catch { ac = null; }
}

function tone(freq, { wave = 'sine', dur = 0.25, vol = 0.4, delay = 0, slide = 0, cutoff = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  let node = o;
  if (cutoff) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const WAVE = { touch: 'triangle', adj: 'sine', meet: 'square', period: 'sawtooth' };

export function lawNote(law, delay = 0) {
  const f = 261.6 * Math.pow(2, SCALE[law.note % SCALE.length] / 12);
  const wave = WAVE[law.trigger.type];
  const quiet = wave === 'square' || wave === 'sawtooth';
  tone(f, { wave, dur: 0.45, vol: quiet ? 0.12 : 0.35, delay, cutoff: quiet ? 1800 : 0 });
  tone(f * 2, { wave: 'sine', dur: 0.3, vol: 0.08, delay: delay + 0.02 });
}

export const sfx = {
  step: () => tone(90 + Math.random() * 20, { wave: 'triangle', dur: 0.06, vol: 0.12 }),
  push: () => tone(70, { wave: 'square', dur: 0.08, vol: 0.08, cutoff: 500 }),
  nudge: () => tone(60, { wave: 'sine', dur: 0.1, vol: 0.2 }),
  bump: () => tone(50, { wave: 'sine', dur: 0.05, vol: 0.12 }),
  bite: () => { tone(140, { wave: 'sawtooth', dur: 0.2, vol: 0.25, slide: 0.4, cutoff: 900 }); },
  shard: () => { tone(880, { dur: 0.2, vol: 0.15 }); tone(1320, { dur: 0.3, vol: 0.1, delay: 0.06 }); },
  lamp: (to, up) => tone(392 * Math.pow(2, (to * 2) / 12), { wave: 'sine', dur: 0.5, vol: up ? 0.25 : 0.12, slide: up ? 1 : 0.8 }),
  open: () => [0, 4, 7, 12].forEach((s, i) => tone(392 * Math.pow(2, s / 12), { dur: 0.9, vol: 0.18, delay: i * 0.09 })),
  descend: () => tone(220, { wave: 'sine', dur: 1.4, vol: 0.3, slide: 0.25 }),
  death: () => { tone(110, { wave: 'sawtooth', dur: 1.6, vol: 0.25, slide: 0.3, cutoff: 600 }); },
  win: () => [0, 4, 7, 11, 14, 19].forEach((s, i) => tone(261.6 * Math.pow(2, s / 12), { dur: 1.6, vol: 0.15, delay: i * 0.15 })),
};
