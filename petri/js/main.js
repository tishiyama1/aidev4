// シャーレ — game controller: screens, the day loop, staging, saving, tutorial, input.
import * as P from './sim.js';
import { DishView, DISH_R } from './dish.js';
import { INVADER, strainName, strainRGB, css } from './palette.js';
import { TRAIT_ICON, UI_ICON } from './icons.js';
import { TRAIT, DAY_NAME, pct, traitNames, traitLine, envLine, rulesHTML } from './text.js';
import * as A from './audio.js';
import { store, packRun, packDay } from './store.js';

const q = new URLSearchParams(location.search);
const DEBUG = q.has('debug');
const FAST = q.has('fast'); // test hook: compresses every timing
const T = ms => (FAST ? Math.min(ms, 40) : ms);
const $ = id => document.getElementById(id);
const app = $('app');
const layer = $('layer');
const coachEl = $('coach');
const dish = new DishView($('dishGL'), $('dishFX'), { forceCanvas: q.has('nogl') });

const G = {
  screen: 'title', // title | play
  phase: 'idle', // intro | aim | culture | judge | reward | end
  run: null,
  day: null,
  selected: 0,
  hover: -1,
  pressing: false,
  play: null, // frame playback { frames, idx, at, bloom, attract, onDone }
  fast: false,
  paused: false,
  attract: null,
  envAnim: null,
  fx: { glow: 0, desat: 0, glowTo: 0, desatTo: 0 },
  timers: [],
  coach: null,
};

const later = (fn, ms) => { const id = setTimeout(fn, T(ms)); G.timers.push(id); return id; };
const clearTimers = () => { G.timers.forEach(clearTimeout); G.timers = []; };

// ---------- settings ----------
function applySettings() {
  const s = store.settings;
  A.configure({ volume: s.volume, music: s.music, sfx: s.sfx });
  dish.motion = s.reduceMotion ? 0 : 1;
  document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
}

// ---------- layout ----------
const wideQuery = matchMedia('(min-width: 960px) and (orientation: landscape)');
function sizeDish() {
  const b = $('board');
  const wide = wideQuery.matches;
  const availW = b.clientWidth - (wide ? 24 + 324 : 8);
  const availH = b.clientHeight - 8;
  const size = Math.round(Math.max(240, Math.min(availW, availH, 820)));
  const w = $('dishWrap');
  w.style.width = w.style.height = `${size}px`;
  dish.resize(size);
}
window.addEventListener('resize', () => { sizeDish(); positionCoach(); });

// ---------- small renderers ----------
function swatch(canvas, rgb, size, seed = 1) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = size * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const r = size / 2;
  // a little watercolour blot: layered irregular washes, a darker dried edge
  let h = seed * 9301 + 49297;
  const rnd = () => ((h = (h * 9301 + 49297) % 233280) / 233280);
  const blob = (rad, k) => {
    c.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rr = rad * (0.86 + 0.14 * Math.sin(a * 3 + k) + 0.06 * (rnd() - 0.5));
      const x = r + Math.cos(a) * rr, y = r + Math.sin(a) * rr;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  };
  blob(r * 0.92, seed);
  c.fillStyle = css(rgb.map(v => v * 0.55), 0.9);
  c.fill();
  blob(r * 0.82, seed + 1);
  c.fillStyle = css(rgb, 0.95);
  c.fill();
  const g = c.createRadialGradient(r * 0.8, r * 0.75, 1, r, r, r * 0.8);
  g.addColorStop(0, 'rgba(255,250,235,0.45)');
  g.addColorStop(1, 'rgba(255,250,235,0)');
  c.fillStyle = g;
  c.fill();
}

function swatchURL(rgb, size, seed) {
  const cv = document.createElement('canvas');
  swatch(cv, rgb, size, seed);
  return cv.toDataURL();
}

function renderTop() {
  const ol = $('days');
  ol.innerHTML = '';
  for (let d = 0; d < P.DAYS; d++) {
    const li = document.createElement('li');
    const h = G.run ? G.run.history[d] : undefined;
    if (h !== undefined) li.className = h >= P.TARGET[d] ? 'done' : 'lost';
    if (G.day && d === G.day.day && h === undefined) li.classList.add('now');
    if (d === P.DAYS - 1) li.classList.add('final');
    li.title = DAY_NAME[d];
    ol.appendChild(li);
  }
}

function renderDrops() {
  const el = $('drops');
  el.innerHTML = '';
  for (let k = 0; k < P.DROPS; k++) {
    const i = document.createElement('i');
    i.innerHTML = UI_ICON.drop;
    if (G.day && k < G.day.drop) i.className = 'used';
    el.appendChild(i);
  }
}

function renderHand() {
  const el = $('hand');
  el.innerHTML = '';
  if (!G.day) return;
  G.day.hand.forEach((id, k) => {
    const st = G.day.strains.get(id);
    const rgb = strainRGB(st);
    const b = document.createElement('button');
    b.className = `card${k === G.selected ? ' sel' : ''}`;
    b.style.setProperty('--c', css(rgb));
    b.setAttribute('aria-pressed', k === G.selected);
    b.innerHTML = `<div class="head"><canvas></canvas><span class="nm">${strainName(st)}</span><span class="key">${k + 1}</span></div>
      <div class="traits">${st.traits.map(t => `<span>${TRAIT_ICON[t]}${TRAIT[t].name}</span>`).join('')}</div>`;
    swatch(b.querySelector('canvas'), rgb, 30, st.pal + 1);
    b.addEventListener('click', () => selectCard(k));
    el.appendChild(b);
  });
  el.classList.toggle('wait', G.phase !== 'aim');
}

