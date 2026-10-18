// 未知律 — browser front end: board rendering, field notes, overlays, input.
import * as C from './core.js';
import * as D from './draw.js';
import { unlock, lawNote, sfx } from './audio.js';

const $ = id => document.getElementById(id);
const board = $('board');
const ctx = board.getContext('2d');
const notesEl = $('notes');
const overlay = $('overlay');

let run = null;
let s = null;
let phase = 'title'; // title | play | loading | dying | over
let phaseAt = 0;
let token = 0;
let worker = null;

// displayed (tweened) positions
let view = { ents: new Map(), player: null };
let flashes = [];
let shakeUntil = 0;
let hurtUntil = 0;
let lampPulse = 0;
let notes = new Map(); // law id -> { count, obs, pin, cracked }
const PINS = ['', 'good', 'bad', 'maybe'];

// ---------- persistence (best effort) ----------
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

// ---------- sizing ----------
let cs = 48; // css px per cell
function resize() {
  const wide = window.innerWidth >= 820;
  document.body.classList.toggle('wide', wide);
  const hud = $('hud').offsetHeight || 56;
  const availW = wide ? window.innerWidth - 300 - 56 : window.innerWidth - 32;
  const availH = wide ? window.innerHeight - hud - 48 : window.innerHeight - hud - 170;
  const size = Math.max(260, Math.min(availW, availH, 660));
  cs = size / C.W;
  const dpr = window.devicePixelRatio || 1;
  board.style.width = board.style.height = `${size}px`;
  board.width = board.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

// ---------- run flow ----------
function seedFromUrl() {
  const q = new URLSearchParams(location.search);
  if (q.has('seed')) return C.hashSeed(q.get('seed'));
  if (q.has('daily')) return C.hashSeed(new Date().toISOString().slice(0, 10));
  return (Math.random() * 2 ** 32) >>> 0;
}

function requestLayer(onReady) {
  const my = ++token;
  const snapshot = JSON.parse(JSON.stringify(run));
  const done = layer => { if (my === token) onReady(layer); };
  try {
    if (!worker) worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { if (data.token === my) done(data.layer); };
    worker.onerror = () => { worker = null; done(C.startLayer(snapshot)); };
    worker.postMessage({ token: my, run: snapshot });
  } catch {
    setTimeout(() => done(C.startLayer(snapshot)), 0);
  }
}

function newGame() {
  run = C.newRun(seedFromUrl());
  notes = new Map();
  notesEl.innerHTML = '';
  save('mr.runs', load('mr.runs', 0) + 1);
  enterLayer();
}

function enterLayer() {
  phase = 'loading';
  const started = performance.now();
  showDescent(run.depth);
  const prevLaws = s ? s.laws : null;
  requestLayer(layer => {
    const wait = Math.max(0, 1100 - (performance.now() - started));
    setTimeout(() => {
      s = layer;
      if (prevLaws) markMutations(prevLaws, s.laws);
      resetView();
      hideOverlay();
      phase = 'play';
      updateHud();
    }, wait);
  });
}

function markMutations(prev, next) {
  for (const law of next) {
    const old = prev.find(l => l.id === law.id);
    if (old && old.effect.type === law.effect.type && old.effect.value === law.effect.value) continue;
    const n = notes.get(law.id);
    if (n) { n.cracked = true; n.obs = null; renderNote(law.id, true); }
  }
}

function finish(kind) {
  phase = 'dying';
  const best = load('mr.best', 0);
  const reached = kind === 'win' ? C.MAX_DEPTH + 1 : run.depth;
  if (reached > best) save('mr.best', reached);
  if (kind === 'win') sfx.win(); else sfx.death();
  const laws = s.laws;
  setTimeout(() => showEnd(kind, reached, best, laws), kind === 'win' ? 400 : 1100);
}

// ---------- turn ----------
function act(action) {
  if (phase !== 'play') return;
  const events = C.step(s, action);
  if (!events) { sfx.bump(); return; }
  absorb(events);
  updateHud();
  if (s.status === 'descend') {
    sfx.descend();
    phase = 'loading';
    if (C.advanceRun(run, s)) setTimeout(enterLayer, 350);
    else finish('win');
  } else if (s.status === 'dead' || s.status === 'dark') {
    finish(s.status);
  }
}

function absorb(events) {
  const now = performance.now();
  let lawIndex = 0;
  let moved = false;
  for (const ev of events) {
    if (ev.kind === 'law') {
      const law = s.laws.find(l => l.id === ev.law);
      const delay = 60 + lawIndex * 150;
      lawIndex++;
      flashes.push({ law, at: ev.at, src: ev.src, start: now + delay });
      lawNote(law, delay / 1000);
      record(law, ev);
      if (ev.extra === 'hurt') { shakeUntil = now + delay + 300; hurtUntil = now + delay + 500; }
    } else if (ev.kind === 'bite') {
      shakeUntil = now + 300; hurtUntil = now + 500;
      sfx.bite();
    } else if (ev.kind === 'shard') sfx.shard();
    else if (ev.kind === 'push') { sfx.push(); moved = true; }
    else if (ev.kind === 'nudge') sfx.nudge();
    else if (ev.kind === 'lamp') { lampPulse = now; setTimeout(() => sfx.lamp(ev.to, ev.to > ev.from), 80 + lawIndex * 150); }
    else if (ev.kind === 'open') setTimeout(sfx.open, 200 + lawIndex * 150);
  }
  if (!moved) sfx.step();
  syncView(now);
}

// ---------- field notes ----------
function record(law, ev) {
  let n = notes.get(law.id);
  const fresh = !n;
  if (!n) { n = { count: 0, obs: null, pin: 0, cracked: false }; notes.set(law.id, n); }
  n.count++;
  n.obs = { before: ev.before, after: ev.after, extra: ev.extra };
  renderNote(law.id, fresh);
}

function renderNote(id, highlight) {
  const law = s.laws.find(l => l.id === id);
  const n = notes.get(id);
  let el = notesEl.querySelector(`[data-id="${id}"]`);
  if (!el) {
    el = document.createElement('button');
    el.className = 'note';
    el.dataset.id = id;
    el.innerHTML = '<canvas class="g"></canvas><canvas class="obs"></canvas><span class="tally"></span><span class="pin"></span>';
    el.addEventListener('click', () => {
      n.pin = (n.pin + 1) % PINS.length;
      renderNote(id, false);
    });
    notesEl.appendChild(el);
  }
  const g = el.querySelector('.g');
  paintSmall(g, 44, 44, c => D.drawGlyph(c, law.glyph, 22, 22, 34, D.INK, 2.4, n.cracked));
  const o = el.querySelector('.obs');
  paintSmall(o, 104, 44, c => drawObservation(c, n.obs));
  el.querySelector('.tally').textContent = n.count > 9 ? '|||||+' : '|'.repeat(n.count);
  el.querySelector('.pin').dataset.pin = PINS[n.pin];
  if (highlight) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
}

function paintSmall(canvas, w, h, fn) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  fn(c);
}

