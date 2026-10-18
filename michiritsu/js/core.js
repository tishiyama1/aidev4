// 未知律 — pure game logic (no DOM). Shared by the browser game and the headless tools.

export const W = 11, H = 11; // 9x9 interior plus a border of rock
export const COLORS = ['red', 'blue', 'yellow'];
export const SHAPES = ['circle', 'triangle', 'square', 'diamond'];
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const ACTIONS = ['up', 'down', 'left', 'right', 'wait'];
export const MAX_DEPTH = 5;
export const START_LIGHT = 80;
export const DESCEND_LIGHT = 30;
export const SHARD_LIGHT = 8;
export const MAX_HP = 3;
const MAX_ENTS = 22;

export const TRIGGER_EFFECTS = {
  touch: ['recolor', 'reshape', 'repel', 'swap', 'split', 'vanish', 'hurt', 'light'],
  adj: ['recolor', 'reshape', 'repel', 'swap', 'split', 'vanish', 'hurt', 'light'],
  meet: ['recolor', 'reshape', 'vanish', 'split', 'merge'],
  period: ['recolor', 'reshape', 'pull', 'repel', 'split', 'vanish', 'hurt'],
};
const TRANSFORMS = ['recolor', 'reshape', 'merge', 'split'];
const MOTIONS = ['repel', 'pull', 'swap'];