function selectCard(k) {
  if (!G.day || k >= G.day.hand.length) return;
  A.unlock();
  if (G.selected !== k) A.sfx.select();
  G.selected = k;
  renderHand();
  coachEvent('select');
}

function counts(cells) {
  const by = new Map();
  let mine = 0, theirs = 0;
  for (let i = 0; i < P.N; i++) {
    const id = cells[i];
    if (id < 0) continue;
    by.set(id, (by.get(id) || 0) + 1);
    if (G.day.strains.get(id).owner === 'p') mine++; else theirs++;
  }
  return { by, mine, theirs, h: P.habitable(G.day) };
}

function updateShare(cells = G.day.cells) {
  const c = counts(cells);
  const target = P.TARGET[G.day.day];
  const segs = $('shareSegs');
  segs.innerHTML = '';
  for (const st of G.run.library) {
    const n = c.by.get(st.id) || 0;
    if (!n) continue;
    const i = document.createElement('i');
    i.style.width = `${(n / c.h) * 100}%`;
    i.style.background = css(strainRGB(st));
    segs.appendChild(i);
  }
  // the segment container itself must span the whole track for percentages to line up
  segs.style.right = '0';
  $('shareInv').style.width = `${(c.theirs / c.h) * 100}%`;
  const tl = $('shareTarget');
  tl.style.left = `${target * 100}%`;
  tl.querySelector('span').textContent = `目標 ${pct(target)}`;
  $('shareMine').textContent = pct(c.mine / c.h);
  $('shareTheirs').textContent = pct(c.theirs / c.h);
  $('shareBar').classList.toggle('passing', c.mine / c.h >= target);
  A.setTension(c.theirs / c.h);
  renderNotebookCounts(c);
}

function renderNotebook() {
  const d = G.day;
  const ul = $('nbStrains');
  ul.innerHTML = '';
  const rows = [...G.run.library, d.invader];
  for (const st of rows) {
    const li = document.createElement('li');
    li.dataset.id = st.id;
    if (st.owner === 'x') li.classList.add('foe');
    li.innerHTML = `<span class="sw" style="background:${css(strainRGB(st))}"></span>
      <span class="nm">${strainName(st)}<span class="tr">${st.traits.map(t => TRAIT_ICON[t]).join('')}</span></span>
      <span class="pc">0%</span>`;
    li.title = traitNames(st);
    ul.appendChild(li);
  }
  $('nbInvader').innerHTML = `<div class="head">${INVADER.name}<span class="muted-note">（${DAY_NAME[d.day]}）</span></div>${d.invader.traits.map(traitLine).join('')}`;
  const env = ['light'];
  if (d.env.nutrient.some(Boolean)) env.push('nutrient');
  if (d.env.anti.some(Boolean)) env.push('anti');
  if (d.env.bubble.some(Boolean)) env.push('bubble');
  if ([...d.strains.values()].some(s => s.traits.includes('toxic'))) env.push('toxin');
  $('nbEnv').innerHTML = env.map(k => `<li>${envLine(k)}</li>`).join('');
}

function renderNotebookCounts(c) {
  for (const li of $('nbStrains').children) {
    const n = c.by.get(Number(li.dataset.id)) || 0;
    li.querySelector('.pc').textContent = pct(n / c.h);
    li.classList.toggle('absent', n === 0);
  }
}

// ---------- the frame loop ----------
function frame(now) {
  advancePlayback(now);
  if (G.envAnim) {
    const k = Math.min(1, (now - G.envAnim) / T(1100));
    dish.envIn = 1 - Math.pow(1 - k, 3);
    if (k >= 1) G.envAnim = null;
  }
  const f = G.fx;
  f.glow += (f.glowTo - f.glow) * 0.08;
  f.desat += (f.desatTo - f.desat) * 0.06;
  dish.glow = f.glow;
  dish.desat = f.desat;
  updateGhost();
  dish.render(now);
  if (G.screen === 'title') tickAttract(now);
  requestAnimationFrame(frame);
}

function frameDuration() {
  if (FAST) return 12;
  if (G.fast) return 90;
  return store.settings.speed === 2 ? 170 : 330;
}

function startPlayback(frames, opts) {
  G.play = { frames, idx: -1, at: 0, ...opts };
}

function advancePlayback(now) {
  const pl = G.play;
  if (!pl || G.paused) return;
  if (pl.idx >= 0 && now - pl.at < frameDuration()) return;
  pl.idx++;
  pl.at = now;
  if (pl.idx >= pl.frames.length) {
    G.play = null;
    if (pl.onDone) pl.onDone();
    return;
  }
  const f = pl.frames[pl.idx];
  const d = pl.attract ? G.attract.day : G.day;
  dish.setCells(f.cells, f.toxin, d.strains, now, pl.idx === 0 ? pl.bloom : -1);
  if (pl.attract) return;
  if (pl.idx === 0 && f.arrived && f.arrived.length) {
    for (const e of d.entries) dish.ripple(e, INVADER.glow, 0.8);
    later(() => A.sfx.invade(), 260);
  }
  if (f.births.length) A.sfx.grow(f.births.length);
  if (f.eats.length) A.sfx.eat();
  if (pl.idx > 0) { A.sfx.tick(); setGen(pl.idx); }
  updateShare(f.cells);
}