function drawObservation(c, obs) {
  if (!obs) return;
  const y = 22, r = 12;
  if (obs.before) D.drawEntity(c, obs.before, 18, y, r, 0, 1.6);
  c.beginPath();
  c.moveTo(38, y); c.lineTo(58, y); c.lineTo(53, y - 4); c.moveTo(58, y); c.lineTo(53, y + 4);
  c.strokeStyle = D.INK; c.lineWidth = 1.4; c.stroke();
  const x = 82;
  switch (obs.extra) {
    case 'hurt': D.drawHeart(c, x, y, 11, true, true); break;
    case 'light': D.drawFlame(c, x, y, 13); break;
    case 'gone':
      c.setLineDash([3, 3]); c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      break;
    case 'copy':
      D.drawEntity(c, obs.after, x - 8, y, 10, 0, 1.4);
      D.drawEntity(c, obs.after, x + 8, y, 10, 0, 1.4);
      break;
    case 'moved':
      D.drawEntity(c, obs.after, x, y, r, 0, 1.6);
      c.beginPath(); c.moveTo(x - 20, y + 14); c.lineTo(x + 18, y + 14); c.stroke();
      break;
    case 'swap':
      D.drawPlayer(c, x - 9, y, 10);
      D.drawEntity(c, obs.after, x + 10, y, 9, 0, 1.4);
      break;
    default:
      if (obs.after) D.drawEntity(c, obs.after, x, y, r, 0, 1.6);
  }
}

