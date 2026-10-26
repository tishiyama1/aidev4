// シャーレ — persistence. Everything lives under one key; when storage is unavailable
// (private mode, blocked) the game keeps working from memory for the session.

const KEY = 'petri.v2';
const MAX_SPECIMENS = 30;

const DEFAULTS = () => ({
  settings: { volume: 0.8, music: true, sfx: true, reduceMotion: false, speed: 1 },
  stats: { runs: 0, wins: 0, bestDay: 0, daysCleared: 0 },
  flags: { tutorialDone: false },
  specimens: [],
  save: null,
});

let data = DEFAULTS();
let persistent = true;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    const base = DEFAULTS();
    data = {
      ...base, ...d,
      settings: { ...base.settings, ...(d.settings || {}) },
      stats: { ...base.stats, ...(d.stats || {}) },
      flags: { ...base.flags, ...(d.flags || {}) },
      specimens: Array.isArray(d.specimens) ? d.specimens : [],
    };
  } catch {
    persistent = false;
  }
}

function write() {
  if (!persistent) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // quota: drop the oldest specimen images first, then give up quietly
    if (data.specimens.length > 5) {
      data.specimens = data.specimens.slice(0, data.specimens.length - 5);
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { persistent = false; }
    } else persistent = false;
  }
}

read();

export const store = {
  get settings() { return data.settings; },
  get stats() { return data.stats; },
  get flags() { return data.flags; },
  get specimens() { return data.specimens; },
  get save() { return data.save; },
  get persistent() { return persistent; },
  setSetting(k, v) { data.settings[k] = v; write(); },
  setFlag(k, v) { data.flags[k] = v; write(); },
  updateStats(fn) { fn(data.stats); write(); },
  addSpecimen(sp) { data.specimens.unshift(sp); data.specimens = data.specimens.slice(0, MAX_SPECIMENS); write(); },
  setSave(s) { data.save = s; write(); },
  clearSave() { data.save = null; write(); },
  resetAll() { data = DEFAULTS(); write(); },
};

// ---- run (de)serialisation ----
export function packRun(run) {
  return { seed: run.seed, day: run.day, library: run.library.map(s => ({ ...s, traits: [...s.traits] })), nextPal: run.nextPal, history: [...run.history] };
}
export function packDay(day) {
  return { cells: Array.from(day.cells), toxin: Array.from(day.toxin), rng: day.rng, drop: day.drop, gen: day.gen, hand: [...day.hand] };
}