function setGen(k) {
  const el = $('gen');
  if (!el.children.length) for (let i = 0; i < P.GENS; i++) el.appendChild(document.createElement('i'));
  [...el.children].forEach((c, i) => c.classList.toggle('on', i < k));
}

// ---------- title & attract mode ----------
function newAttract() {
  const run = P.newRun((Math.random() * 2 ** 32) >>> 0);
  run.library.push(P.makeStrain(3, 'p', ['prey', 'shell'], 3), P.makeStrain(4, 'p', ['spore', 'symbio'], 5));
  run.day = Math.floor(Math.random() * 3);
  const day = P.startDay(run);
  G.attract = { run, day, next: performance.now() + 900 };
  dish.clear();
  dish.setStrains([...day.strains.values()]);
  dish.setEnv(day.env);
  dish.entries = [];
  dish.entryPreview = false;
  G.envAnim = performance.now();
}

function tickAttract(now) {
  const a = G.attract;
  if (!a || G.play || now < a.next) return;
  if (a.day.drop >= 3) { newAttract(); return; }
  const free = [];
  for (let i = 0; i < P.N; i++) if (!a.day.env.bubble[i] && a.day.cells[i] < 0) free.push(i);
  const cell = free[Math.floor(Math.random() * free.length)] ?? 60;
  const id = a.run.library[Math.floor(Math.random() * a.run.library.length)].id;
  const frames = P.playDrop(a.day, id, cell, true);
  startPlayback(frames, { attract: true, bloom: cell, onDone: () => { a.next = performance.now() + 1800; } });
  a.next = Infinity;
}

function showTitle() {
  clearTimers();
  closeCoach();
  G.screen = 'title';
  G.phase = 'idle';
  G.play = null;
  G.paused = false;
  G.fx.glowTo = 0; G.fx.desatTo = 0;
  app.dataset.screen = 'title';
  app.dataset.phase = '';
  $('notebook').classList.remove('open');
  A.setMood('neutral');
  A.setTension(0);
  $('dayCard').className = '';
  $('stamp').className = '';
  setPhase('idle');
  newAttract();
  const s = store.stats;
  const sv = store.save;
  openLayer('clear', `
    <div class="title-screen">
      <h1>シャーレ</h1>
      <div class="sub">PETRI</div>
      <div class="tag">一滴の菌で、七日間の皿を守る</div>
      <div class="title-menu">
        ${sv ? `<button class="btn primary" data-act="continue">つづきから <small>${DAY_NAME[sv.run.day]}${sv.phase === 'reward' ? '・選択中' : sv.phase === 'judge' ? '・判定前' : ''}</small></button>
                <button class="btn" data-act="new">はじめから</button>`
             : '<button class="btn primary" data-act="new">はじめる</button>'}
        <button class="btn" data-act="shelf">標本棚 <small>${store.specimens.length || ''}</small></button>
        <div class="title-foot">
          <button class="btn ghost" data-act="rules">遊び方</button>
          <button class="btn ghost" data-act="settings">設定</button>
        </div>
      </div>
      ${s.runs ? `<div class="title-stats"><span>培養 ${s.runs}回</span><span>最長 ${s.bestDay}日</span><span>完走 ${s.wins}回</span></div>` : ''}
    </div>`, {
    continue: () => { A.unlock(); continueRun(); },
    new: () => {
      A.unlock();
      if (store.save) confirmDialog('進行中の培養を破棄して、はじめから始めますか？', '破棄して始める', newRun, showTitle);
      else newRun();
    },
    shelf: () => { A.unlock(); showShelf(showTitle); },
    rules: () => { A.unlock(); showRules(showTitle); },
    settings: () => { A.unlock(); showSettings(showTitle); },
  });
}

// ---------- layers ----------
function openLayer(kind, html, actions = {}) {
  layer.className = kind;
  layer.innerHTML = html;
  layer.hidden = false;
  layer.querySelectorAll('[data-act]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      A.sfx.ui();
      const fn = actions[el.dataset.act];
      if (fn) fn(el);
    });
  });
  const first = layer.querySelector('.btn.primary, .btn.ink, .btn');
  if (first && matchMedia('(hover: hover)').matches) first.focus({ preventScroll: true });
}
function closeLayer() { layer.hidden = true; layer.innerHTML = ''; layer.className = ''; }

function confirmDialog(msg, yes, onYes, onNo) {
  openLayer('dim', `<div class="panel menu-panel"><p style="margin:6px 0 16px">${msg}</p>
    <button class="btn ink" data-act="yes">${yes}</button><button class="btn" data-act="no">やめる</button></div>`,
  { yes: onYes, no: onNo });
}