// ---------- view / animation ----------
function resetView() {
  view = { ents: new Map(), player: { x: s.player.x, y: s.player.y, fx: s.player.x, fy: s.player.y, t0: 0 } };
  for (const e of s.ents) view.ents.set(e.id, { x: e.x, y: e.y, fx: e.x, fy: e.y, t0: 0, look: { ...e }, alpha: 1, born: 0, dying: 0 });
  flashes = [];
}

const MOVE_MS = 130;
const lerpPos = (v, now) => {
  const k = Math.min(1, (now - v.t0) / MOVE_MS);
  const e = 1 - (1 - k) * (1 - k);
  return [v.fx + (v.x - v.fx) * e, v.fy + (v.y - v.fy) * e];
};

function syncView(now) {
  const [px, py] = lerpPos(view.player, now);
  view.player = { fx: px, fy: py, x: s.player.x, y: s.player.y, t0: now };
  const alive = new Set();
  for (const e of s.ents) {
    alive.add(e.id);
    const v = view.ents.get(e.id);
    if (v) {
      const [x, y] = lerpPos(v, now);
      Object.assign(v, { fx: x, fy: y, x: e.x, y: e.y, t0: now, look: { ...e } });
    } else {
      view.ents.set(e.id, { x: e.x, y: e.y, fx: e.x, fy: e.y, t0: now, look: { ...e }, alpha: 1, born: now + 150, dying: 0 });
    }
  }
  for (const [id, v] of view.ents) if (!alive.has(id) && !v.dying) v.dying = now + 150;
}

function cellRect(x, y) { return [x * cs, y * cs]; }

