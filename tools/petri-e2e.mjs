// End-to-end checks for シャーレ in headless Chromium (WebGL via SwiftShader).
// usage: node tools/petri-e2e.mjs <base-url> <screenshot-dir>
// Drives real pointer events: title → tutorial → full run → rewards → end → shelf,
// then resume-after-reload on a phone viewport, and the 2D fallback.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const { chromium, devices } = pw;

const [base = 'http://localhost:8123/petri/', out = '.'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures.push(msg); };

async function open(ctxOpts, query) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + query);
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}
const st = page => page.evaluate(() => window.__petri.state());
const waitPhase = (page, phases, timeout = 20000) =>
  page.waitForFunction(ps => ps.includes(window.__petri.state().phase), phases, { timeout });

async function pointerDrop(page, touch) {
  const cell = await page.evaluate(() => window.__petri.bestCell());
  const [x, y] = await page.evaluate(i => window.__petri.cellXY(i), cell);
  if (touch) await page.touchscreen.tap(x, y);
  else { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); }
}

// ---------- 1. desktop: tutorial and a full run ----------
{
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 } }, '?debug');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/d01-title.png` });
  check((await st(page)).screen === 'title', 'title screen shows on boot');
  check((await st(page)).kind === 'gl', 'WebGL dish renderer active');
  await page.click('[data-act="new"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/d02-daycard.png` });
  await waitPhase(page, ['aim']);
  await page.waitForTimeout(500);
  check((await st(page)).coach === 0, 'tutorial step 1 appears on the first run');
  await page.screenshot({ path: `${out}/d03-coach1.png` });
  await page.click('#hand .card:nth-child(2)');
  await page.waitForTimeout(400);
  check((await st(page)).coach === 1, 'selecting a card advances the tutorial');
  await page.screenshot({ path: `${out}/d04-coach2.png` });
  // hover to show the aiming ghost
  const cell = await page.evaluate(() => window.__petri.bestCell());
  const [hx, hy] = await page.evaluate(i => window.__petri.cellXY(i), cell);
  await page.mouse.move(hx, hy);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/d05-aim.png` });
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(1400);
  check((await st(page)).phase === 'culture', 'a real click drops and starts the culture');
  await page.screenshot({ path: `${out}/d06-culture.png` });
  await waitPhase(page, ['aim']);
  await page.waitForTimeout(500);
  check((await st(page)).coach === 2, 'tutorial explains the share bar after the first drop');
  await page.screenshot({ path: `${out}/d07-coach3.png` });
  await page.click('#coach .btn');
  await page.waitForTimeout(300);
  await page.click('#coach .btn');
  await page.waitForTimeout(300);
  check((await st(page)).coach === null, 'tutorial completes');

  // play on at test speed
  await page.goto(base + '?debug&fast');
  await page.waitForTimeout(600);
  await page.click('[data-act="continue"]');
  let rewards = 0, guard = 0;
  for (;;) {
    if (++guard > 80) { check(false, 'run finishes within the step budget'); break; }
    await waitPhase(page, ['aim', 'reward', 'end'], 30000);
    const s = await st(page);
    if (s.phase === 'end') break;
    if (s.phase === 'reward') {
      await page.waitForSelector('.offer');
      if (rewards === 0) { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/d08-reward.png` }); }
      rewards++;
      await page.click('.offer');
      await page.waitForFunction(() => window.__petri.state().phase !== 'reward', null, { timeout: 10000 });
      continue;
    }
    await pointerDrop(page, false);
    await page.waitForFunction(() => window.__petri.state().phase !== 'aim', null, { timeout: 5000 });
  }
  const end = await st(page);
  check(end.phase === 'end', `run reaches the end screen (days recorded: ${end.history.length}, rewards: ${rewards})`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/d09-end.png` });
  await page.click('[data-act="shelf"]');
  await page.waitForTimeout(600);
  check(await page.locator('.shelf figure').count() >= 1, 'the finished run is on the specimen shelf');
  await page.screenshot({ path: `${out}/d10-shelf.png` });
  check(errors.length === 0, `desktop: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}