// ---------- rng (mulberry32 over an object field so states can be cloned) ----------
export function rand(o) {
  let t = (o.rng = (o.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (o, n) => Math.floor(rand(o) * n);
export const pick = (o, a) => a[randInt(o, a.length)];
export function shuffle(o, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(o, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function hashSeed(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------- laws ----------
export function matches(sel, e) {
  if (!e) return false;
  if (sel.type === 'color') return e.color === sel.value;
  return e.kind === 'obj' && e.shape === sel.value;
}

function randomSel(g) {
  return rand(g) < 0.55 ? { type: 'color', value: pick(g, COLORS) } : { type: 'shape', value: pick(g, SHAPES) };
}

function randomEffect(g, trigger, sel) {
  const type = pick(g, TRIGGER_EFFECTS[trigger]);
  const eff = { type };
  if (type === 'recolor') eff.value = pick(g, COLORS.filter(c => !(sel.type === 'color' && sel.value === c)));
  if (type === 'reshape') eff.value = pick(g, SHAPES.filter(s => !(sel.type === 'shape' && sel.value === s)));
  return eff;
}

function lawsValid(laws) {
  const eff = laws.map(l => l.effect.type);
  const trg = laws.map(l => l.trigger.type);
  const count = (arr, v) => arr.filter(x => x === v).length;
  if (count(eff, 'hurt') !== 1) return false;
  if (eff.filter(e => TRANSFORMS.includes(e)).length < 2) return false;
  if (eff.filter(e => MOTIONS.includes(e)).length < 1) return false;
  for (const e of ['vanish', 'light', 'split', 'swap', 'merge']) if (count(eff, e) > 1) return false;
  if (count(trg, 'touch') < 1 || count(trg, 'adj') < 1) return false;
  if (count(trg, 'period') > 1 || count(trg, 'meet') > 2) return false;
  const keys = new Set(laws.map(l => `${l.trigger.type}:${l.sel.type}:${l.sel.value}`));
  if (keys.size !== laws.length) return false;
  // a periodic split on a common selector floods the board
  if (laws.some(l => l.trigger.type === 'period' && l.effect.type === 'split')) return false;
  return true;
}

function makeGlyph(g, taken) {
  // strokes between neighbouring points of a 3x3 lattice
  for (let tries = 0; tries < 200; tries++) {
    const segs = new Set();
    const n = 3 + randInt(g, 2);
    let p = randInt(g, 9);
    while (segs.size < n) {
      const px = p % 3, py = Math.floor(p / 3);
      const opts = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nx = px + dx, ny = py + dy;
        if ((dx || dy) && nx >= 0 && nx < 3 && ny >= 0 && ny < 3) opts.push(ny * 3 + nx);
      }
      const q = pick(g, opts);
      segs.add(p < q ? `${p}-${q}` : `${q}-${p}`);
      p = rand(g) < 0.3 ? randInt(g, 9) : q;
    }
    const key = [...segs].sort().join('|');
    if (!taken.has(key)) {
      taken.add(key);
      return [...segs].map(s => s.split('-').map(Number));
    }
  }
  return [[0, 8]];
}

export function generateLaws(seed, n = 6) {
  const g = { rng: seed };
  for (let attempt = 0; attempt < 5000; attempt++) {
    const triggers = ['touch', 'adj'];
    while (triggers.length < n) triggers.push(pick(g, ['touch', 'adj', 'meet', 'meet', 'period']));
    const laws = triggers.map(t => {
      const sel = randomSel(g);
      const trigger = { type: t };
      if (t === 'period') trigger.n = 4 + randInt(g, 3);
      return { trigger, sel, effect: randomEffect(g, t, sel) };
    });
    if (!lawsValid(laws)) continue;
    shuffle(g, laws);
    const taken = new Set();
    const notes = shuffle(g, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    laws.forEach((l, i) => {
      l.id = i;
      l.glyph = makeGlyph(g, taken);
      l.note = notes[i];
      l.mutated = false;
    });
    return laws;
  }
  throw new Error('law generation failed');
}

// Change the effect of one law (deep strata). Returns the new law list.
export function mutateLaws(laws, seed) {
  const g = { rng: seed };
  for (let tries = 0; tries < 500; tries++) {
    const idx = randInt(g, laws.length);
    const old = laws[idx];
    const effect = randomEffect(g, old.trigger.type, old.sel);
    if (effect.type === old.effect.type && effect.value === old.effect.value) continue;
    const next = laws.map(l => ({ ...l }));
    next[idx] = { ...old, effect, mutated: true };
    const effs = next.map(l => l.effect.type);
    if (effs.filter(e => e === 'hurt').length > 2) continue;
    if (old.trigger.type === 'period' && effect.type === 'split') continue;
    return next;
  }
  return laws;
}

// ---------- state helpers ----------
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const entAt = (s, x, y) => s.ents.find(e => e.x === x && e.y === y);
const shardAt = (s, x, y) => s.shards.findIndex(p => p.x === x && p.y === y);
const isWall = (s, x, y) => !inBounds(x, y) || s.grid[y * W + x] === 1;
const isSeal = (s, x, y) => s.seal.x === x && s.seal.y === y;

// a cell an object can move into
function freeForObj(s, x, y) {
  return !isWall(s, x, y) && !isSeal(s, x, y) && !entAt(s, x, y) && shardAt(s, x, y) < 0 &&
    !(s.player.x === x && s.player.y === y);
}
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const adjacent = (a, b) => manhattan(a, b) === 1;

export function clone(s) {
  return {
    ...s,
    player: { ...s.player },
    ents: s.ents.map(e => ({ ...e })),
    shards: s.shards.map(p => ({ ...p })),
    goal: { ...s.goal },
  };
}

export function sealLit(s) {
  const g = s.goal;
  if (g.type === 'count') return Math.min(g.k, s.ents.filter(e => matches(g.sel, e)).length);
  if (g.type === 'none') return g.k - Math.min(g.k, s.ents.filter(e => matches(g.sel, e)).length);
  // altar
  return s.altars.filter(a => matches(g.sel, entAt(s, a.x, a.y))).length;
}

// ---------- effects ----------
function look(e) {
  return e ? { kind: e.kind, shape: e.shape, color: e.color } : null;
}

function moveEnt(s, e, dx, dy, steps) {
  let moved = false;
  for (let i = 0; i < steps; i++) {
    if (!freeForObj(s, e.x + dx, e.y + dy)) break;
    e.x += dx; e.y += dy; moved = true;
  }
  return moved;
}

function awayDir(from, e) {
  const dx = e.x - from.x, dy = e.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return [Math.sign(dx), 0];
  return [0, Math.sign(dy) || 1];
}

function spawnCopy(s, e) {
  if (s.ents.length >= MAX_ENTS) return null;
  const opts = shuffle(s, Object.values(DIRS).map(([dx, dy]) => [e.x + dx, e.y + dy]))
    .filter(([x, y]) => freeForObj(s, x, y));
  if (!opts.length) return null;
  const c = { ...e, id: s.nextId++, x: opts[0][0], y: opts[0][1], born: true };
  s.ents.push(c);
  return c;
}

const NEXT_SHAPE = { circle: 'triangle', triangle: 'square', square: 'diamond', diamond: 'circle' };

// Apply a law's effect to entity e. Returns an event or null if nothing happened.
function applyEffect(s, law, e, src) {
  const before = look(e);
  const at = [e.x, e.y];
  const ev = { kind: 'law', law: law.id, src, at, tid: e.id, before, after: null, extra: null };
  const p = s.player;
  switch (law.effect.type) {
    case 'recolor':
      if (e.color === law.effect.value) return null;
      e.color = law.effect.value;
      break;
    case 'reshape':
      if (e.kind === 'obj' && e.shape === law.effect.value) return null;
      e.kind = 'obj';
      e.shape = law.effect.value;
      break;
    case 'repel': {
      const [dx, dy] = awayDir(p, e);
      if (!moveEnt(s, e, dx, dy, 2)) return null;
      ev.extra = 'moved';
      break;
    }
    case 'pull': {
      if (adjacent(p, e)) return null;
      const dx = p.x - e.x, dy = p.y - e.y;
      const steps = Math.abs(dx) >= Math.abs(dy) ? [[Math.sign(dx), 0], [0, Math.sign(dy)]] : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
      if (!steps.some(([sx, sy]) => (sx || sy) && moveEnt(s, e, sx, sy, 1))) return null;
      ev.extra = 'moved';
      break;
    }
    case 'swap': {
      const ex = e.x, ey = e.y;
      e.x = p.x; e.y = p.y; p.x = ex; p.y = ey;
      ev.extra = 'swap';
      break;
    }
    case 'split': {
      const c = spawnCopy(s, e);
      if (!c) return null;
      ev.extra = 'copy';
      ev.copy = [c.x, c.y];
      break;
    }
    case 'vanish':
      s.ents = s.ents.filter(x => x !== e);
      ev.extra = 'gone';
      break;
    case 'hurt':
      p.hp -= 1;
      ev.extra = 'hurt';
      break;
    case 'light':
      p.light += 6;
      s.ents = s.ents.filter(x => x !== e);
      ev.extra = 'light';
      break;
    default:
      return null;
  }
  ev.after = s.ents.includes(e) ? look(e) : null;
  return ev;
}

function applyMeet(s, law, a, b) {
  const t = law.effect.type;
  const evs = [];
  if (t === 'merge') {
    if (a.kind !== 'obj' || b.kind !== 'obj') return evs;
    const before = look(a);
    s.ents = s.ents.filter(x => x !== b);
    a.shape = NEXT_SHAPE[a.shape];
    evs.push({ kind: 'law', law: law.id, src: [b.x, b.y], at: [a.x, a.y], tid: a.id, before, after: look(a), extra: 'merge', gone: b.id });
    return evs;
  }
  if (t === 'split') {
    const ev = applyEffect(s, law, a, [b.x, b.y]);
    if (ev) evs.push(ev);
    return evs;
  }
  for (const [x, y] of [[a, b], [b, a]]) {
    if (!s.ents.includes(x)) continue;
    const ev = applyEffect(s, law, x, [y.x, y.y]);
    if (ev) evs.push(ev);
  }
  return evs;
}

function adjacentIds(s) {
  return new Set(s.ents.filter(e => adjacent(e, s.player)).map(e => e.id));
}
function pairKeys(s) {
  const keys = new Set();
  for (const a of s.ents) for (const b of s.ents) if (a.id < b.id && adjacent(a, b)) keys.add(`${a.id}-${b.id}`);
  return keys;
}

function moveBeasts(s, events) {
  const p = s.player;
  for (const b of s.ents) {
    if (b.kind !== 'beast' || !s.ents.includes(b)) continue;
    let dirs;
    if (b.mode === 'chase') {
      if (s.turn % 2 !== 0) continue;
      const dx = p.x - b.x, dy = p.y - b.y;
      dirs = Math.abs(dx) >= Math.abs(dy)
        ? [[Math.sign(dx), 0], [0, Math.sign(dy)]]
        : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
      dirs = dirs.filter(([x, y]) => x || y);
    } else {
      if (rand(s) < 0.3) continue;
      dirs = [pick(s, Object.values(DIRS))];
    }
    for (const [dx, dy] of dirs) {
      const nx = b.x + dx, ny = b.y + dy;
      if (nx === p.x && ny === p.y) {
        p.hp -= 1;
        events.push({ kind: 'bite', at: [b.x, b.y], to: [nx, ny], tid: b.id });
        break;
      }
      if (freeForObj(s, nx, ny)) {
        b.x = nx; b.y = ny;
        break;
      }
    }
  }
}

// Advance one turn. Returns the list of events, or null if the action was a no-op (no turn spent).
export function step(s, action) {
  if (s.status !== 'play') return null;
  const p = s.player;
  const events = [];
  let touched = null;
  const prevAdj = adjacentIds(s);
  const prevPairs = pairKeys(s);

  if (action !== 'wait') {
    const [dx, dy] = DIRS[action];
    const nx = p.x + dx, ny = p.y + dy;
    if (isSeal(s, nx, ny)) {
      if (!s.sealOpen) return null;
      p.x = nx; p.y = ny;
      s.status = 'descend';
      events.push({ kind: 'descend' });
      return events;
    }
    if (isWall(s, nx, ny)) return null;
    const e = entAt(s, nx, ny);
    if (e) {
      touched = e;
      if (e.kind === 'obj' && freeForObj(s, nx + dx, ny + dy)) {
        e.x += dx; e.y += dy;
        p.x = nx; p.y = ny;
        events.push({ kind: 'push', tid: e.id });
      } else {
        events.push({ kind: 'nudge', tid: e.id, dir: [dx, dy] });
      }
    } else {
      p.x = nx; p.y = ny;
      const si = shardAt(s, nx, ny);
      if (si >= 0) {
        s.shards.splice(si, 1);
        p.light += SHARD_LIGHT;
        events.push({ kind: 'shard', at: [nx, ny] });
      }
    }
  }
  s.turn++;

  const fire = ev => { if (ev) events.push(ev); };
  const P = [p.x, p.y];
  for (const law of s.laws) {
    if (law.trigger.type === 'touch' && touched && s.ents.includes(touched) && matches(law.sel, touched)) {
      fire(applyEffect(s, law, touched, P));
    }
  }
  for (const law of s.laws) {
    if (law.trigger.type !== 'adj') continue;
    for (const e of [...s.ents]) {
      if (!s.ents.includes(e) || prevAdj.has(e.id) || !adjacent(e, p) || !matches(law.sel, e)) continue;
      fire(applyEffect(s, law, e, [p.x, p.y]));
    }
  }

  moveBeasts(s, events);

  for (const law of s.laws) {
    if (law.trigger.type !== 'meet') continue;
    const fired = new Set();
    for (const a of [...s.ents]) for (const b of [...s.ents]) {
      if (a.id >= b.id || fired.has(a.id) || fired.has(b.id)) continue;
      if (!s.ents.includes(a) || !s.ents.includes(b) || !adjacent(a, b)) continue;
      if (prevPairs.has(`${a.id}-${b.id}`) || !matches(law.sel, a) || !matches(law.sel, b)) continue;
      fired.add(a.id); fired.add(b.id);
      for (const ev of applyMeet(s, law, a, b)) events.push(ev);
    }
  }
  for (const law of s.laws) {
    if (law.trigger.type !== 'period' || s.turn % law.trigger.n !== 0) continue;
    if (law.effect.type === 'hurt') {
      const e = s.ents.find(x => adjacent(x, p) && matches(law.sel, x));
      if (e) fire(applyEffect(s, law, e, null));
      continue;
    }
    for (const e of [...s.ents]) if (s.ents.includes(e) && matches(law.sel, e)) fire(applyEffect(s, law, e, null));
  }

  p.light -= 1;
  const lit = sealLit(s);
  if (lit !== s.lit) events.push({ kind: 'lamp', from: s.lit, to: lit });
  s.lit = lit;
  if (!s.sealOpen && lit >= s.goal.k) {
    s.sealOpen = true;
    events.push({ kind: 'open' });
  }
  if (p.hp <= 0) s.status = 'dead';
  else if (p.light <= 0) s.status = 'dark';
  return events;
}

// Warnings for the next turn, used by the renderer: periodic laws about to fire and harmful things nearby.
export function omens(s) {
  const out = new Map(); // ent id -> 'pulse' | 'tremble'
  for (const law of s.laws) {
    if (law.trigger.type === 'period' && (s.turn + 1) % law.trigger.n === 0) {
      for (const e of s.ents) if (matches(law.sel, e)) out.set(e.id, 'pulse');
    }
  }
  for (const law of s.laws) {
    if (law.effect.type !== 'hurt' || law.trigger.type === 'period') continue;
    for (const e of s.ents) if (matches(law.sel, e) && manhattan(e, s.player) <= 2) out.set(e.id, 'tremble');
  }
  return out;
}

// ---------- layer generation ----------
function carveRocks(g, grid, n) {
  for (let i = 0; i < n; i++) {
    let x = 2 + randInt(g, W - 4), y = 2 + randInt(g, H - 4);
    const len = 1 + randInt(g, 3);
    for (let k = 0; k < len; k++) {
      grid[y * W + x] = 1;
      if (rand(g) < 0.5) x += pick(g, [-1, 1]); else y += pick(g, [-1, 1]);
      x = Math.max(2, Math.min(W - 3, x)); y = Math.max(2, Math.min(H - 3, y));
    }
  }
}

function floodCount(grid, sx, sy) {
  const seen = new Uint8Array(W * H);
  const st = [[sx, sy]];
  seen[sy * W + sx] = 1;
  let n = 0;
  while (st.length) {
    const [x, y] = st.pop(); n++;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || grid[ny * W + nx] === 1 || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1; st.push([nx, ny]);
    }
  }
  return n;
}

function randomEntity(g, sel) {
  const e = { kind: 'obj', shape: pick(g, SHAPES), color: pick(g, COLORS) };
  if (sel) e[sel.type === 'color' ? 'color' : 'shape'] = sel.value;
  return e;
}

function buildLayout(run, depth, g) {
  const grid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) grid[y * W + x] = 1;
  carveRocks(g, grid, 2 + randInt(g, 3));
  // seal on one border side, player near the opposite side
  const side = randInt(g, 4);
  const along = 2 + randInt(g, W - 4);
  const sealPos = [[along, 0], [W - 1, along], [along, H - 1], [0, along]][side];
  const inward = [[0, 1], [-1, 0], [0, -1], [1, 0]][side];
  const front = [sealPos[0] + inward[0], sealPos[1] + inward[1]];
  grid[front[1] * W + front[0]] = 0;
  const opp = [[along, H - 2], [1, along], [along, 1], [W - 2, along]][side];
  const px = Math.max(1, Math.min(W - 2, opp[0] + randInt(g, 3) - 1));
  const py = Math.max(1, Math.min(H - 2, opp[1] + randInt(g, 3) - 1));
  grid[py * W + px] = 0;
  const floor = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!grid[y * W + x]) floor.push([x, y]);
  if (floodCount(grid, px, py) !== floor.length) return null;
  return { grid, seal: { x: sealPos[0], y: sealPos[1] }, front, player: [px, py], floor };
}

const overlaps = (a, b) => a.type !== b.type || a.value === b.value;

// Can some law raise / lower the number of things matching sel?
function canProduce(laws, sel) {
  return laws.some(l => {
    const t = l.effect.type;
    if (t === 'recolor') return sel.type === 'color' && l.effect.value === sel.value;
    if (t === 'reshape') return sel.type === 'shape' && l.effect.value === sel.value;
    if (t === 'split') return overlaps(l.sel, sel);
    if (t === 'merge') return sel.type === 'shape';
    return false;
  });
}
function canRemove(laws, sel) {
  return laws.some(l => {
    const t = l.effect.type;
    if (t === 'vanish' || t === 'light' || t === 'merge') return overlaps(l.sel, sel);
    if (t === 'recolor') return sel.type === 'color' && overlaps(l.sel, sel);
    if (t === 'reshape') return sel.type === 'shape' && overlaps(l.sel, sel);
    return false;
  });
}

function makeGoal(g, s, laws) {
  const objs = s.ents;
  const type = pick(g, ['count', 'count', 'none', 'altar', 'altar']);
  const selPool = [];
  for (const c of COLORS) selPool.push({ type: 'color', value: c });
  for (const sh of SHAPES) selPool.push({ type: 'shape', value: sh });
  const sel = pick(g, selPool);
  const n = objs.filter(e => matches(sel, e)).length;
  if (type === 'count') {
    if (!canProduce(laws, sel)) return null;
    const k = Math.min(5, n + 1 + randInt(g, 2));
    if (k <= n || k < 2) return null;
    return { type, sel, k };
  }
  if (type === 'none') {
    if (n < 2 || !canRemove(laws, sel)) return null;
    return { type, sel, k: Math.min(n, 5) };
  }
  const k = 2 + randInt(g, 2);
  if (n + (laws.some(l => l.effect.type === 'recolor' || l.effect.type === 'reshape' || l.effect.type === 'split') ? 2 : 0) < k) return null;
  return { type: 'altar', sel, k };
}

export function makeLayer(run, depth, seed) {
  const g = { rng: seed };
  for (let attempt = 0; attempt < 400; attempt++) {
    const L = buildLayout(run, depth, g);
    if (!L) continue;
    const s = {
      laws: run.laws, depth, grid: L.grid, seal: L.seal,
      player: { x: L.player[0], y: L.player[1], hp: run.hp, light: run.light },
      ents: [], shards: [], altars: [], turn: 0, rng: (seed ^ (attempt * 7919)) >>> 0,
      status: 'play', sealOpen: false, lit: 0, nextId: 1, goal: null,
    };
    const cells = shuffle(g, L.floor.filter(([x, y]) =>
      !(x === L.player[0] && y === L.player[1]) && !(x === L.front[0] && y === L.front[1]) &&
      Math.abs(x - L.player[0]) + Math.abs(y - L.player[1]) > 1));
    const nObj = Math.min(10, 5 + depth + randInt(g, 2));
    // bias the population toward the run's selectors so every law has something to act on
    for (const law of shuffle(g, [...run.laws])) {
      if (s.ents.length >= nObj) break;
      if (rand(g) < 0.75) {
        const [x, y] = cells.pop();
        s.ents.push({ id: s.nextId++, x, y, ...randomEntity(g, law.sel) });
      }
    }
    while (s.ents.length < nObj) {
      const [x, y] = cells.pop();
      s.ents.push({ id: s.nextId++, x, y, ...randomEntity(g) });
    }
    // objects stuck against the border cannot be pushed off it; give some breathing room
    const beasts = depth >= 4 ? 2 : depth >= 2 ? 1 : 0;
    const far = cells.filter(([x, y]) => Math.abs(x - L.player[0]) + Math.abs(y - L.player[1]) >= 5);
    for (let i = 0; i < beasts && far.length; i++) {
      const [x, y] = far.splice(randInt(g, far.length), 1)[0];
      const ci = cells.findIndex(c => c[0] === x && c[1] === y);
      if (ci >= 0) cells.splice(ci, 1);
      s.ents.push({ id: s.nextId++, x, y, kind: 'beast', color: pick(g, COLORS), mode: rand(g) < 0.5 ? 'chase' : 'drift' });
    }
    const nShards = 1 + randInt(g, 2);
    for (let i = 0; i < nShards; i++) { const [x, y] = cells.pop(); s.shards.push({ x, y }); }
    const goal = makeGoal(g, s, run.laws);
    if (!goal) continue;
    s.goal = goal;
    if (goal.type === 'altar') {
      const spots = cells.filter(([x, y]) => x > 1 && y > 1 && x < W - 2 && y < H - 2);
      if (spots.length < goal.k) continue;
      for (let i = 0; i < goal.k; i++) { const [x, y] = spots.pop(); s.altars.push({ x, y }); }
    }
    s.lit = sealLit(s);
    if (s.lit >= goal.k) continue;
    const sol = solve(s, 6000);
    if (!sol || sol.length < 6 || sol.length > 34) continue;
    s.solution = sol;
    s.attempts = attempt + 1;
    return s;
  }
  throw new Error('layer generation failed');
}

export function newRun(seed) {
  const laws = generateLaws(seed);
  return { seed, laws, depth: 1, hp: MAX_HP, light: START_LIGHT };
}

export function startLayer(run) {
  return makeLayer(run, run.depth, hashSeed(`${run.seed}:${run.depth}`));
}

// Carry hp/light down after a seal is entered. Returns false when the run is won.
// From the fourth stratum on, one law has quietly changed.
export function advanceRun(run, s) {
  run.hp = s.player.hp;
  run.light = s.player.light + DESCEND_LIGHT;
  run.depth += 1;
  if (run.depth > MAX_DEPTH) return false;
  if (run.depth === 4) run.laws = mutateLaws(run.laws, hashSeed(`${run.seed}:mutate`));
  return true;
}

export function descend(run, s) {
  return advanceRun(run, s) ? startLayer(run) : null;
}

// ---------- solver (used by the generator to guarantee each layer can be opened) ----------
function stateKey(s) {
  const e = s.ents.map(x => `${x.x},${x.y}${x.kind[0]}${x.shape ? x.shape[0] : ''}${x.color[0]}`).sort().join(';');
  return `${s.player.x},${s.player.y},${s.player.hp},${s.turn % 60},${s.sealOpen ? 1 : 0},${s.shards.length}|${e}`;
}

function heuristic(s) {
  const dist = Math.abs(s.player.x - s.seal.x) + Math.abs(s.player.y - s.seal.y);
  if (s.sealOpen) return dist;
  let h = (s.goal.k - s.lit) * 6 + (MAX_HP - s.player.hp) * 3;
  if (s.goal.type === 'altar') {
    // reward matching objects near empty altars
    for (const a of s.altars) {
      if (matches(s.goal.sel, entAt(s, a.x, a.y))) continue;
      let best = 12;
      for (const e of s.ents) if (matches(s.goal.sel, e)) best = Math.min(best, manhattan(a, e));
      h += best * 0.8;
    }
  }
  return h + 4;
}

class Heap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

export function solve(start, maxNodes = 6000) {
  const open = new Heap();
  const seen = new Set([stateKey(start)]);
  open.push({ s: start, path: '', f: heuristic(start) });
  let nodes = 0;
  while (open.size && nodes < maxNodes) {
    const { s, path } = open.pop();
    for (const a of ACTIONS) {
      const c = clone(s);
      const ev = step(c, a);
      if (!ev) continue;
      nodes++;
      if (c.status === 'descend') return path + a[0];
      if (c.status !== 'play') continue;
      const k = stateKey(c);
      if (seen.has(k)) continue;
      seen.add(k);
      open.push({ s: c, path: path + a[0], f: heuristic(c) + (path.length + 1) * 0.35 });
    }
  }
  return null;
}