function showRules(back) {
  openLayer('dim', `<div class="panel rules">${rulesHTML()}<div class="close-row"><button class="btn ink" data-act="close">閉じる</button></div></div>`, { close: back });
}

function showSettings(back) {
  const s = store.settings;
  const tg = (k, label) => `<div class="set-row"><span>${label}</span><button class="toggle" role="switch" aria-checked="${!!s[k]}" data-act="t_${k}" aria-label="${label}"></button></div>`;
  openLayer('dim', `<div class="panel">
    <h2>設定</h2>
    <div class="set-row"><span>音量</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" id="vol" aria-label="音量"></div>
    ${tg('music', '音楽')}
    ${tg('sfx', '効果音')}
    <div class="set-row"><span>培養の速さ</span><div class="seg"><button data-act="sp1" aria-pressed="${s.speed !== 2}">ふつう</button><button data-act="sp2" aria-pressed="${s.speed === 2}">はやい</button></div></div>
    ${tg('reduceMotion', '動きを減らす')}
    <div class="set-row"><span>記録と標本を消去</span><button class="btn danger" data-act="reset" style="min-height:38px">消去</button></div>
    ${store.persistent ? '' : '<p class="muted-note">このブラウザでは保存ができないため、記録は閉じると消えます。</p>'}
    <div class="close-row"><button class="btn ink" data-act="close">閉じる</button></div>
  </div>`, {
    t_music: el => flip('music', el),
    t_sfx: el => flip('sfx', el),
    t_reduceMotion: el => flip('reduceMotion', el),
    sp1: () => { store.setSetting('speed', 1); showSettings(back); },
    sp2: () => { store.setSetting('speed', 2); showSettings(back); },
    reset: () => confirmDialog('培養の記録・標本・進行中のデータをすべて消去しますか？', 'すべて消去', () => { store.resetAll(); applySettings(); showTitle(); }, () => showSettings(back)),
    close: back,
  });
  const vol = $('vol');
  vol.addEventListener('input', () => { store.setSetting('volume', Number(vol.value)); applySettings(); });
  function flip(k, el) {
    store.setSetting(k, !store.settings[k]);
    el.setAttribute('aria-checked', store.settings[k]);
    applySettings();
  }
}

function showShelf(back) {
  const sp = store.specimens;
  const date = t => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  openLayer('solid', `<div class="shelf">
    <header><h2>標本棚</h2><button class="btn" data-act="close">もどる</button></header>
    ${sp.length ? `<div class="grid">${sp.map((s, i) => `<figure class="${s.won ? 'won' : ''}" data-act="sp" data-i="${i}">
        <img src="${s.img}" alt="${s.days}日目までの皿">
        <figcaption><b>${s.won ? '完走' : `${DAY_NAME[Math.min(6, s.days)]}まで`}</b>${date(s.date)}・${s.strains.join('・')}</figcaption></figure>`).join('')}</div>`
    : '<div class="empty"><div class="ring"></div>まだ標本はありません。<br>培養を終えると、最後の皿がここに残ります。</div>'}
  </div>`, {
    close: back,
    sp: el => showSpecimen(sp[Number(el.dataset.i)], () => showShelf(back)),
  });
}

function showSpecimen(s, back) {
  openLayer('solid', `<div class="end-screen">
    <div class="specimen"><img src="${s.img}" alt=""><div class="label">${s.won ? '完走' : `${DAY_NAME[Math.min(6, s.days)]}まで`}<small>${new Date(s.date).toLocaleString('ja-JP')}</small></div></div>
    <div class="end-info">
      <h2>${s.won ? '七日間の記録' : '培養の記録'}</h2>
      ${historyBars(s.history)}
      <div class="lib">${s.strains.map((n, i) => `<span class="chip"><i style="background:${css(s.colors ? s.colors[i] : [200, 200, 200])}"></i>${n}</span>`).join('')}</div>
      <div class="row"><button class="btn" data-act="back">もどる</button></div>
    </div></div>`, { back });
}

function historyBars(history) {
  let h = '<div class="history">';
  for (let d = 0; d < P.DAYS; d++) {
    const v = history[d];
    const pass = v !== undefined && v >= P.TARGET[d];
    h += `<div class="b ${v === undefined ? '' : pass ? 'pass' : 'fail'}">
      ${v === undefined ? '' : `<i style="height:${Math.max(4, v * 100)}%;animation-delay:${d * 0.08}s"></i>`}
      <em style="bottom:${P.TARGET[d] * 100}%"></em><span>${d + 1}</span></div>`;
  }
  return h + '</div>';
}

// ---------- pause ----------
function pause() {
  // judgement is a short, timed sequence: pausing inside it would strand the result screens
  if (G.screen !== 'play' || ['end', 'reward', 'judge', 'idle'].includes(G.phase)) return;
  G.paused = true;
  const menu = () => openLayer('dim', `<div class="panel menu-panel">
    <h2>一時停止</h2>
    <button class="btn ink" data-act="resume">再開</button>
    <button class="btn" data-act="rules">遊び方</button>
    <button class="btn" data-act="settings">設定</button>
    <button class="btn" data-act="title">タイトルへ</button>
    <p class="muted-note" style="margin-top:8px">進行は滴下ごとに保存されています。</p></div>`, {
    resume,
    rules: () => showRules(menu),
    settings: () => showSettings(menu),
    title: () => { G.paused = false; showTitle(); },
  });
  menu();
}
function resume() {
  closeLayer();
  if (G.play) G.play.at = performance.now();
  G.paused = false;
}

