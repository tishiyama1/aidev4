// シャーレ — browser front end: dish rendering, hand, rewards, overlays.
import * as P from './sim.js';
import { unlock, sfx } from './audio.js';

const $ = id => document.getElementById(id);
const dish = $('dish');
const ctx = dish.getContext('2d');
const handEl = $('hand');
const overlay = $('overlay');

let run = null;
let day = null;
let phase = 'title'; // title | aim | culture | result | reward | over
let phaseAt = 0;
let selected = 0;
let hover = -1;
let frames = [];
let frameIdx = 0;
let frameAt = 0;
let fast = false;
let shown = null; // cells currently drawn
let toxinShown = null;
let born = new Map(); // cell -> time
let dying = []; // { i, id, t }
let eats = []; // { a, b, t }
let arrivals = []; // { i, t }

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

// ---------- geometry ----------
let S = 600, unit = 20, cx0 = 300, cy0 = 300;
function resize() {
  const hud = $('hud').offsetHeight || 40;
  const size = Math.max(280, Math.min(window.innerWidth - 32, window.innerHeight - hud - 170, 680));
  const dpr = window.devicePixelRatio || 1;
  dish.style.width = dish.style.height = `${size}px`;
  dish.width = dish.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S = size; cx0 = cy0 = size / 2;
  unit = (size / 2 - 34) / (P.R * 1.75 + 1.1);
}
window.addEventListener('resize', () => { resize(); renderHand(); });
const cellXY = i => { const [x, y] = P.pos(P.CELLS[i]); return [cx0 + x * unit, cy0 + y * unit]; };
function cellAt(px, py) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < P.N; i++) {
    const [x, y] = cellXY(i);
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return bd < (unit * 1.1) ** 2 ? best : -1;
}

// ---------- strain look ----------
function strainFill(st, a = 1) {
  if (st.owner === 'x') return `hsla(285, 38%, 26%, ${a})`;
  return `hsla(${st.hue}, 62%, 56%, ${a})`;
}
function strainEdge(st) {
  return st.owner === 'x' ? 'hsl(300, 45%, 62%)' : `hsl(${st.hue}, 55%, 30%)`;
}

// One colony cell with its trait marks.
function drawColony(c, st, x, y, r, t, seed = 0) {
  const has = tr => st.traits.includes(tr);
  c.beginPath();
  if (has('grow')) {
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const rr = r * (0.9 + 0.1 * Math.cos(a * 6 + seed));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      k ? c.lineTo(px, py) : c.moveTo(px, py);
    }
  } else c.arc(x, y, r * 0.9, 0, Math.PI * 2);
  c.fillStyle = strainFill(st);
  c.fill();
  c.lineWidth = has('shell') ? Math.max(2.5, r * 0.28) : Math.max(1, r * 0.1);
  c.strokeStyle = has('shell') ? 'rgba(30,22,16,0.85)' : strainEdge(st);
  c.stroke();
  if (has('prey')) {
    c.fillStyle = strainEdge(st);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + seed;
      c.beginPath();
      c.moveTo(x + Math.cos(a - 0.22) * r * 0.85, y + Math.sin(a - 0.22) * r * 0.85);
      c.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
      c.lineTo(x + Math.cos(a + 0.22) * r * 0.85, y + Math.sin(a + 0.22) * r * 0.85);
      c.fill();
    }
  }
  if (has('dormant')) {
    c.beginPath();
    c.arc(x, y, r * 0.55, 0, Math.PI * 2);
    c.lineWidth = Math.max(1.2, r * 0.14);
    c.strokeStyle = 'rgba(255,255,255,0.65)';
    c.stroke();
  }
  if (has('photo')) {
    c.beginPath();
    c.moveTo(x - r * 0.5, y + r * 0.35);
    c.quadraticCurveTo(x, y - r * 0.6, x + r * 0.5, y + r * 0.35);
    c.quadraticCurveTo(x, y + r * 0.1, x - r * 0.5, y + r * 0.35);
    c.fillStyle = 'rgba(70,140,60,0.9)';
    c.fill();
  }
  if (has('toxic')) {
    c.beginPath();
    c.arc(x, y, r * 0.24, 0, Math.PI * 2);
    c.fillStyle = '#2b0d33';
    c.fill();
    c.strokeStyle = '#c86bdc';
    c.lineWidth = 1;
    c.stroke();
  }
  if (has('spore')) {
    c.fillStyle = 'rgba(255,250,235,0.95)';
    for (let k = 0; k < 3; k++) {
      const a = t * 1.5 + (k / 3) * Math.PI * 2 + seed;
      c.beginPath();
      c.arc(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15, Math.max(1.2, r * 0.13), 0, Math.PI * 2);
      c.fill();
    }
  }
  if (has('symbio')) {
    c.beginPath();
    c.arc(x, y, r * 0.35, 0, Math.PI * 2);
    c.setLineDash([2, 2]);
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1;
    c.stroke();
    c.setLineDash([]);
  }
}

