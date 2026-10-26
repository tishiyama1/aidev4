// シャーレ — pure simulation (no DOM). Shared by the browser game and the headless tools.

export const R = 6; // hex radius → 127 cells
export const DAYS = 7;
export const DROPS = 3;
export const GENS = 8;
export const TARGET = [0.4, 0.42, 0.43, 0.43, 0.42, 0.42, 0.42];
export const TRAITS = ['grow', 'prey', 'toxic', 'spore', 'symbio', 'dormant', 'photo', 'shell'];
const COUNTER = { grow: 'prey', prey: 'shell', toxic: 'dormant', spore: 'toxic', symbio: 'prey', dormant: 'prey', photo: 'spore', shell: 'toxic' };
export const PALETTE_SIZE = 8; // see palette.js

// ---------- rng ----------
export function rand(o) {
  let t = (o.rng = (o.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (o, n) => Math.floor(rand(o) * n);
export const pick = (o, a) => a[randInt(o, a.length)];
export function shuffle(o, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(o, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function hashSeed(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------- hex geometry (axial q,r) ----------
export const CELLS = [];
for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (Math.abs(q + r) <= R) CELLS.push({ q, r });
export const N = CELLS.length;
const index = new Map(CELLS.map((c, i) => [`${c.q},${c.r}`, i]));
export const idx = (q, r) => index.get(`${q},${r}`) ?? -1;
export const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
const DIR6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const NEIGH = CELLS.map(c => DIR6.map(([dq, dr]) => idx(c.q + dq, c.r + dr)).filter(i => i >= 0));
const RING = CELLS.map(c => {
  const out = [];
  CELLS.forEach((d, i) => { const k = hexDist(c, d); if (k >= 2 && k <= 3) out.push(i); });
  return out;
});
export const RIM = CELLS.map((c, i) => i).filter(i => hexDist(CELLS[i], { q: 0, r: 0 }) === R);
// pixel position on a unit hex grid (pointy top)
export const pos = c => [Math.sqrt(3) * (c.q + c.r / 2), 1.5 * c.r];

// ---------- strains ----------
// `pal` indexes the pigment palette (rendering only); the invader uses -1.
export function makeStrain(id, owner, traits, pal) {
  return { id, owner, traits: [...new Set(traits)], pal };
}
export const has = (st, t) => st.traits.includes(t);

export function newRun(seed) {
  const g = { rng: seed };
  const pool = shuffle(g, ['grow', 'prey', 'photo', 'spore', 'symbio', 'shell']);
  const library = [
    makeStrain(0, 'p', ['grow'], 0),
    makeStrain(1, 'p', [pool[0] === 'grow' ? pool[1] : pool[0]], 1),
    makeStrain(2, 'p', [pool[2], pool[3]], 2),
  ];
  return { seed, rng: g.rng, day: 0, library, nextPal: 3, history: [] };
}

// ---------- environment ----------
function makeEnv(g, day) {
  const light = new Uint8Array(N), nutrient = new Uint8Array(N), anti = new Uint8Array(N), bubble = new Uint8Array(N);
  // light: one bright side fading across the dish
  const a = rand(g) * Math.PI * 2;
  const [lx, ly] = [Math.cos(a), Math.sin(a)];
  CELLS.forEach((c, i) => {
    const [x, y] = pos(c);
    const d = (x * lx + y * ly) / (R * 1.6);
    light[i] = d > 0.25 ? 2 : d > -0.3 ? 1 : 0;
  });
  // nutrient patches
  for (let k = 0; k < 2 + randInt(g, 2); k++) {
    const c = CELLS[randInt(g, N)];
    CELLS.forEach((d, i) => { if (hexDist(c, d) <= 1 + randInt(g, 2)) nutrient[i] = 1; });
  }
  // an antibiotic streak from day 2
  if (day >= 1 && rand(g) < 0.75) {
    let c = CELLS[pick(g, RIM)];
    const dir = DIR6[randInt(g, 6)];
    for (let k = 0; k < 2 * R + 1; k++) {
      const i = idx(c.q, c.r);
      if (i < 0) break;
      anti[i] = 1;
      c = { q: c.q + dir[0], r: c.r + dir[1] };
      if (rand(g) < 0.3) c = { q: c.q + (rand(g) < 0.5 ? 1 : 0), r: c.r };
    }
  }
  // air bubbles block cells
  for (let k = 0; k < randInt(g, 4); k++) {
    const c = CELLS[randInt(g, N)];
    if (hexDist(c, { q: 0, r: 0 }) < 2) continue;
    bubble[idx(c.q, c.r)] = 1;
    if (rand(g) < 0.5) { const n = pick(g, NEIGH[idx(c.q, c.r)]); bubble[n] = 1; }
  }
  for (let i = 0; i < N; i++) if (bubble[i]) { nutrient[i] = 0; anti[i] = 0; }
  return { light, nutrient, anti, bubble };
}

function makeInvader(g, run, day) {
  let traits;
  if (day === DAYS - 1) {
    // the last invader answers whatever the library leans on
    const tally = {};
    for (const st of run.library) for (const t of st.traits) tally[t] = (tally[t] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => COUNTER[t]);
    traits = [...new Set([...top, 'grow'])];
  } else {
    const n = day < 2 ? 1 : day < 5 ? 2 : 3;
    traits = shuffle(g, TRAITS.filter(t => t !== 'symbio')).slice(0, n);
  }
  return makeStrain(100 + day, 'x', traits, -1);
}

export function startDay(run) {
  const g = { rng: hashSeed(`${run.seed}:day${run.day}`) };
  const env = makeEnv(g, run.day);
  const invader = makeInvader(g, run, run.day);
  const free = RIM.filter(i => !env.bubble[i]);
  const entry = pick(g, free);
  const entries = [entry];
  if (run.day >= 3) {
    const far = free.filter(i => hexDist(CELLS[i], CELLS[entry]) >= R);
    if (far.length) entries.push(pick(g, far));
  }
  const day = {
    day: run.day, env, invader, entries,
    strains: new Map([...run.library.map(st => [st.id, st]), [invader.id, invader]]),
    cells: new Int16Array(N).fill(-1),
    toxin: new Uint8Array(N),
    drop: 0, gen: 0, rng: g.rng,
    hand: [],
  };
  dealHand(day, run);
  return day;
}

export function dealHand(day, run) {
  const g = day;
  const lib = run.library;
  day.hand = lib.length <= 3 ? shuffle(g, lib.map(s => s.id)) : shuffle(g, lib.map(s => s.id)).slice(0, 3);
}

export function clone(day) {
  return { ...day, cells: day.cells.slice(), toxin: day.toxin.slice() };
}

// ---------- the core rule set ----------
export const TUNE = { spread: 0.07, grow: 0.15, death: 0.06, inv: 0.16, invDay: 0.015 };

function spreadChance(day, st, i) {
  const { env } = day;
  let p = TUNE.spread;
  if (has(st, 'grow')) p += TUNE.grow;
  if (has(st, 'photo')) p *= [0.4, 1.3, 3.2][env.light[i]];
  if (has(st, 'dormant')) p *= 0.6;
  if (env.nutrient[i]) p *= 1.5;
  if (st.owner === 'x') p += TUNE.inv + TUNE.invDay * day.day;
  if (has(st, 'symbio')) {
    for (const n of NEIGH[i]) {
      const o = day.cells[n];
      if (o >= 0 && o !== st.id && day.strains.get(o).owner === st.owner) { p += 0.2; break; }
    }
  }
  return Math.min(0.95, p);
}

function deathChance(day, st, i) {
  const { env } = day;
  let p = TUNE.death;
  if (env.nutrient[i]) p *= 0.4;
  if (has(st, 'symbio')) {
    for (const n of NEIGH[i]) {
      const o = day.cells[n];
      if (o >= 0 && o !== st.id && day.strains.get(o).owner === st.owner) { p *= 0.3; break; }
    }
  }
  if (!has(st, 'dormant')) {
    if (day.toxin[i]) p += 0.45;
    if (env.anti[i]) p += 0.5;
  }
  return p;
}

const open = (day, i) => i >= 0 && day.cells[i] < 0 && !day.env.bubble[i] && !day.toxin[i];

function kill(day, i, out) {
  const st = day.strains.get(day.cells[i]);
  day.cells[i] = -1;
  if (out) out.deaths.push(i);
  if (has(st, 'toxic')) {
    day.toxin[i] = 3;
    for (const n of NEIGH[i]) if (!day.env.bubble[n]) day.toxin[n] = Math.max(day.toxin[n], 3);
  }
}

// One generation. `out` (optional) collects births/deaths/kills for animation.
export function generation(day, out) {
  const order = [];
  for (let i = 0; i < N; i++) if (day.cells[i] >= 0) order.push(i);
  shuffle(day, order);
  for (const i of order) {
    const id = day.cells[i];
    if (id < 0) continue;
    const st = day.strains.get(id);
    if (rand(day) < deathChance(day, st, i)) { kill(day, i, out); continue; }
    if (has(st, 'prey')) {
      const foes = NEIGH[i].filter(n => day.cells[n] >= 0 && day.cells[n] !== id);
      if (foes.length) {
        const n = pick(day, foes);
        const foe = day.strains.get(day.cells[n]);
        if (rand(day) < (has(foe, 'shell') ? 0.07 : 0.3)) {
          day.cells[n] = id;
          if (out) out.eats.push([i, n]);
        }
      }
    }
    if (rand(day) < spreadChance(day, st, i)) {
      let target = -1;
      if (has(st, 'spore') && rand(day) < 0.4) {
        const far = RING[i].filter(n => open(day, n));
        if (far.length) target = pick(day, far);
      }
      if (target < 0) {
        const near = NEIGH[i].filter(n => open(day, n));
        if (near.length) target = pick(day, near);
      }
      if (target >= 0) {
        day.cells[target] = id;
        if (out) out.births.push([i, target]);
      }
    }
  }
  for (let i = 0; i < N; i++) if (day.toxin[i]) day.toxin[i]--;
  day.gen++;
}

// Drop a strain: the clicked cell and its open neighbours.
export function placeDrop(day, strainId, i) {
  if (day.env.bubble[i]) return false;
  day.cells[i] = strainId;
  day.toxin[i] = 0;
  for (const n of NEIGH[i]) if (open(day, n)) day.cells[n] = strainId;
  return true;
}

// Invader arrives at its entry points (more each drop).
export function inject(day) {
  const placed = [];
  for (const e of day.entries) {
    const ring = [e, ...NEIGH[e]].filter(i => !day.env.bubble[i]);
    const n = day.drop === 0 ? 5 : 3;
    for (const i of shuffle(day, ring).slice(0, n)) {
      day.cells[i] = day.invader.id;
      day.toxin[i] = 0;
      placed.push(i);
    }
  }
  return placed;
}

export function habitable(day) {
  let n = 0;
  for (let i = 0; i < N; i++) if (!day.env.bubble[i]) n++;
  return n;
}

export function shares(day) {
  let p = 0, x = 0;
  for (let i = 0; i < N; i++) {
    const id = day.cells[i];
    if (id < 0) continue;
    if (day.strains.get(id).owner === 'p') p++; else x++;
  }
  const h = habitable(day);
  return { mine: p / h, theirs: x / h, mineCount: p, theirCount: x };
}

// Full drop: place, invader arrives, simulate. Returns per-generation frames when `record` is set.
export function playDrop(day, strainId, i, record = false) {
  const frames = [];
  placeDrop(day, strainId, i);
  const arrived = inject(day);
  if (record) frames.push({ cells: day.cells.slice(), toxin: day.toxin.slice(), arrived, births: [], deaths: [], eats: [] });
  for (let k = 0; k < GENS; k++) {
    const out = record ? { births: [], deaths: [], eats: [] } : null;
    generation(day, out);
    if (record) frames.push({ cells: day.cells.slice(), toxin: day.toxin.slice(), ...out });
  }
  day.drop++;
  return frames;
}

export const dayOver = day => day.drop >= DROPS;
export const dayPassed = day => shares(day).mine >= TARGET[day.day];

// ---------- rewards between days ----------
export function offerRewards(run) {
  const g = { rng: hashSeed(`${run.seed}:reward${run.day}`) };
  const offers = [];
  const used = new Set();
  for (let tries = 0; offers.length < 3 && tries < 100; tries++) {
    if (run.library.length < 6 && (rand(g) < 0.45 || run.library.length < 4)) {
      const n = 1 + (rand(g) < 0.45 ? 1 : 0);
      const traits = shuffle(g, [...TRAITS]).slice(0, n);
      const key = `new:${traits.sort().join('+')}`;
      if (used.has(key)) continue;
      used.add(key);
      offers.push({ type: 'new', traits });
    } else {
      const st = pick(g, run.library);
      const t = pick(g, TRAITS.filter(x => !has(st, x)));
      if (!t || st.traits.length >= 3) continue;
      const key = `graft:${st.id}:${t}`;
      if (used.has(key)) continue;
      used.add(key);
      offers.push({ type: 'graft', strain: st.id, trait: t });
    }
  }
  return offers;
}

export function applyReward(run, offer) {
  if (offer.type === 'new') {
    const id = run.library.reduce((m, s) => Math.max(m, s.id), -1) + 1;
    run.library.push(makeStrain(id, 'p', offer.traits, run.nextPal++ % PALETTE_SIZE));
  } else {
    const st = run.library.find(s => s.id === offer.strain);
    st.traits = [...new Set([...st.traits, offer.trait])];
  }
}
