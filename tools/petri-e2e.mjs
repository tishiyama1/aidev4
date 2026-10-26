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

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
process.exit(failures.length ? 1 : 0);
