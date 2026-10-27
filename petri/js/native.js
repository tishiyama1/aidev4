// シャーレ — the thin seam between the game and an iOS shell (Capacitor).
// Everything here feature-detects: in a plain browser the game behaves exactly as before.
//
// Plugins the iOS project needs (only these three, all first-party):
//   @capacitor/preferences  — durable key/value storage (WKWebView localStorage can be purged by iOS)
//   @capacitor/haptics      — Taptic Engine feedback
//   @capacitor/app          — foreground/background events (optional; visibilitychange is the fallback)
// They are reached through window.Capacitor.Plugins, so the static files need no bundler.

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);
const plug = name => {
  try { return cap()?.Plugins?.[name]; } catch { return undefined; }
};

export const isNative = () => !!cap()?.isNativePlatform?.();

// ---------- durable storage ----------
export const prefs = {
  available: () => !!plug('Preferences'),
  async get(key) {
    try { return (await plug('Preferences').get({ key })).value ?? null; } catch { return null; }
  },
  async set(key, value) {
    try { await plug('Preferences').set({ key, value }); return true; } catch { return false; }
  },
  async remove(key) {
    try { await plug('Preferences').remove({ key }); } catch { /* nothing to do */ }
  },
};

// ---------- haptics ----------
// A deliberate vocabulary: a few meaningful pulses, never a constant buzz.
//   tick    — a light "click" for choices and for moving the aim over a new cell
//   thud    — the drop landing
//   alarm   — the invader arriving
//   chew    — predation (the caller throttles it)
//   win/lose— the verdict
let enabled = true;
let lastTick = 0;
let lastChew = 0;

const H = () => plug('Haptics');
const IMPACT = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
const VIBRATE = { light: 8, medium: 18, heavy: 36 }; // ms, for browsers that support navigator.vibrate

function impact(kind) {
  if (!enabled) return;
  const h = H();
  if (h) { h.impact({ style: IMPACT[kind] }).catch?.(() => {}); return; }
  try { navigator.vibrate?.(VIBRATE[kind]); } catch { /* unsupported */ }
}

function notify(type, pattern) {
  if (!enabled) return;
  const h = H();
  if (h) { h.notification({ type }).catch?.(() => {}); return; }
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export const haptics = {
  setEnabled(v) { enabled = !!v; },
  get enabled() { return enabled; },
  tick() {
    const now = performance.now();
    if (now - lastTick < 45) return; // dragging across many cells must not machine-gun
    lastTick = now;
    impact('light');
  },
  select() { impact('light'); },
  thud() { impact('medium'); },
  alarm() { notify('WARNING', [18, 40, 28]); },
  chew() {
    const now = performance.now();
    if (now - lastChew < 420) return;
    lastChew = now;
    impact('light');
  },
  win() { notify('SUCCESS', [14, 50, 14, 50, 30]); },
  lose() { notify('ERROR', [40, 60, 40, 60, 80]); },
};

// ---------- app lifecycle ----------
// Calls back with `true` when the app returns to the foreground, `false` when it leaves.
export function onAppActive(cb) {
  const app = plug('App');
  if (app?.addListener) {
    try { app.addListener('appStateChange', ({ isActive }) => cb(!!isActive)); } catch { /* ignore */ }
  }
}
