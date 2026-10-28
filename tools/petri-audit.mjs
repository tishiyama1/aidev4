// Usability audit for シャーレ on iPhone-sized screens: things a first-time player trips over that a
// script can catch — undersized tap targets, tiny text, overflow, a tutorial tip that hides what it explains,
// buttons pushed off-screen on a small phone. It complements, and does not replace, watching real people play
// (docs/petri-playtest.md).
// usage: node tools/petri-audit.mjs [base-url] [screenshot-dir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }

const base = process.argv[2] || 'http://localhost:8123/petri/';
const out = process.argv[3] || '.';
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const DEVICES = [
  { name: 'SE', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, safe: { t: 20, b: 0 } },
  { name: '13', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, safe: { t: 47, b: 34 } },
  { name: 'ProMax', viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, safe: { t: 59, b: 34 } },
];

const problems = [];
const note = (dev, msg) => { problems.push(`[${dev}] ${msg}`); console.log(`  ✗ ${msg}`); };
const ok = msg => console.log(`  ✓ ${msg}`);

// every visible interactive element, with its size and text size
const SCAN = () => {
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const label = e => (e.getAttribute('aria-label') || e.textContent || e.className || e.id || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 24);
  const targets = [...document.querySelectorAll('button, a.btn, input[type=range], .card, .offer')].filter(vis).map(e => {
    const r = e.getBoundingClientRect();
    return { label: label(e), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), top: Math.round(r.top) };
  });
  const smallText = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    const e = n.parentElement;
    if (!e || !vis(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 11) smallText.push({ text: n.textContent.trim().slice(0, 20), fs });
  }
  return {
    targets, smallText,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    vw: innerWidth, vh: innerHeight,
  };
};

async function audit(page, dev, where, { strictTargets = true } = {}) {
  const r = await page.evaluate(SCAN);
  const small = r.targets.filter(t => t.w < 44 || t.h < 44);
  if (strictTargets && small.length) note(dev.name, `${where}: tap targets under 44pt: ${small.map(t => `${t.label} ${t.w}x${t.h}`).join(', ')}`);
  const off = r.targets.filter(t => t.right > r.vw + 1 || t.left < -1 || t.bottom > r.vh + 1);
  if (off.length) note(dev.name, `${where}: controls off-screen: ${off.map(t => `${t.label} (right ${t.right}, bottom ${t.bottom})`).join(', ')}`);
  if (r.smallText.length) note(dev.name, `${where}: text under 11px: ${[...new Set(r.smallText.map(t => `"${t.text}" ${t.fs}px`))].slice(0, 4).join(', ')}`);
  if (r.overflowX) note(dev.name, `${where}: page scrolls horizontally`);
  return r;
}

for (const dev of DEVICES) {
  console.log(`\n== iPhone ${dev.name} (${dev.viewport.width}x${dev.viewport.height}) ==`);
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?debug`);
  await page.addStyleTag({ content: `:root{--safe-t:${dev.safe.t}px;--safe-b:${dev.safe.b}px}` });
  await page.waitForTimeout(1500);

  // title: every button reachable without scrolling
  await audit(page, dev, 'title');
  await page.screenshot({ path: `${out}/a-${dev.name}-title.png` });

  // a brand-new player: tutorial driven by real taps only
  await page.tap('[data-act="new"]');
  await page.waitForFunction(() => window.__petri.state().phase === 'aim', null, { timeout: 20000 });
  await page.waitForTimeout(600);
  let tipsOK = true;
  for (let step = 0; step < 4; step++) {
    const c = await page.evaluate(() => window.__petri.state().coach);
    if (c === null) break;
    await page.waitForTimeout(600); // let the tip finish its entrance animation before measuring it
    const geo = await page.evaluate(() => {
      const tip = document.querySelector('#coach .tip').getBoundingClientRect();
      const hole = document.querySelector('#coach .hole').getBoundingClientRect();
      return { tip: { l: tip.left, t: tip.top, r: tip.right, b: tip.bottom }, hole: { l: hole.left, t: hole.top, r: hole.right, b: hole.bottom }, vw: innerWidth, vh: innerHeight };
    });
    const inside = geo.tip.l >= 0 && geo.tip.t >= 0 && geo.tip.r <= geo.vw && geo.tip.b <= geo.vh;
    const overlap = !(geo.tip.r <= geo.hole.l || geo.tip.l >= geo.hole.r || geo.tip.b <= geo.hole.t || geo.tip.t >= geo.hole.b);
    // the dish step may overlap by design (the tip sits on the dish's edge); the others must not hide their target
    if (!inside) { note(dev.name, `tutorial step ${step + 1}: the tip runs off-screen`); tipsOK = false; }
    if (overlap && c !== 1) { note(dev.name, `tutorial step ${step + 1}: the tip covers the thing it explains`); tipsOK = false; }
    await page.screenshot({ path: `${out}/a-${dev.name}-coach${step + 1}.png` });
    if (c === 0) await page.tap('#coach .btn');
    else if (c === 1) {
      const cell = await page.evaluate(() => window.__petri.bestCell());
      const [x, y] = await page.evaluate(i => window.__petri.cellXY(i), cell);
      await page.touchscreen.tap(x, y);
      await page.waitForFunction(() => window.__petri.state().phase === 'aim', null, { timeout: 60000 });
      await page.waitForTimeout(700);
    } else await page.tap('#coach .btn');
    await page.waitForTimeout(350);
  }
  if (tipsOK) ok('the 4-step tutorial fits on screen and can be finished with taps alone');
  const left = await page.evaluate(() => window.__petri.state().coach);
  if (left !== null) note(dev.name, 'the tutorial did not finish after four taps');

  // the play screen
  await page.waitForTimeout(500);
  const play = await audit(page, dev, 'play screen');
  const dishBox = await page.evaluate(() => { const r = document.getElementById('dishWrap').getBoundingClientRect(); return Math.round(r.width); });
  if (dishBox < 300) note(dev.name, `play screen: the dish is only ${dishBox}px wide`); else ok(`the dish is ${dishBox}px wide`);
  await page.screenshot({ path: `${out}/a-${dev.name}-play.png` });

  // notebook sheet, pause menu, settings, rules
  await page.tap('#notesBtn');
  await page.waitForTimeout(600);
  await audit(page, dev, 'notebook', { strictTargets: false });
  await page.screenshot({ path: `${out}/a-${dev.name}-notebook.png` });
  await page.tap('#notebook .sheet-handle');
  await page.waitForTimeout(300);
  await page.tap('#menuBtn');
  await page.waitForTimeout(300);
  await audit(page, dev, 'pause menu');
  await page.tap('[data-act="settings"]');
  await page.waitForTimeout(300);
  await audit(page, dev, 'settings');
  await page.screenshot({ path: `${out}/a-${dev.name}-settings.png` });
  await page.tap('[data-act="close"]');
  await page.tap('[data-act="rules"]');
  await page.waitForTimeout(300);
  await audit(page, dev, 'rules', { strictTargets: false });
  await page.screenshot({ path: `${out}/a-${dev.name}-rules.png` });
  await page.tap('[data-act="close"]');
  await page.tap('[data-act="resume"]');

  // reward and end screens
  await page.evaluate(() => { window.__petri.finish(false); });
  await page.waitForTimeout(1200);
  await audit(page, dev, 'end screen');
  await page.screenshot({ path: `${out}/a-${dev.name}-end.png` });

  if (errors.length) note(dev.name, `console errors: ${errors.join(' | ')}`);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} issue(s) found` : '\nno issues found');
process.exit(problems.length ? 1 : 0);