// A little 7-cell cluster for cards.
function drawCluster(c, st, w, h, t, r = 11) {
  const pts = [[0, 0], ...[0, 1, 2, 3, 4, 5].map(k => [Math.cos(k * Math.PI / 3 + Math.PI / 6) * r * 1.75, Math.sin(k * Math.PI / 3 + Math.PI / 6) * r * 1.75])];
  pts.forEach(([dx, dy], k) => drawColony(c, st, w / 2 + dx, h / 2 + dy, r, t, k * 1.7));
}

// ---------- dish ----------
const speck = P.CELLS.map((_, i) => [((i * 73) % 17) / 17 - 0.5, ((i * 37) % 13) / 13 - 0.5]);

function draw(now) {
  const t = now / 1000;
  ctx.clearRect(0, 0, S, S);
  const dishR = (P.R * 1.75 + 1.1) * unit;
  // glass + agar
  const g = ctx.createRadialGradient(cx0 - dishR * 0.3, cy0 - dishR * 0.3, dishR * 0.1, cx0, cy0, dishR);
  g.addColorStop(0, '#f4ead0');
  g.addColorStop(1, '#d8c79f');
  ctx.beginPath();
  ctx.arc(cx0, cy0, dishR, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  if (!day) return;
  const env = day.env;
  const r = unit * 0.95;
  for (let i = 0; i < P.N; i++) {
    const [x, y] = cellXY(i);
    if (env.light[i] === 2) { ctx.fillStyle = 'rgba(255,214,120,0.32)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    if (env.light[i] === 0) { ctx.fillStyle = 'rgba(60,45,30,0.16)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    if (env.nutrient[i]) {
      ctx.fillStyle = 'rgba(120,80,40,0.45)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(x + (speck[(i + k) % P.N][0]) * unit, y + (speck[(i + k * 3) % P.N][1]) * unit, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (env.anti[i]) {
      ctx.strokeStyle = 'rgba(80,150,190,0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI / 3;
        ctx.moveTo(x - Math.cos(a) * unit * 0.45, y - Math.sin(a) * unit * 0.45);
        ctx.lineTo(x + Math.cos(a) * unit * 0.45, y + Math.sin(a) * unit * 0.45);
      }
      ctx.stroke();
    }
    if (env.bubble[i]) {
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,80,60,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - unit * 0.25, y - unit * 0.25, unit * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }
    if (toxinShown && toxinShown[i]) {
      ctx.fillStyle = `rgba(110,40,130,${0.12 * toxinShown[i]})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // symbiosis threads
  if (shown) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < P.N; i++) {
      const id = shown[i];
      if (id < 0) continue;
      const st = day.strains.get(id);
      if (!st.traits.includes('symbio')) continue;
      for (const n of P.NEIGH[i]) {
        const o = shown[n];
        if (o >= 0 && o !== id && day.strains.get(o).owner === st.owner) {
          const [x1, y1] = cellXY(i), [x2, y2] = cellXY(n);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }
    }
  }
  // dying colonies fade out
  dying = dying.filter(d => now - d.t < 400);
  for (const d of dying) {
    const [x, y] = cellXY(d.i);
    ctx.globalAlpha = 1 - (now - d.t) / 400;
    drawColony(ctx, day.strains.get(d.id), x, y, unit * 0.62, t, d.i);
    ctx.globalAlpha = 1;
  }
  if (shown) {
    for (let i = 0; i < P.N; i++) {
      const id = shown[i];
      if (id < 0) continue;
      const [x, y] = cellXY(i);
      const b = born.get(i);
      const k = b ? Math.min(1, (now - b) / 180) : 1;
      drawColony(ctx, day.strains.get(id), x, y, unit * 0.62 * (0.3 + 0.7 * k), t, i);
    }
  }
  // predation flashes
  eats = eats.filter(e => now - e.t < 300);
  for (const e of eats) {
    const [x1, y1] = cellXY(e.a), [x2, y2] = cellXY(e.b);
    ctx.strokeStyle = `rgba(160,20,20,${1 - (now - e.t) / 300})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // where the invader will come from
  for (const e of day.entries) {
    const [x, y] = cellXY(e);
    const a = Math.atan2(y - cy0, x - cx0);
    const ox = cx0 + Math.cos(a) * (dishR + 14), oy = cy0 + Math.sin(a) * (dishR + 14);
    if (phase === 'aim' && day.drop === 0) {
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 4);
      drawColony(ctx, day.invader, ox, oy, unit * 0.62, t, 3);
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(cx0, cy0, dishR + 3, a - 0.18, a + 0.18);
    ctx.strokeStyle = `rgba(150,70,170,${0.5 + 0.4 * Math.sin(t * 5)})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  arrivals = arrivals.filter(a => now - a.t < 600);
  for (const a of arrivals) {
    const [x, y] = cellXY(a.i);
    const k = (now - a.t) / 600;
    ctx.beginPath();
    ctx.arc(x, y, unit * (0.6 + k * 1.2), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(150,70,170,${1 - k})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // aiming ghost
  if (phase === 'aim' && hover >= 0 && !env.bubble[hover]) {
    const st = day.strains.get(day.hand[selected]);
    const ghost = [hover, ...P.NEIGH[hover].filter(n => day.cells[n] < 0 && !env.bubble[n] && !day.toxin[n])];
    ctx.globalAlpha = 0.5;
    for (const i of ghost) { const [x, y] = cellXY(i); drawColony(ctx, st, x, y, unit * 0.62, t, i); }
    ctx.globalAlpha = 1;
  }
  // rim
  ctx.beginPath();
  ctx.arc(cx0, cy0, dishR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
  drawGauge(now, dishR);
}

function drawGauge(now, dishR) {
  const cells = shown || day.cells;
  let mine = 0, theirs = 0;
  for (let i = 0; i < P.N; i++) {
    const id = cells[i];
    if (id < 0) continue;
    if (day.strains.get(id).owner === 'p') mine++; else theirs++;
  }
  const h = P.habitable(day);
  const R0 = dishR + 24, top = -Math.PI / 2;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx0, cy0, R0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.stroke();
  if (mine) {
    ctx.beginPath(); ctx.arc(cx0, cy0, R0, top, top + (mine / h) * Math.PI * 2);
    ctx.strokeStyle = '#f3e3b5'; ctx.stroke();
  }
  if (theirs) {
    ctx.beginPath(); ctx.arc(cx0, cy0, R0, top, top - (theirs / h) * Math.PI * 2, true);
    ctx.strokeStyle = 'hsl(290, 40%, 45%)'; ctx.stroke();
  }
  ctx.lineCap = 'butt';
  const ta = top + P.TARGET[day.day] * Math.PI * 2;
  const passing = mine / h >= P.TARGET[day.day];
  ctx.beginPath();
  ctx.moveTo(cx0 + Math.cos(ta) * (R0 - 11), cy0 + Math.sin(ta) * (R0 - 11));
  ctx.lineTo(cx0 + Math.cos(ta) * (R0 + 11), cy0 + Math.sin(ta) * (R0 + 11));
  ctx.strokeStyle = passing ? '#f2c14e' : '#e8e0d0';
  ctx.lineWidth = passing ? 4 : 3;
  ctx.stroke();
}

// ---------- HUD & hand ----------
function updateHud() {
  const days = $('days');
  days.innerHTML = '';
  for (let d = 0; d < P.DAYS; d++) {
    const i = document.createElement('i');
    i.className = d < run.day ? 'past' : d === run.day ? 'here' : '';
    days.appendChild(i);
  }
  const drops = $('drops');
  drops.innerHTML = '';
  for (let k = 0; k < P.DROPS; k++) {
    const i = document.createElement('i');
    i.className = k < day.drop ? 'used' : '';
    drops.appendChild(i);
  }
}

function paint(canvas, w, h, fn) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  fn(c);
}

function renderHand() {
  handEl.innerHTML = '';
  if (!day) return;
  day.hand.forEach((id, k) => {
    const b = document.createElement('button');
    b.className = `card${k === selected ? ' sel' : ''}`;
    const cv = document.createElement('canvas');
    paint(cv, 96, 84, c => drawCluster(c, day.strains.get(id), 96, 84, 0));
    b.appendChild(cv);
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = k + 1;
    b.appendChild(key);
    b.addEventListener('click', () => { unlock(); selected = k; renderHand(); sfx.select(); });
    handEl.appendChild(b);
  });
  handEl.classList.toggle('busy', phase !== 'aim');
}

// ---------- flow ----------
function newGame() {
  const q = new URLSearchParams(location.search);
  const seed = q.has('seed') ? P.hashSeed(q.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
  run = P.newRun(seed);
  run.day = 0;
  startDay();
}

function startDay() {
  day = P.startDay(run);
  shown = day.cells.slice();
  toxinShown = day.toxin.slice();
  born = new Map(); dying = []; eats = []; arrivals = [];
  selected = 0;
  phase = 'aim';
  hideOverlay();
  updateHud();
  renderHand();
  sfx.day();
}

function drop(i) {
  if (phase !== 'aim' || i < 0 || day.env.bubble[i]) return;
  const id = day.hand[selected];
  frames = P.playDrop(day, id, i, true);
  frameIdx = -1;
  frameAt = 0;
  fast = false;
  phase = 'culture';
  renderHand();
  sfx.drop();
}

function advanceFrames(now) {
  if (phase !== 'culture') return;
  const dur = frameIdx < 0 ? 0 : fast ? 45 : 170;
  if (now - frameAt < dur) return;
  frameIdx++;
  frameAt = now;
  if (frameIdx >= frames.length) {
    finishDrop();
    return;
  }
  const f = frames[frameIdx];
  for (let i = 0; i < P.N; i++) {
    if (shown[i] >= 0 && f.cells[i] !== shown[i] && f.cells[i] < 0) dying.push({ i, id: shown[i], t: now });
    if (f.cells[i] >= 0 && f.cells[i] !== shown[i]) born.set(i, now);
  }
  for (const [a, b] of f.eats) eats.push({ a, b, t: now });
  if (f.arrived) { for (const i of f.arrived) arrivals.push({ i, t: now }); if (f.arrived.length) sfx.invade(); }
  shown = f.cells;
  toxinShown = f.toxin;
  if (f.births.length) sfx.grow(f.births.length);
  if (f.eats.length) sfx.eat();
}

function finishDrop() {
  updateHud();
  if (!P.dayOver(day)) {
    P.dealHand(day, run);
    selected = 0;
    phase = 'aim';
    renderHand();
    return;
  }
  phase = 'result';
  const passed = P.dayPassed(day);
  run.history.push(P.shares(day).mine);
  if (passed) sfx.pass(); else sfx.fail();
  setTimeout(() => {
    if (!passed) return showEnd(false);
    if (run.day >= P.DAYS - 1) return showEnd(true);
    showRewards();
  }, 1300);
}

// ---------- overlays ----------
function hideOverlay() { overlay.className = 'hidden'; overlay.innerHTML = ''; }

function showTitle() {
  phase = 'title';
  overlay.className = 'title';
  const best = load('petri.best', 0);
  overlay.innerHTML = `<div class="card"><h1>シャーレ</h1><p class="sub">PETRI</p>${best ? `<div class="pips">${pips(best)}</div>` : ''}<button class="go" aria-label="start">●</button></div>`;
  overlay.querySelector('.go').addEventListener('click', start);
}

function pips(n) {
  let h = '';
  for (let d = 0; d < P.DAYS; d++) h += `<i class="${d < n ? 'past' : ''}"></i>`;
  return h;
}

function showRewards() {
  phase = 'reward';
  phaseAt = performance.now();
  const offers = P.offerRewards(run);
  overlay.className = 'reward';
  overlay.innerHTML = '<div class="card"><div class="pips"></div><div class="offers"></div></div>';
  overlay.querySelector('.pips').innerHTML = pips(run.day + 1);
  const box = overlay.querySelector('.offers');
  offers.forEach((o, k) => {
    const b = document.createElement('button');
    b.className = 'offer';
    b.style.animationDelay = `${k * 0.12}s`;
    const cv = document.createElement('canvas');
    if (o.type === 'new') {
      const st = P.makeStrain(-1, 'p', o.traits, P.HUES[run.nextHue % P.HUES.length]);
      paint(cv, 200, 110, c => {
        drawCluster(c, st, 200, 110, 0, 13);
        c.fillStyle = '#f2c14e';
        c.font = 'bold 22px serif';
        c.fillText('+', 172, 26);
      });
    } else {
      const st = run.library.find(s => s.id === o.strain);
      const after = { ...st, traits: [...st.traits, o.trait] };
      paint(cv, 200, 110, c => {
        drawCluster(c, st, 90, 110, 0, 9);
        c.strokeStyle = '#d9c9a6';
        c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(90, 55); c.lineTo(112, 55); c.lineTo(106, 50); c.moveTo(112, 55); c.lineTo(106, 60); c.stroke();
        c.save(); c.translate(105, 0);
        drawCluster(c, after, 95, 110, 0, 9);
        c.restore();
      });
    }
    b.appendChild(cv);
    b.addEventListener('click', () => {
      if (performance.now() - phaseAt < 400) return;
      P.applyReward(run, o);
      run.day++;
      startDay();
    });
    box.appendChild(b);
  });
}

function showEnd(won) {
  phase = 'over';
  phaseAt = performance.now();
  const reached = won ? P.DAYS : run.day;
  if (reached > load('petri.best', 0)) save('petri.best', reached);
  overlay.className = 'end';
  overlay.innerHTML = `<div class="card">
    <div class="big">${won ? '◎' : '◌'}</div>
    <div class="pips">${pips(reached)}</div>
    <div class="lib"></div>
    <button class="go" aria-label="again">↻</button></div>`;
  const lib = overlay.querySelector('.lib');
  for (const st of run.library) {
    const cv = document.createElement('canvas');
    paint(cv, 90, 80, c => drawCluster(c, st, 90, 80, 0, 9));
    lib.appendChild(cv);
  }
  const inv = document.createElement('canvas');
  inv.className = 'foe';
  paint(inv, 90, 80, c => drawCluster(c, day.invader, 90, 80, 0, 9));
  lib.appendChild(inv);
  overlay.querySelector('.go').addEventListener('click', start);
  if (won) sfx.win();
}

function start() {
  unlock();
  if (phase === 'over' && performance.now() - phaseAt < 800) return;
  if (phase !== 'title' && phase !== 'over') return;
  newGame();
}

// ---------- input ----------
dish.addEventListener('pointermove', e => {
  const r = dish.getBoundingClientRect();
  hover = cellAt(e.clientX - r.left, e.clientY - r.top);
});
dish.addEventListener('pointerleave', () => { hover = -1; });
dish.addEventListener('pointerdown', e => {
  unlock();
  const r = dish.getBoundingClientRect();
  const i = cellAt(e.clientX - r.left, e.clientY - r.top);
  if (phase === 'culture') { fast = true; return; }
  if (e.pointerType !== 'mouse' && phase === 'aim' && i !== hover) { hover = i; return; } // touch: first tap aims
  drop(i);
});
window.addEventListener('keydown', e => {
  unlock();
  if (phase === 'title' || phase === 'over') {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
    return;
  }
  if (phase === 'aim' && ['1', '2', '3'].includes(e.key) && Number(e.key) <= day.hand.length) {
    selected = Number(e.key) - 1;
    renderHand();
    sfx.select();
  }
  if (phase === 'culture' && e.key === ' ') { e.preventDefault(); fast = true; }
});

if (new URLSearchParams(location.search).has('debug')) {
  window.__game = { day: () => day, run: () => run, phase: () => phase, drop: i => drop(i), select: k => { selected = k; } };
}

function frame(now) {
  advanceFrames(now);
  draw(now);
  requestAnimationFrame(frame);
}
resize();
showTitle();
requestAnimationFrame(frame);
