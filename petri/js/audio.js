// シャーレ — generative sound. No audio files: a slow pad and sparse glass bells for the lab at night,
// a low drone that swells with the invader, and short, wet sound effects for what happens in the dish.

let ac = null;
let master, musicBus, musicWet, sfxBus, verb, padFilter, tensionGain, meter, meterBuf;
// Gain staging: everything is mixed quietly, then lifted by MAKEUP and caught by a limiter, so the
// loudest moments reach a sensible level on a phone speaker without ever clipping.
const MAKEUP = 1.75;
// The music sits well under the effects, so what happens in the dish is always the loudest thing.
const MUSIC_LEVEL = 0.36;
let bellTimer = 0;
const state = { volume: 0.8, music: true, sfx: true, tension: 0 };

const now = () => ac.currentTime;

function impulse(seconds = 2.6) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function build() {
  master = ac.createGain();
  master.gain.value = state.volume * MAKEUP;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ac.destination);
  // a side branch for measuring what actually leaves the app (loudness checks, tools/petri-audio.mjs)
  meter = ac.createAnalyser();
  meter.fftSize = 2048;
  meterBuf = new Float32Array(meter.fftSize);
  limiter.connect(meter);
  verb = ac.createConvolver();
  verb.buffer = impulse();
  const verbGain = ac.createGain();
  verbGain.gain.value = 0.55;
  verb.connect(verbGain).connect(master);
  musicBus = ac.createGain();
  musicBus.gain.value = state.music ? MUSIC_LEVEL : 0;
  musicBus.connect(master);
  // the music's own reverb send: it must be silenced with the music, not bypass the mute
  musicWet = ac.createGain();
  musicWet.gain.value = state.music ? MUSIC_LEVEL : 0;
  musicWet.connect(verb);
  sfxBus = ac.createGain();
  sfxBus.gain.value = state.sfx ? 1 : 0;
  sfxBus.connect(master);

  // pad: D A E F# — open, unresolved, calm
  padFilter = ac.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 700;
  padFilter.Q.value = 0.6;
  const padGain = ac.createGain();
  padGain.gain.value = 0.0;
  padGain.gain.linearRampToValueAtTime(0.05, now() + 6);
  padFilter.connect(padGain);
  padGain.connect(musicBus);
  const send = ac.createGain();
  send.gain.value = 0.6;
  padGain.connect(send).connect(musicWet);
  [146.83, 220, 329.63, 369.99].forEach((f, k) => {
    for (const [type, det] of [['sine', 0], ['triangle', 6 + k]]) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      const g = ac.createGain();
      g.gain.value = type === 'sine' ? 0.5 : 0.18;
      // each voice breathes at its own slow rate
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.03 + k * 0.017;
      const lg = ac.createGain();
      lg.gain.value = 0.22;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(padFilter);
      o.start(); lfo.start();
    }
  });
  const flfo = ac.createOscillator();
  flfo.frequency.value = 0.045;
  const flg = ac.createGain();
  flg.gain.value = 260;
  flfo.connect(flg).connect(padFilter.frequency);
  flfo.start();

  // tension drone, silent until the invader spreads
  tensionGain = ac.createGain();
  tensionGain.gain.value = 0;
  const tf = ac.createBiquadFilter();
  tf.type = 'lowpass';
  tf.frequency.value = 150;
  tf.connect(tensionGain).connect(musicBus);
  for (const f of [55, 82.4, 55.6]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(tf);
    o.start();
  }
  scheduleBell();
}

const BELLS = [587.33, 659.25, 739.99, 880, 987.77, 1174.66];
function scheduleBell() {
  clearTimeout(bellTimer);
  bellTimer = setTimeout(() => {
    if (ac && ac.state === 'running' && state.music) bell(BELLS[Math.floor(Math.random() * BELLS.length)], 0.05, musicBus);
    scheduleBell();
  }, 2600 + Math.random() * 5200);
}

function bell(f, vol, bus = sfxBus, delay = 0, dur = 3.2) {
  const t = now() + delay;
  for (const [mult, v] of [[1, 1], [2.76, 0.28], [5.4, 0.08]]) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = f * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mult);
    o.connect(g);
    g.connect(bus);
    const s = ac.createGain();
    s.gain.value = 0.7;
    g.connect(s).connect(bus === musicBus ? musicWet : verb);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

function tone(f, { type = 'sine', dur = 0.2, vol = 0.2, delay = 0, to = 0, cutoff = 0, wet = 0.2 } = {}) {
  const t = now() + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let n = o;
  if (cutoff) {
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = cutoff;
    o.connect(fl);
    n = fl;
  }
  n.connect(g);
  g.connect(sfxBus);
  if (wet) { const s = ac.createGain(); s.gain.value = wet; g.connect(s).connect(verb); }
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hiss({ dur = 0.15, vol = 0.1, freq = 1200, q = 1, type = 'bandpass', delay = 0, wet = 0.2 } = {}) {
  const t = now() + delay;
  const s = noise();
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxBus);
  if (wet) { const w = ac.createGain(); w.gain.value = wet; g.connect(w).connect(verb); }
  s.start(t);
  s.stop(t + dur + 0.05);
}