// ---------- 2. phone: touch, notebook, pause, settings, resume after reload ----------
{
  const { ctx, page, errors } = await open({ ...devices['iPhone 13'] }, '?debug');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/m01-title.png` });
  await page.tap('[data-act="new"]');
  await waitPhase(page, ['aim']);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/m02-coach.png` });
  // skip the tutorial quickly for this pass
  await page.evaluate(() => document.querySelectorAll('#coach .btn').forEach(b => b.click()));
  await pointerDrop(page, true);
  await page.waitForTimeout(1200);
  check((await st(page)).phase === 'culture', 'phone: a tap drops');
  await page.screenshot({ path: `${out}/m03-culture.png` });
  await waitPhase(page, ['aim']);
  await page.evaluate(() => document.querySelectorAll('#coach .btn').forEach(b => b.click()));
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll('#coach .btn').forEach(b => b.click()));
  await page.tap('#notesBtn');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/m04-notebook.png` });
  await page.tap('#notebook .sheet-handle');
  await page.waitForTimeout(400);
  await page.tap('#menuBtn');
  await page.waitForTimeout(300);
  check((await st(page)).paused, 'phone: menu pauses the game');
  await page.tap('[data-act="settings"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/m05-settings.png` });
  await page.tap('[data-act="t_music"]');
  await page.tap('[data-act="close"]');
  await page.waitForTimeout(200);
  await page.tap('[data-act="rules"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/m06-rules.png` });
  await page.tap('[data-act="close"]');
  await page.tap('[data-act="resume"]');
  const before = await st(page);
  await page.reload();
  await page.waitForTimeout(1200);
  const music = await page.evaluate(() => JSON.parse(localStorage.getItem('petri.v2')).settings.music);
  check(music === false, 'settings persist across reload');
  await page.tap('[data-act="continue"]');
  await waitPhase(page, ['aim']);
  const after = await st(page);
  check(after.day === before.day && after.drop === before.drop, `resume restores day/drop (${before.day}/${before.drop} → ${after.day}/${after.drop})`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/m07-resumed.png` });
  check(errors.length === 0, `phone: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}

// ---------- 3. 2D fallback ----------
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?debug&nogl&fast');
  await page.evaluate(() => localStorage.setItem('petri.v2', JSON.stringify({ flags: { tutorialDone: true } })));
  await page.reload();
  await page.waitForTimeout(700);
  check((await st(page)).kind === '2d', 'fallback renderer used with ?nogl');
  await page.click('[data-act="new"]');
  await waitPhase(page, ['aim']);
  await pointerDrop(page, false);
  await waitPhase(page, ['aim']);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/f01-fallback.png` });
  check(errors.length === 0, `fallback: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}

// ---------- 4. resume on the reward choice, keyboard pause, the win screen ----------
// fixed seed so the planner reliably clears day 1 and the reward checks always run
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?debug&fast&seed=e2e-4');
  await page.evaluate(() => localStorage.setItem('petri.v2', JSON.stringify({ flags: { tutorialDone: true } })));
  await page.reload();
  await page.waitForTimeout(600);
  await page.click('[data-act="new"]');
  // play day 1 until either the reward choice or the end
  for (let k = 0; k < 6; k++) {
    await waitPhase(page, ['aim', 'reward', 'end'], 30000);
    const s = await st(page);
    if (s.phase !== 'aim') break;
    await pointerDrop(page, false);
    await page.waitForFunction(() => window.__petri.state().phase !== 'aim', null, { timeout: 5000 });
  }
  const s1 = await st(page);
  if (s1.phase === 'reward') {
    await page.reload();
    await page.waitForTimeout(600);
    const label = await page.textContent('[data-act="continue"]');
    check(label.includes('選択中'), 'title offers to continue at the reward choice');
    await page.click('[data-act="continue"]');
    await page.waitForTimeout(500);
    check((await st(page)).phase === 'reward' && (await page.locator('.offer').count()) === 3, 'resume lands back on the three reward offers');
    await page.click('.offer');
    await waitPhase(page, ['aim'], 15000);
    check((await st(page)).day === 1, 'picking a reward starts day 2');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check((await st(page)).paused, 'Escape pauses');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(!(await st(page)).paused, 'Escape resumes');
    await page.keyboard.press('2');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check((await st(page)).phase === 'culture', 'keyboard: number selects, arrows aim, Enter drops');
  } else {
    check(false, 'the fixed seed clears day 1 so the reward checks can run');
  }
  await page.evaluate(() => window.__petri.finish(true));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/w01-win.png` });
  check((await page.textContent('.end-info h2')).includes('守り抜いた'), 'win screen shows');
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('petri.v2')).stats);
  check(stats.wins === 1, 'a win is recorded in the stats');
  await page.click('[data-act="title"]');
  await page.waitForTimeout(800);
  check(!(await page.locator('[data-act="continue"]').count()), 'no stale save after a finished run');
  await page.screenshot({ path: `${out}/w02-title-after.png` });
  await page.click('[data-act="new"]');
  await waitPhase(page, ['aim'], 15000);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('petri.v2')).save);
  check(saved && saved.run.day === 0, 'a new run after a finished one is saved again');
  check(errors.length === 0, `misc: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}

