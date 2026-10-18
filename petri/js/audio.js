// シャーレ — soft wet sounds from WebAudio.
let ac = null;
let master = null;
let lastGrow = 0;

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.35;
    master.connect(ac.destination);
  } catch { ac = null; }
}

function tone(freq, { wave = 'sine', dur = 0.2, vol = 0.3, delay = 0, slide = 0, cutoff = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
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

export const sfx = {
  select: () => tone(660, { dur: 0.06, vol: 0.08 }),
  drop: () => { tone(420, { dur: 0.25, vol: 0.3, slide: 0.35 }); tone(900, { dur: 0.08, vol: 0.06, delay: 0.04 }); },
  grow: n => {
    if (!ac || ac.currentTime - lastGrow < 0.05) return;
    lastGrow = ac.currentTime;
    const k = Math.min(6, Math.ceil(n / 4));
    for (let i = 0; i < k; i++) tone(700 + Math.random() * 900, { dur: 0.04, vol: 0.05, delay: Math.random() * 0.12 });
  },
  eat: () => tone(160, { wave: 'square', dur: 0.06, vol: 0.05, cutoff: 700 }),
  invade: () => tone(70, { wave: 'sawtooth', dur: 0.9, vol: 0.18, slide: 0.8, cutoff: 300 }),
  day: () => tone(523, { dur: 0.5, vol: 0.12 }),
  pass: () => [0, 4, 7].forEach((s, i) => tone(523 * Math.pow(2, s / 12), { dur: 0.6, vol: 0.15, delay: i * 0.1 })),
  fail: () => [7, 3, 0].forEach((s, i) => tone(330 * Math.pow(2, s / 12), { wave: 'triangle', dur: 0.7, vol: 0.18, delay: i * 0.18 })),
  win: () => [0, 4, 7, 11, 14].forEach((s, i) => tone(392 * Math.pow(2, s / 12), { dur: 1.4, vol: 0.14, delay: i * 0.14 })),
};