// ---------- run flow ----------
function newRun() {
  store.clearSave();
  const seed = q.has('seed') ? P.hashSeed(q.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
  G.run = P.newRun(seed);
  G.run.day = 0;
  store.updateStats(s => { s.runs++; });
  enterPlay();
  beginDay();
}

function continueRun() {
  const sv = store.save;
  try {
    G.run = { ...sv.run, library: sv.run.library.map(s => ({ ...s, traits: [...s.traits] })), history: [...sv.run.history] };
    enterPlay();
    if (sv.phase === 'reward') {
      G.day = P.startDay(G.run);
      prepareDish();
      updateShare();
      showReward();
      return;
    }
    const day = P.startDay(G.run);
    if (sv.day) {
      day.cells.set(sv.day.cells);
      day.toxin.set(sv.day.toxin);
      day.rng = sv.day.rng;
      day.drop = sv.day.drop;
      day.gen = sv.day.gen;
      day.hand = sv.day.hand;
    }
    if (sv.phase === 'judge') {
      // the day's last drop was made before the page closed: show its result and judge
      G.day = day;
      prepareDish();
      dish.setCells(day.cells, day.toxin, day.strains, performance.now());
      dish.amt.set(dish.target);
      updateShare();
      judge();
      return;
    }
    beginDay(day);
  } catch (e) {
    console.warn('save could not be restored', e);
    store.clearSave();
    showTitle();
  }
}

function enterPlay() {
  closeLayer();
  clearTimers();
  G.screen = 'play';
  G.attract = null;
  G.play = null;
  app.dataset.screen = 'play';
}

function saveProgress(phase) {
  if (G.phase === 'end' || G.screen !== 'play') return;
  store.setSave({ v: 2, phase, run: packRun(G.run), day: phase === 'reward' ? null : packDay(G.day), at: Date.now() });
}

function prepareDish() {
  const d = G.day;
  dish.clear();
  dish.setStrains([...d.strains.values()]);
  dish.setEnv(d.env);
  dish.entries = d.entries;
  renderTop();
  renderDrops();
  renderHand();
  renderNotebook();
}

function beginDay(restored = null) {
  clearTimers();
  G.day = restored || P.startDay(G.run);
  G.selected = 0;
  G.fast = false;
  G.fx.glowTo = 0; G.fx.desatTo = 0;
  $('stamp').className = '';
  prepareDish();
  const now = performance.now();
  if (restored && restored.drop > 0) {
    dish.setCells(restored.cells, restored.toxin, restored.strains, now);
    dish.amt.set(dish.target);
  }
  dish.entryPreview = G.day.drop === 0;
  updateShare();
  G.envAnim = restored && restored.drop > 0 ? null : now;
  A.setMood('neutral');
  setPhase('intro');
  saveProgress('aim');
  A.sfx.plate();
  showDayCard();
  later(enterAim, 2300);
}

function showDayCard() {
  const d = G.day;
  const card = $('dayCard');
  const chip = t => `<span style="display:inline-flex;align-items:center;gap:3px">${TRAIT_ICON[t].replace('<svg', '<svg width="15" height="15"')}${TRAIT[t].name}</span>`;
  card.innerHTML = `<div class="d">${DAY_NAME[d.day]}</div>
    <div class="goal">皿の <b>${pct(P.TARGET[d.day])}</b> 以上を自分の菌に</div>
    <div class="foe">侵入株 ${INVADER.name}${d.invader.traits.map(chip).join('')}
      ${d.day === P.DAYS - 1 ? '<span>— あなたの菌に対抗してきた</span>' : ''}</div>
    ${d.drop ? `<div class="tap">滴下 残り ${P.DROPS - d.drop}</div>` : ''}`;
  card.className = 'show';
  card.onclick = () => { if (G.phase === 'intro') enterAim(); };
}

function setPhase(p) {
  G.phase = p;
  app.dataset.phase = p;
  $('hand').classList.toggle('wait', p !== 'aim');
  $('gen').classList.toggle('show', p === 'culture');
  $('speedBtn').classList.toggle('show', p === 'culture');
  $('speedBtn').classList.toggle('on', G.fast);
}

function enterAim() {
  if (G.phase !== 'intro') return;
  $('dayCard').className = '';
  setPhase('aim');
  renderHand();
  if (!store.flags.tutorialDone && G.day.day === 0) {
    if (G.day.drop === 0) coach(0);
    else if (G.day.drop === 1) coach(2);
  }
}

function drop(i) {
  if (G.screen !== 'play' || G.phase !== 'aim' || G.paused || i < 0 || G.day.env.bubble[i]) return;
  const id = G.day.hand[G.selected];
  const st = G.day.strains.get(id);
  dish.ghost = null;
  G.hover = -1;
  dish.entryPreview = false;
  dish.ripple(i, strainRGB(st), 0.9);
  A.sfx.drop();
  const frames = P.playDrop(G.day, id, i, true);
  // the outcome is decided now, so save it now: reloading mid-culture must not undo a bad drop
  if (!P.dayOver(G.day)) P.dealHand(G.day, G.run);
  setGen(0);
  setPhase('culture');
  saveProgress(P.dayOver(G.day) ? 'judge' : 'aim');
  coachEvent('drop');
  startPlayback(frames, { bloom: i, onDone: () => later(finishDrop, 250) });
}

function finishDrop() {
  renderDrops();
  if (!P.dayOver(G.day)) {
    G.selected = 0;
    G.fast = false;
    setPhase('intro');
    enterAim();
    return;
  }
  judge();
}

function judge() {
  setPhase('judge');
  const d = G.day;
  const share = P.shares(d).mine;
  const passed = share >= P.TARGET[d.day];
  G.run.history.push(share);
  renderTop();
  const stamp = $('stamp');
  stamp.innerHTML = `${passed ? '培養成功' : '培養失敗'}<small>${pct(share)} / ${pct(P.TARGET[d.day])}</small>`;
  later(() => {
    stamp.className = `show ${passed ? 'pass' : 'fail'}`;
    if (passed) { G.fx.glowTo = 1; A.sfx.pass(); A.setMood('bright'); }
    else { G.fx.desatTo = 0.75; A.sfx.fail(); A.setMood('dark'); }
  }, 450);
  if (passed) store.updateStats(s => { s.daysCleared++; s.bestDay = Math.max(s.bestDay, d.day + 1); });
  later(() => {
    if (!passed) endRun(false);
    else if (d.day >= P.DAYS - 1) endRun(true);
    else showReward();
  }, 2400);
}

function showReward() {
  G.paused = false;
  setPhase('reward');
  saveProgress('reward');
  const d = G.day;
  const offers = P.offerRewards(G.run);
  const share = G.run.history[G.run.history.length - 1];
  const offerHTML = (o, k) => {
    if (o.type === 'new') {
      const st = P.makeStrain(-1, 'p', o.traits, G.run.nextPal % P.PALETTE_SIZE);
      return `<button class="offer" data-act="pick" data-k="${k}" style="animation-delay:${0.1 + k * 0.09}s">
        <span class="kind new">新しい株</span>
        <div class="vial"><img src="${swatchURL(strainRGB(st), 54, st.pal + 3)}" width="54" height="54" alt=""><span class="nm">${o.traits.map(t => TRAIT[t].name).join('・')}<small>「${strainName(st)}」として加わる</small></span></div>
        <div class="desc">${o.traits.map(traitLine).join('')}</div></button>`;
    }
    const st = G.run.library.find(s => s.id === o.strain);
    return `<button class="offer" data-act="pick" data-k="${k}" style="animation-delay:${0.1 + k * 0.09}s">
      <span class="kind">接ぎ木</span>
      <div class="vial"><img src="${swatchURL(strainRGB(st), 54, st.pal + 1)}" width="54" height="54" alt=""><span class="nm">${strainName(st)}</span><span class="arrow">＋</span>${TRAIT_ICON[o.trait].replace('<svg', '<svg width="30" height="30"')}</div>
      <div class="desc"><div style="margin-bottom:4px">いま：${traitNames(st)}</div>${traitLine(o.trait)}</div></button>`;
  };
  openLayer('dim', `<div class="reward-screen">
      <div class="kicker">${DAY_NAME[d.day]} 通過<small>${pct(share)} / 目標 ${pct(P.TARGET[d.day])}</small></div>
      <p class="lead">${DAY_NAME[d.day + 1]}に向けて、ひとつ選ぶ</p>
      <div class="offers">${offers.map(offerHTML).join('')}</div>
      <div class="library-strip">手持ちの株 ${G.run.library.map(st => `<span class="chip"><i style="background:${css(strainRGB(st))}"></i>${strainName(st)}・${traitNames(st)}</span>`).join('')}</div>
    </div>`, {
    pick: el => {
      if (el.dataset.done) return;
      layer.querySelectorAll('.offer').forEach(b => { b.dataset.done = 1; });
      A.sfx.reward();
      el.classList.add('picked');
      later(() => {
        P.applyReward(G.run, offers[Number(el.dataset.k)]);
        G.run.day++;
        closeLayer();
        beginDay();
      }, 480);
    },
  });
}

function endRun(won) {
  clearTimers();
  G.play = null;
  G.paused = false;
  setPhase('end');
  const r = G.run;
  const days = won ? P.DAYS : r.day;
  const img = dish.snapshot(240);
  store.addSpecimen({
    img, date: Date.now(), days, won, seed: r.seed, history: [...r.history],
    strains: r.library.map(strainName), colors: r.library.map(strainRGB),
  });
  store.updateStats(s => { if (won) s.wins++; });
  store.clearSave();
  if (won) A.sfx.win();
  const last = r.history[r.history.length - 1];
  const why = won
    ? `七日間すべての皿で目標を超えた。最後の侵入株は ${traitNames(G.day.invader)} だった。`
    : `${DAY_NAME[r.day]}、自分の菌は ${pct(last)}。目標の ${pct(P.TARGET[r.day])} に届かなかった。`;
  openLayer('solid', `<div class="end-screen">
      <div class="specimen"><img src="${img}" alt="最後の皿"><div class="label">${won ? '完走' : `${DAY_NAME[r.day]}まで`}<small>No.${String(store.stats.runs).padStart(3, '0')}</small></div></div>
      <div class="end-info">
        <h2>${won ? '七日間、守り抜いた' : `${DAY_NAME[r.day]}で途絶えた`}</h2>
        <p class="why">${why}</p>
        ${historyBars(r.history)}
        <div class="lib">${r.library.map(st => `<span class="chip"><i style="background:${css(strainRGB(st))}"></i>${strainName(st)}・${traitNames(st)}</span>`).join('')}</div>
        <div class="row"><button class="btn primary" data-act="again">もう一度</button><button class="btn" data-act="shelf">標本棚</button><button class="btn ghost" data-act="title">タイトル</button></div>
      </div></div>`, {
    again: newRun,
    shelf: () => showShelf(showTitle),
    title: showTitle,
  });
}

// ---------- aiming ----------
function updateGhost() {
  if (G.screen !== 'play' || G.phase !== 'aim' || G.hover < 0) { dish.ghost = null; return; }
  const st = G.day.strains.get(G.day.hand[G.selected]);
  dish.ghost = { cells: dish.footprint(G.day, G.hover), rgb: strainRGB(st) };
}

// Press to aim (the ghost shows where the drop lands), drag to adjust, release to drop.
// On touch the browser fires pointerleave after every tap, so aiming must not depend on hover.
const fxCanvas = $('dishFX');
fxCanvas.addEventListener('pointermove', e => {
  if (G.pressing || e.pointerType === 'mouse') G.hover = dish.cellAt(e.clientX, e.clientY);
});
fxCanvas.addEventListener('pointerleave', () => { if (!G.pressing) G.hover = -1; });
fxCanvas.addEventListener('pointerdown', e => {
  A.unlock();
  if (G.screen !== 'play') return;
  if (G.phase === 'intro') { enterAim(); return; }
  if (G.phase === 'culture') { toggleFast(true); return; }
  if (G.phase !== 'aim') return;
  G.pressing = true;
  fxCanvas.setPointerCapture(e.pointerId);
  G.hover = dish.cellAt(e.clientX, e.clientY);
  A.sfx.aim();
});
fxCanvas.addEventListener('pointerup', e => {
  if (!G.pressing) return;
  G.pressing = false;
  const i = G.hover;
  if (e.pointerType !== 'mouse') G.hover = -1;
  drop(i);
});
fxCanvas.addEventListener('pointercancel', () => { G.pressing = false; G.hover = -1; });

function toggleFast(on = !G.fast) {
  G.fast = on;
  $('speedBtn').classList.toggle('on', G.fast);
}

// ---------- coach marks (first run) ----------
const COACH = [
  { el: '#hand', text: 'これが手札。あなたの菌が3つある。名前の下に<b>特徴</b>が書いてある。まず1枚選ぼう。', next: 'select', btn: '次へ' },
  { el: '#dishWrap', text: '<b>皿を押すと落ちる場所が光り、離すと一滴</b>落ちる。紫に光る縁から<b>侵入株</b>が入ってくる。その近くで食い止めるか、離れて育てるか。', next: 'drop' },
  { el: '#shareBar', text: 'このバーが皿の取り分。左の色が自分、右の暗い帯が侵入株。<b>3滴落とした時点で白い目標線を超えていれば</b>、その日はクリア。', btn: 'わかった' },
  { el: () => (wideQuery.matches ? '#notebook' : '#notesBtn'), text: '<b>観察ノート</b>で、皿にいる菌の割合・侵入株の特徴・今日の皿の環境をいつでも確かめられる。', btn: 'はじめる', last: true },
];

function coach(step) {
  G.coach = step;
  coachEl.hidden = false;
  const c = COACH[step];
  coachEl.innerHTML = `<div class="hole"></div><div class="tip"><div class="step">${step + 1} / ${COACH.length}</div><div>${c.text}</div>
    ${c.btn ? `<div class="row"><button class="btn ${c.last ? 'ink' : ''}">${c.btn}</button></div>` : ''}</div>`;
  const b = coachEl.querySelector('.btn');
  if (b) b.addEventListener('click', () => { A.sfx.ui(); coachNext(); });
  positionCoach();
}

function coachNext() {
  const step = G.coach;
  if (step === null) return;
  if (COACH[step].last) { store.setFlag('tutorialDone', true); closeCoach(); return; }
  if (step === 0) { coach(1); return; }
  if (step === 2) { coach(3); return; }
  closeCoach();
}

function coachEvent(kind) {
  if (G.coach === null || COACH[G.coach].next !== kind) return;
  if (G.coach === 0) coach(1);
  else if (G.coach === 1) closeCoach();
}

function closeCoach() {
  coachEl.hidden = true;
  coachEl.innerHTML = '';
  G.coach = null;
}

function positionCoach() {
  if (G.coach === null || coachEl.hidden) return;
  const c = COACH[G.coach];
  const sel = typeof c.el === 'function' ? c.el() : c.el;
  const target = document.querySelector(sel);
  if (!target) return;
  let r = target.getBoundingClientRect();
  let pad = 8;
  if (sel === '#dishWrap') {
    // hug the dish itself, not its square frame
    const k = DISH_R / (DISH_R + 1.7);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, half = (r.width / 2) * k;
    r = { left: cx - half, top: cy - half, width: half * 2, height: half * 2, right: cx + half, bottom: cy + half };
    pad = 4;
  }
  const hole = coachEl.querySelector('.hole');
  Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: sel === '#dishWrap' ? '50%' : '14px' });
  const tip = coachEl.querySelector('.tip');
  const tw = Math.min(320, window.innerWidth - 32);
  tip.style.left = `${Math.max(16, Math.min(window.innerWidth - tw - 16, r.left + r.width / 2 - tw / 2))}px`;
  const below = window.innerHeight - r.bottom;
  if (below > 170) { tip.style.top = `${r.bottom + pad + 10}px`; tip.style.bottom = ''; }
  else if (r.top > 170) { tip.style.top = ''; tip.style.bottom = `${window.innerHeight - r.top + pad + 10}px`; }
  else { tip.style.bottom = ''; tip.style.top = `${r.top + 12}px`; } // no room around a big target: sit on its top edge
}

