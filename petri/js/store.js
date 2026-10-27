// シャーレ — persistence.
// One JSON document under one key. Two places hold it when running in an iOS shell:
//   * Capacitor Preferences (durable), and
//   * localStorage (fast, synchronous; iOS may purge it under storage pressure).
// On boot the newer copy wins, so losing either one never loses progress. In a plain browser only
// localStorage exists. When neither works (private mode, blocked) the game keeps going from memory.
import { prefs } from './native.js';

const KEY = 'petri.v2';
const MAX_SPECIMENS = 30;

const DEFAULTS = () => ({
  settings: { volume: 0.8, music: true, sfx: true, haptics: true, reduceMotion: false, speed: 1, quality: 'auto' },
  stats: { runs: 0, wins: 0, bestDay: 0, daysCleared: 0 },
  flags: { tutorialDone: false },
  specimens: [],
  save: null,
  savedAt: 0,
});

let data = DEFAULTS();
let localOK = true;
let nativeOK = false;
let volatile = false; // benchmarks and demos run without touching the player's saved data

function parse(raw) {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    const base = DEFAULTS();
    return {
      ...base, ...d,
      settings: { ...base.settings, ...(d.settings || {}) },
      stats: { ...base.stats, ...(d.stats || {}) },
      flags: { ...base.flags, ...(d.flags || {}) },
      specimens: Array.isArray(d.specimens) ? d.specimens : [],
    };
  } catch {
    return null;
  }
}

function readLocal() {
  try { return localStorage.getItem(KEY); } catch { localOK = false; return null; }
}

function writeLocal(json) {
  try { localStorage.setItem(KEY, json); return true; } catch { return false; }
}

function write() {
  if (volatile) return;
  data.savedAt = Date.now();
  let json = JSON.stringify(data);
  let ok = writeLocal(json);
  if (!ok && data.specimens.length > 5) {
    // quota: drop the oldest specimen images first
    data.specimens = data.specimens.slice(0, data.specimens.length - 5);
    json = JSON.stringify(data);
    ok = writeLocal(json);
  }
  localOK = ok;
  if (nativeOK) prefs.set(KEY, json); // fire and forget; the in-memory copy is authoritative during play
}

// Resolves once the saved state has been loaded. Boot waits on this before showing anything.
const ready = (async () => {
  const local = parse(readLocal());
  let native = null;
  if (prefs.available()) {
    native = parse(await prefs.get(KEY));
    nativeOK = true;
  }
  const pick = [local, native].filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
  if (pick) data = pick;
  // heal the older copy so both agree from now on
  if (pick && ((local?.savedAt || 0) !== pick.savedAt || (nativeOK && (native?.savedAt || 0) !== pick.savedAt))) {
    const json = JSON.stringify(pick);
    writeLocal(json);
    if (nativeOK) prefs.set(KEY, json);
  }
})();

export const store = {
  ready,
  get settings() { return data.settings; },
  get stats() { return data.stats; },
  get flags() { return data.flags; },
  get specimens() { return data.specimens; },
  get save() { return data.save; },
  get persistent() { return localOK || nativeOK; },
  get durable() { return nativeOK; },
  setSetting(k, v) { data.settings[k] = v; write(); },
  setFlag(k, v) { data.flags[k] = v; write(); },
  updateStats(fn) { fn(data.stats); write(); },
  addSpecimen(sp) { data.specimens.unshift(sp); data.specimens = data.specimens.slice(0, MAX_SPECIMENS); write(); },
  setSave(s) { data.save = s; write(); },
  clearSave() { data.save = null; write(); },
  resetAll() { data = DEFAULTS(); write(); },
  setVolatile(v) { volatile = !!v; },
};

// ---- run (de)serialisation ----
export function packRun(run) {
  return { seed: run.seed, day: run.day, library: run.library.map(s => ({ ...s, traits: [...s.traits] })), nextPal: run.nextPal, history: [...run.history] };
}
export function packDay(day) {
  return { cells: Array.from(day.cells), toxin: Array.from(day.toxin), rng: day.rng, drop: day.drop, gen: day.gen, hand: [...day.hand] };
}