export function unlock() {
  if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    build();
  } catch {
    ac = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (!ac) return;
  if (document.hidden) ac.suspend(); else ac.resume();
});

// Peak and RMS of the last ~46 ms of output, 0..1 (post master volume).
export function level() {
  if (!meter) return { peak: 0, rms: 0 };
  meter.getFloatTimeDomainData(meterBuf);
  let peak = 0, sum = 0;
  for (let i = 0; i < meterBuf.length; i++) { const v = Math.abs(meterBuf[i]); if (v > peak) peak = v; sum += v * v; }
  return { peak, rms: Math.sqrt(sum / meterBuf.length) };
}

export function configure({ volume, music, sfx }) {
  if (volume !== undefined) state.volume = volume;
  if (music !== undefined) state.music = music;
  if (sfx !== undefined) state.sfx = sfx;
  if (!ac) return;
  master.gain.setTargetAtTime(state.volume * MAKEUP, now(), 0.05);
  musicBus.gain.setTargetAtTime(state.music ? MUSIC_LEVEL : 0, now(), 0.3);
  musicWet.gain.setTargetAtTime(state.music ? MUSIC_LEVEL : 0, now(), 0.3);
  sfxBus.gain.setTargetAtTime(state.sfx ? 1 : 0, now(), 0.05);
}

// 0..1: how much of the dish the invader holds
export function setTension(x) {
  if (!ac) return;
  state.tension = x;
  tensionGain.gain.setTargetAtTime(Math.min(0.09, x * 0.16), now(), 0.8);
}

export function setMood(m) {
  if (!ac) return;
  const f = m === 'bright' ? 1500 : m === 'dark' ? 320 : 700;
  padFilter.frequency.setTargetAtTime(f, now(), 1.2);
}

let lastGrow = 0;
const ok = () => ac && ac.state === 'running';
export const sfx = {
  ui: () => ok() && tone(880, { dur: 0.05, vol: 0.06, wet: 0.05 }),
  select: () => ok() && (tone(1760, { dur: 0.07, vol: 0.05 }), tone(2640, { dur: 0.09, vol: 0.03, delay: 0.015 })),
  aim: () => ok() && hiss({ dur: 0.12, vol: 0.02, freq: 3000, q: 0.7, wet: 0 }),
  drop: () => {
    if (!ok()) return;
    tone(950, { dur: 0.16, vol: 0.22, to: 260, wet: 0.35 });
    hiss({ dur: 0.22, vol: 0.06, freq: 900, q: 0.8, delay: 0.05 });
    tone(140, { dur: 0.25, vol: 0.12, to: 90, delay: 0.04, wet: 0 });
  },
  grow: n => {
    if (!ok() || now() - lastGrow < 0.06) return;
    lastGrow = now();
    const k = Math.min(5, Math.ceil(n / 3));
    for (let i = 0; i < k; i++) tone(500 + Math.random() * 900, { dur: 0.035, vol: 0.035, delay: Math.random() * 0.1, to: 300 + Math.random() * 200, wet: 0.15 });
  },
  eat: () => ok() && hiss({ dur: 0.1, vol: 0.09, freq: 520, q: 2, type: 'lowpass', wet: 0 }),
  invade: () => {
    if (!ok()) return;
    tone(72, { type: 'sawtooth', dur: 1.8, vol: 0.13, to: 52, cutoff: 260, wet: 0.4 });
    hiss({ dur: 1.2, vol: 0.05, freq: 300, q: 0.5, type: 'lowpass', wet: 0.4 });
  },
  tick: () => ok() && tone(2900, { dur: 0.02, vol: 0.022, wet: 0 }),
  plate: () => {
    if (!ok()) return;
    hiss({ dur: 0.35, vol: 0.05, freq: 2400, q: 0.6, wet: 0.3 });
    tone(190, { dur: 0.3, vol: 0.06, wet: 0.1 });
    bell(1174.66, 0.035, sfxBus, 0.12, 2);
  },
  pass: () => {
    if (!ok()) return;
    [587.33, 739.99, 880, 1108.73].forEach((f, i) => bell(f, 0.09, sfxBus, i * 0.11, 3.4));
  },
  fail: () => {
    if (!ok()) return;
    [440, 392, 311.13].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.9, vol: 0.12, delay: i * 0.22, to: f * 0.97, wet: 0.4 }));
    tone(70, { dur: 1.2, vol: 0.18, to: 45, delay: 0.1, wet: 0.2 });
  },
  reward: () => ok() && (tone(2400, { dur: 0.25, vol: 0.06 }), tone(3600, { dur: 0.3, vol: 0.04, delay: 0.05 })),
  win: () => {
    if (!ok()) return;
    [293.66, 440, 587.33, 739.99, 880, 1174.66, 1479.98].forEach((f, i) => bell(f, 0.08, sfxBus, i * 0.16, 4.5));
  },
};