// ---------- buttons & keys ----------
$('menuBtn').innerHTML = UI_ICON.menu;
$('notesBtn').innerHTML = UI_ICON.notes;
$('speedBtn').innerHTML = UI_ICON.fast;
$('menuBtn').addEventListener('click', () => { A.unlock(); A.sfx.ui(); pause(); });
$('notesBtn').addEventListener('click', () => {
  A.unlock();
  A.sfx.ui();
  $('notebook').classList.toggle('open');
  if (G.coach === 3) coachNext();
});
document.addEventListener('pointerdown', e => {
  const nb = $('notebook');
  if (nb.classList.contains('open') && !nb.contains(e.target) && !e.target.closest('#notesBtn')) nb.classList.remove('open');
});
$('notebook').addEventListener('click', e => { if (e.target.closest('.sheet-handle')) $('notebook').classList.remove('open'); });
$('speedBtn').addEventListener('click', () => { A.sfx.ui(); toggleFast(); });

const KEY_STEP = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
window.addEventListener('keydown', e => {
  A.unlock();
  if (e.key === 'Escape') {
    if (G.screen === 'play' && G.paused) resume();
    else if (G.screen === 'play' && layer.hidden) pause();
    return;
  }
  if (!layer.hidden || G.screen !== 'play') return;
  if (['1', '2', '3'].includes(e.key) && G.phase === 'aim') selectCard(Number(e.key) - 1);
  // keyboard aiming: arrows move the cursor across the hex grid, Enter drops
  if (G.phase === 'aim' && KEY_STEP[e.key]) {
    e.preventDefault();
    const c = P.CELLS[G.hover >= 0 ? G.hover : P.idx(0, 0)];
    const [dq, dr] = KEY_STEP[e.key];
    const n = P.idx(c.q + dq, c.r + dr);
    G.hover = n >= 0 ? n : P.CELLS.indexOf(c);
  }
  if (e.key === 'Enter' && G.phase === 'aim' && G.hover >= 0) { e.preventDefault(); drop(G.hover); }
  if (e.key === ' ') {
    e.preventDefault();
    if (G.phase === 'intro') enterAim();
    else if (G.phase === 'culture') toggleFast();
  }
});