function drawBoard(now) {
  const t = now / 1000;
  const size = cs * C.W;
  ctx.save();
  if (now < shakeUntil) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  ctx.fillStyle = D.PAPER;
  ctx.fillRect(-10, -10, size + 20, size + 20);
  if (!s) { ctx.restore(); return; }

  // floor & walls
  for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) {
    const [X, Y] = cellRect(x, y);
    if (s.grid[y * C.W + x]) {
      ctx.fillStyle = '#4a4036';
      ctx.fillRect(X, Y, cs + 0.5, cs + 0.5);
      ctx.strokeStyle = '#2f2821';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const h = (x * 7 + y * 13) % 5;
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(X + ((h + i * 3) % 7) * cs / 7, Y + cs);
        ctx.lineTo(X + ((h + i * 3) % 7) * cs / 7 + cs * 0.3, Y);
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(42,36,28,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(X + 0.5, Y + 0.5, cs - 1, cs - 1);
    }
  }
  // altars
  for (const a of s.altars) {
    const [X, Y] = cellRect(a.x, a.y);
    ctx.strokeStyle = 'rgba(42,36,28,0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(X + cs * 0.1, Y + cs * 0.1, cs * 0.8, cs * 0.8);
    ctx.strokeRect(X + cs * 0.2, Y + cs * 0.2, cs * 0.6, cs * 0.6);
    for (const [dx, dy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
      ctx.beginPath();
      ctx.moveTo(X + cs * dx, Y + cs * dy);
      ctx.lineTo(X + cs * (dx < 0.5 ? 0.2 : 0.8), Y + cs * (dy < 0.5 ? 0.2 : 0.8));
      ctx.stroke();
    }
  }
  drawSeal(now);
  // shards
  for (const p of s.shards) {
    const [X, Y] = cellRect(p.x, p.y);
    D.drawFlame(ctx, X + cs / 2, Y + cs / 2, cs * 0.22, t + p.x);
  }
  // entities
  const omen = phase === 'play' ? C.omens(s) : new Map();
  for (const [id, v] of view.ents) {
    let alpha = 1, scale = 1;
    if (v.dying) {
      const k = (now - v.dying) / 350;
      if (k >= 1) { view.ents.delete(id); continue; }
      alpha = k < 0 ? 1 : 1 - k;
      scale = k < 0 ? 1 : 1 + k * 0.4;
    } else if (v.born) {
      const k = Math.max(0, Math.min(1, (now - v.born) / 250));
      scale = k; alpha = k;
    }
    let [x, y] = lerpPos(v, now);
    let cx = x * cs + cs / 2, cy = y * cs + cs / 2;
    const o = omen.get(id);
    if (o === 'tremble') { cx += Math.sin(now / 30 + id) * 1.6; cy += Math.cos(now / 23 + id) * 1.2; }
    ctx.globalAlpha = alpha;
    if (o === 'pulse') {
      ctx.beginPath();
      ctx.arc(cx, cy, cs * (0.42 + 0.08 * Math.sin(now / 120)), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(42,36,28,0.45)';
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    D.drawEntity(ctx, v.look, cx, cy, cs * 0.34 * scale, t + id, Math.max(1.4, cs / 26));
    ctx.globalAlpha = 1;
  }
  // player
  {
    const [x, y] = lerpPos(view.player, now);
    D.drawPlayer(ctx, x * cs + cs / 2, y * cs + cs / 2, cs * 0.36);
  }
  drawFog(now);
  drawFlashes(now);
  if (now < hurtUntil) {
    ctx.fillStyle = `rgba(158,43,37,${0.25 * (hurtUntil - now) / 500})`;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.restore();
}

function drawSeal(now) {
  const [X, Y] = cellRect(s.seal.x, s.seal.y);
  const cx = X + cs / 2, cy = Y + cs / 2;
  ctx.fillStyle = '#2b241d';
  ctx.fillRect(X, Y, cs, cs);
  ctx.beginPath();
  ctx.arc(cx, cy + cs * 0.05, cs * 0.32, Math.PI, 0);
  ctx.lineTo(cx + cs * 0.32, cy + cs * 0.45);
  ctx.lineTo(cx - cs * 0.32, cy + cs * 0.45);
  ctx.closePath();
  if (s.sealOpen) {
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, cs * 0.5);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(1, `rgba(233,162,59,${0.6 + 0.2 * Math.sin(now / 200)})`);
    ctx.fillStyle = g;
  } else ctx.fillStyle = '#14100c';
  ctx.fill();
  ctx.strokeStyle = '#c9b48a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // lamps along the arch
  const k = s.goal.k;
  for (let i = 0; i < k; i++) {
    const a = Math.PI + (Math.PI * (i + 1)) / (k + 1);
    const lx = cx + Math.cos(a) * cs * 0.42, ly = cy + cs * 0.05 + Math.sin(a) * cs * 0.42;
    ctx.beginPath();
    ctx.arc(lx, ly, cs * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = i < s.lit ? '#f2c14e' : '#3b332a';
    ctx.fill();
  }
}

function drawFlashes(now) {
  flashes = flashes.filter(f => now - f.start < 1100);
  for (const f of flashes) {
    const k = (now - f.start) / 1100;
    if (k < 0) continue;
    const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    const tx = f.at[0] * cs + cs / 2, ty = f.at[1] * cs + cs / 2;
    ctx.globalAlpha = Math.max(0, a);
    if (f.src) {
      const sx = f.src[0] * cs + cs / 2, sy = f.src[1] * cs + cs / 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + tx) / 2, (sy + ty) / 2 - cs * 0.6, tx, ty);
      ctx.strokeStyle = D.INK;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.beginPath();
      ctx.arc(tx, ty, cs * (0.4 + k * 0.5), 0, Math.PI * 2);
      ctx.strokeStyle = D.INK;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const gy = ty - cs * (0.7 + k * 0.35);
    ctx.beginPath();
    ctx.arc(tx, gy, cs * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239,230,210,0.92)';
    ctx.fill();
    D.drawGlyph(ctx, f.law.glyph, tx, gy, cs * 0.5, D.INK, Math.max(1.6, cs / 22), f.law.mutated && notes.get(f.law.id)?.cracked);
    ctx.globalAlpha = 1;
  }
}

function drawFog(now) {
  const [x, y] = lerpPos(view.player, now);
  const px = x * cs + cs / 2, py = y * cs + cs / 2;
  const light = s.player.light;
  const radius = Math.max(1.6, Math.min(8, 1.6 + light / 9)) * cs;
  const flick = 1 + Math.sin(now / 90) * 0.015;
  const g = ctx.createRadialGradient(px, py, radius * 0.45 * flick, px, py, radius * flick);
  g.addColorStop(0, 'rgba(20,16,12,0)');
  g.addColorStop(1, 'rgba(20,16,12,0.93)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cs * C.W, cs * C.H);
}

// ---------- HUD ----------
function updateHud() {
  if (!s) return;
  const depth = $('depth');
  depth.innerHTML = '';
  for (let i = 1; i <= C.MAX_DEPTH; i++) {
    const b = document.createElement('i');
    if (i < run.depth) b.className = 'past';
    if (i === run.depth) b.className = 'here';
    depth.appendChild(b);
  }
  paintSmall($('hearts'), 84, 28, c => {
    for (let i = 0; i < C.MAX_HP; i++) D.drawHeart(c, 14 + i * 27, 14, 10, i < s.player.hp);
  });
  const L = Math.max(0, s.player.light);
  $('lightNum').textContent = L;
  $('lightBar').style.width = `${Math.min(100, (L / 120) * 100)}%`;
  $('lightBar').classList.toggle('low', L <= 15);
  paintSmall($('lamps'), 26 * s.goal.k + 8, 30, c => {
    for (let i = 0; i < s.goal.k; i++) {
      const cx = 17 + i * 26, cy = 15;
      if (i < s.lit) {
        const g = c.createRadialGradient(cx, cy, 1, cx, cy, 13);
        g.addColorStop(0, 'rgba(242,193,78,0.9)');
        g.addColorStop(1, 'rgba(242,193,78,0)');
        c.fillStyle = g;
        c.fillRect(cx - 13, cy - 13, 26, 26);
      }
      c.beginPath();
      c.arc(cx, cy, 7, 0, Math.PI * 2);
      c.fillStyle = i < s.lit ? '#f2c14e' : '#3b332a';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = D.INK;
      c.stroke();
    }
  });
  $('lamps').classList.toggle('open', s.sealOpen);
}

// ---------- overlays ----------
function hideOverlay() { overlay.className = 'hidden'; overlay.innerHTML = ''; }

function strataIcon(reached) {
  let h = '<div class="strata">';
  for (let i = 1; i <= C.MAX_DEPTH; i++) h += `<i class="${i < reached ? 'past' : i === reached ? 'here' : ''}"></i>`;
  return h + '</div>';
}

function showTitle() {
  phase = 'title';
  phaseAt = performance.now();
  const best = load('mr.best', 0);
  overlay.className = 'title';
  overlay.innerHTML = `
    <div class="card">
      <h1>未知律</h1>
      <p class="sub">THE UNWRITTEN LAWS</p>
      ${best ? strataIcon(best) : ''}
      <button class="go" aria-label="start">▼</button>
    </div>`;
  overlay.querySelector('.go').addEventListener('click', start);
}

function showDescent(depth) {
  overlay.className = 'descent';
  overlay.innerHTML = `<div class="sink">${strataIcon(depth)}<div class="num">${['', '一', '二', '三', '四', '五'][depth]}</div></div>`;
}

function showEnd(kind, reached, best, laws) {
  phase = 'over';
  phaseAt = performance.now();
  overlay.className = 'end';
  const icon = document.createElement('canvas');
  paintSmall(icon, 72, 72, c => {
    if (kind === 'dead') D.drawHeart(c, 36, 38, 26, false, true);
    else if (kind === 'dark') {
      // a snuffed wick and its smoke
      c.fillStyle = '#d9c9a6';
      c.fillRect(33, 46, 6, 18);
      c.strokeStyle = '#7a6a55';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(36, 44);
      c.bezierCurveTo(26, 34, 46, 26, 36, 16);
      c.bezierCurveTo(30, 10, 40, 6, 38, 2);
      c.stroke();
    }
    else { D.drawFlame(c, 36, 36, 30, 0); }
  });
  const rows = laws.map(law => {
    const seen = notes.has(law.id);
    const cv = document.createElement('canvas');
    paintSmall(cv, 300, 56, c => {
      D.drawGlyph(c, law.glyph, 28, 28, 38, D.INK, 2.4, law.mutated);
      D.drawTrigger(c, law.trigger, 92, 28, 56);
      D.drawSelector(c, law.sel, 156, 28, 46);
      c.beginPath(); c.moveTo(190, 28); c.lineTo(214, 28); c.lineTo(208, 23); c.moveTo(214, 28); c.lineTo(208, 33);
      c.strokeStyle = D.INK; c.lineWidth = 1.6; c.stroke();
      D.drawEffect(c, law.effect, 254, 28, 56);
    });
    cv.className = seen ? 'law seen' : 'law';
    return cv;
  });
  overlay.innerHTML = `
    <div class="card">
      <div class="icon"></div>
      ${strataIcon(Math.min(reached, C.MAX_DEPTH + 1))}
      ${reached > best && best ? '<div class="stat">★</div>' : ''}
      <div class="laws"></div>
      <button class="go" aria-label="again">↻</button>
    </div>`;
  overlay.querySelector('.icon').appendChild(icon);
  const lawsEl = overlay.querySelector('.laws');
  rows.forEach((r, i) => { r.style.animationDelay = `${0.3 + i * 0.25}s`; lawsEl.appendChild(r); });
  overlay.querySelector('.go').addEventListener('click', start);
}

function start() {
  unlock();
  if (phase === 'over' && performance.now() - phaseAt < 900) return;
  if (phase !== 'title' && phase !== 'over') return;
  s = null;
  newGame();
}

// ---------- input ----------
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  k: 'up', j: 'down', h: 'left', l: 'right', ' ': 'wait', '.': 'wait', Enter: 'wait',
};
window.addEventListener('keydown', e => {
  unlock();
  if (phase === 'title' || phase === 'over') {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
    return;
  }
  const a = KEYS[e.key];
  if (!a) return;
  e.preventDefault();
  act(a);
});

board.addEventListener('pointerdown', e => {
  unlock();
  if (phase !== 'play') return;
  const r = board.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / cs), y = Math.floor((e.clientY - r.top) / cs);
  const dx = x - s.player.x, dy = y - s.player.y;
  if (!dx && !dy) return act('wait');
  if (Math.abs(dx) >= Math.abs(dy)) act(dx > 0 ? 'right' : 'left');
  else act(dy > 0 ? 'down' : 'up');
});

// ---------- loop ----------
function frame(now) {
  drawBoard(now);
  requestAnimationFrame(frame);
}

// test hook for headless verification
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = { state: () => s, run: () => run, phase: () => phase, act };
}

resize();
showTitle();
requestAnimationFrame(frame);