// ---------- 5. reloading mid-culture does not undo the drop ----------
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?debug');
  await page.evaluate(() => localStorage.setItem('petri.v2', JSON.stringify({ flags: { tutorialDone: true } })));
  await page.reload();
  await page.waitForTimeout(600);
  await page.click('[data-act="new"]');
  await waitPhase(page, ['aim']);
  await pointerDrop(page, false);
  await page.waitForTimeout(400);
  check((await st(page)).phase === 'culture', 'culture running before the reload');
  await page.reload();
  await page.waitForTimeout(700);
  await page.click('[data-act="continue"]');
  await waitPhase(page, ['aim']);
  check((await st(page)).drop === 1, 'reloading mid-culture keeps the drop (no free retry)');
  check(errors.length === 0, `reload: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}

// ---------- 6. iOS shell contract: Capacitor Preferences + Haptics, offline, safe areas ----------
// A mock Capacitor stands in for the native bridge. This checks that the game calls the plugins the way
// the real ones expect; it does not replace a run on a device.
{
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
  await ctx.addInitScript(() => {
    const PREF = 'mock.prefs.';
    window.__haptic = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        Preferences: {
          get: async ({ key }) => ({ value: localStorage.getItem(PREF + key) }),
          set: async ({ key, value }) => { localStorage.setItem(PREF + key, value); },
          remove: async ({ key }) => { localStorage.removeItem(PREF + key); },
        },
        Haptics: {
          impact: async o => { window.__haptic.push(['impact', o.style]); },
          notification: async o => { window.__haptic.push(['notification', o.type]); },
        },
        App: { addListener: () => {} },
      },
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  const hosts = new Set();
  page.on('request', r => { try { const u = new URL(r.url()); if (!['data:', 'blob:'].includes(u.protocol)) hosts.add(u.host); } catch { /* ignore */ } });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug');
  await page.evaluate(() => localStorage.setItem('petri.v2', JSON.stringify({ flags: { tutorialDone: true } })));
  await page.reload();
  await page.waitForTimeout(900);

  // offline-capable: nothing but the app's own origin, and the bundled fonts really loaded
  const loaded = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight}`); });
  check(loaded.some(f => f.includes('Shippori Mincho')) && loaded.some(f => f.includes('Zen Kaku')), `bundled fonts load (${loaded.length} faces)`);
  check([...hosts].every(h => h.startsWith('localhost')), `only the app's own files are requested (${[...hosts].join(', ')})`);
  // every character the game can show must exist in the bundled fonts, or it silently falls back to another font
  const fc = (await import('child_process')).spawnSync('python3', ['tools/build-fonts.py', '--check'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  if (fc.error) console.log('note: python3 not available; font coverage not checked');
  else check(fc.status === 0, `bundled fonts cover all the game's text ${fc.status === 0 ? '' : fc.stdout.slice(0, 160)}`);

  // safe areas: simulate the Dynamic Island / home indicator insets
  await page.addStyleTag({ content: ':root{--safe-t:59px;--safe-b:34px}' });
  await page.click('[data-act="new"]');
  await waitPhase(page, ['aim']);
  await page.waitForTimeout(400);
  const geo = await page.evaluate(() => ({ top: document.getElementById('top').getBoundingClientRect().top, topPad: parseFloat(getComputedStyle(document.getElementById('top')).paddingTop), consoleBottom: document.getElementById('console').getBoundingClientRect().bottom, h: innerHeight, btn: document.getElementById('menuBtn').getBoundingClientRect().top }));
  check(geo.btn >= 59, `top controls sit below the status bar inset (menu button at y=${Math.round(geo.btn)})`);
  check(geo.consoleBottom <= geo.h && geo.h - geo.consoleBottom >= 0, 'hand and share bar stay inside the screen');
  await page.screenshot({ path: `${out}/n01-safearea.png` });

  // haptics: select, aim, drop, then the verdict
  await page.evaluate(() => { window.__haptic.length = 0; });
  await page.evaluate(() => window.__petri.select(1));
  const cell = await page.evaluate(() => window.__petri.bestCell());
  const [x, y] = await page.evaluate(i => window.__petri.cellXY(i), cell);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(500);
  const hz = await page.evaluate(() => window.__haptic);
  check(hz.some(h => h[0] === 'impact' && h[1] === 'MEDIUM'), 'dropping fires a medium impact');
  check(hz.some(h => h[0] === 'impact' && h[1] === 'LIGHT'), 'choosing and aiming fire a light impact');

  // preferences hold the save; iOS purging localStorage must not lose progress
  const prefSave = await page.evaluate(() => JSON.parse(localStorage.getItem('mock.prefs.petri.v2')).save);
  check(prefSave && prefSave.run.day === 0, 'progress is written to Capacitor Preferences');
  await page.evaluate(() => localStorage.removeItem('petri.v2'));
  await page.reload();
  await page.waitForTimeout(900);
  check((await page.locator('[data-act="continue"]').count()) === 1, 'after localStorage is purged the run is restored from Preferences');
  await page.click('[data-act="continue"]');
  await waitPhase(page, ['aim']);
  check((await st(page)).drop === 1, 'the restored run keeps the drop that was made');

  // the settings toggle silences haptics
  await page.evaluate(() => { window.__haptic.length = 0; });
  await page.tap('#menuBtn');
  await page.tap('[data-act="settings"]');
  await page.tap('[data-act="t_haptics"]');
  await page.evaluate(() => { window.__haptic.length = 0; });
  await page.tap('[data-act="close"]');
  await page.tap('[data-act="resume"]');
  await page.evaluate(() => window.__petri.select(2));
  await page.evaluate(() => window.__petri.select(0));
  await page.waitForTimeout(200);
  check((await page.evaluate(() => window.__haptic.length)) === 0, 'haptics off means no pulses');
  check(errors.length === 0, `native shell: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}

// ---------- 7. first-run guidance and learning from a loss ----------
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?debug&seed=guide-7');
  await page.evaluate(() => localStorage.removeItem('petri.v2'));
  await page.reload();
  await page.waitForTimeout(700);
  await page.tap('[data-act="new"]');
  await waitPhase(page, ['aim']);
  await page.waitForTimeout(400);
  const first = await page.evaluate(() => {
    const c = document.querySelector('#hand .card');
    return { rec: !!c.querySelector('.rec'), text: c.textContent };
  });
  check(first.rec && first.text.includes('増殖'), 'a new player\'s first card is the sturdy 増殖 card, marked おすすめ');
  // skip the tutorial, then lose on purpose: the end screen must say why
  await page.evaluate(() => { document.querySelectorAll('#coach .btn').forEach(b => b.click()); });
  await page.evaluate(() => window.localStorage.setItem('petri.v2', JSON.stringify({ ...JSON.parse(localStorage.getItem('petri.v2')), flags: { tutorialDone: true } })));
  for (let k = 0; k < 3; k++) {
    await waitPhase(page, ['aim'], 40000);
    await page.evaluate(() => { window.__petri.select(window.__petri.G().day.hand.length - 1); });
    const worst = await page.evaluate(() => window.__petri.worstCell());
    await page.evaluate(i => window.__petri.drop(i), worst);
    await page.waitForFunction(() => window.__petri.state().phase !== 'aim', null, { timeout: 5000 });
  }
  await waitPhase(page, ['end', 'reward'], 90000);
  const phase = (await st(page)).phase;
  if (phase === 'end') {
    await page.waitForTimeout(800);
    const hint = await page.textContent('.end-info .hint').catch(() => null);
    check(!!hint && hint.includes('次へのひとこと'), 'a lost day ends with a one-line reason for next time');
    await page.screenshot({ path: `${out}/g01-lost.png` });
  } else {
    console.log('note: the deliberately poor drops still cleared the gentle first day; reason-line check skipped');
  }
  check(errors.length === 0, `guidance: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}

// ---------- 8. the on-device benchmark runs and leaves saved data alone ----------
{
  const { ctx, page, errors } = await open({ ...devices['iPhone 13'] }, '?debug');
  const seeded = JSON.stringify({ flags: { tutorialDone: true }, stats: { runs: 7, wins: 1, bestDay: 4, daysCleared: 12 }, savedAt: 5 });
  await page.evaluate(v => localStorage.setItem('petri.v2', v), seeded);
  await page.goto(base + '?debug&bench');
  await page.waitForTimeout(900);
  await page.tap('[data-act="go"]');
  await page.waitForFunction(() => window.__bench, null, { timeout: 150000 });
  const b = await page.evaluate(() => window.__bench);
  check(b.frames > 50 && b.avgFps > 0 && b.p95ms > 0 && ['good', 'ok', 'poor'].includes(b.verdict), `the benchmark reports frame stats (${b.frames} frames, verdict ${b.verdict}; software GL, so the numbers say nothing about a phone)`);
  check((await page.evaluate(() => localStorage.getItem('petri.v2'))) === seeded, 'the benchmark leaves the saved data untouched');
  check(errors.length === 0, `bench: no console errors ${errors.join(' | ')}`);
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
process.exit(failures.length ? 1 : 0);