// leaving the tab mid-day should not skip what the player wanted to watch
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.screen === 'play' && !G.paused && (G.phase === 'culture' || G.phase === 'aim')) pause();
});

// ---------- debug hooks for automated checks ----------
if (DEBUG) {
  window.__petri = {
    state: () => ({ screen: G.screen, phase: G.phase, day: G.day?.day, drop: G.day?.drop, history: G.run?.history, kind: dish.kind, coach: G.coach, paused: G.paused, layer: !layer.hidden }),
    drop: i => drop(i),
    select: k => selectCard(k),
    // jump straight to the end of a run (to check the end screens)
    finish: won => {
      if (!G.run) return;
      while (G.run.history.length < (won ? P.DAYS : 2)) G.run.history.push(won ? 0.6 : 0.5);
      if (!won) G.run.history[G.run.history.length - 1] = 0.2;
      G.run.day = won ? P.DAYS - 1 : 1;
      endRun(won);
    },
    cellXY: i => {
      // client coordinates of a cell centre, for driving real pointer events
      const r = fxCanvas.getBoundingClientRect();
      const [x, y] = P.pos(P.CELLS[i]);
      return [r.left + r.width / 2 + x * dish.unit, r.top + r.height / 2 + y * dish.unit];
    },
    bestCell: () => {
      // cheap planner for tests: try a spread of cells, keep the best share
      let best = 60, bs = -1;
      for (let i = 0; i < P.N; i += 2) {
        if (G.day.env.bubble[i]) continue;
        const c = P.clone(G.day);
        P.playDrop(c, G.day.hand[G.selected], i);
        const s = P.shares(c).mine;
        if (s > bs) { bs = s; best = i; }
      }
      return best;
    },
  };
}

// ---------- boot ----------
applySettings();
sizeDish();
requestAnimationFrame(sizeDish);
if (document.fonts) document.fonts.ready.then(sizeDish);
showTitle();
requestAnimationFrame(frame);
