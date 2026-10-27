// Loudness check for シャーレ's generated audio, measured at the app's output (post master volume).
// usage: node tools/petri-audio.mjs [base-url]
// A headless run cannot judge taste, but it can catch the objective problems: clipping, an effect that is
// far louder or quieter than the rest, and music that drowns the effects.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }

const base = process.argv[2] || 'http://localhost:8123/petri/';
const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug`);
await page.evaluate(() => localStorage.setItem('petri.v2', JSON.stringify({ flags: { tutorialDone: true } })));
await page.reload();
await page.waitForTimeout(600);
await page.click('[data-act="new"]'); // a user gesture: unlocks audio
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const A = window.__petri.audio;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const db = x => (x > 1e-6 ? 20 * Math.log10(x) : -120);
  // sample output for `ms`, return the max peak and the loudest short-term RMS
  async function measure(ms, trigger) {
    if (trigger) trigger();
    let peak = 0, rms = 0, n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const l = A.level();
      if (l.peak > peak) peak = l.peak;
      if (l.rms > rms) rms = l.rms;
      n++;
      await sleep(15);
    }
    return { peak: db(peak), rms: db(rms), samples: n };
  }
  const out = {};
  await sleep(1500);
  A.setTension(0);
  out.ambient = await measure(9000);
  A.setTension(1);
  await sleep(1800);
  out.tension = await measure(2500);
  A.setTension(0);
  await sleep(1500);
  // with the music switched off the app must be silent (no leftover reverb tail)
  A.configure({ music: false });
  await sleep(6000);
  out.musicOff = await measure(2000);
  // effects are measured on their own so the music cannot mask them
  const fx = {
    ui: () => A.sfx.ui(), select: () => A.sfx.select(), aim: () => A.sfx.aim(), drop: () => A.sfx.drop(),
    grow: () => A.sfx.grow(12), eat: () => A.sfx.eat(), invade: () => A.sfx.invade(), tick: () => A.sfx.tick(),
    plate: () => A.sfx.plate(), pass: () => A.sfx.pass(), fail: () => A.sfx.fail(), reward: () => A.sfx.reward(), win: () => A.sfx.win(),
  };
  out.sfx = {};
  for (const [k, f] of Object.entries(fx)) {
    out.sfx[k] = await measure(k === 'win' ? 4500 : 2200, f);
    await sleep(k === 'win' || k === 'pass' || k === 'fail' ? 3500 : 1800); // let reverb tails die
  }
  A.configure({ music: true });
  await sleep(1500);
  // the busiest moment: invasion drone + drop + predation burst + verdict at once, with the music running
  A.setTension(1);
  out.worst = await measure(4000, () => { A.sfx.invade(); A.sfx.drop(); for (let i = 0; i < 6; i++) A.sfx.eat(); A.sfx.grow(20); A.sfx.pass(); A.sfx.win(); });
  A.setTension(0);
  await sleep(3500);
  // the same moment with the volume slider at its maximum
  A.configure({ volume: 1 });
  A.setTension(1);
  out.worstMax = await measure(4000, () => { A.sfx.invade(); A.sfx.drop(); for (let i = 0; i < 6; i++) A.sfx.eat(); A.sfx.grow(20); A.sfx.pass(); A.sfx.win(); });
  A.setTension(0);
  A.configure({ volume: 0.8 });
  return out;
});

const f = x => `${x.peak.toFixed(1).padStart(7)} dBFS peak  ${x.rms.toFixed(1).padStart(7)} dBFS rms`;
console.log('--- music / drone ---');
console.log('ambient (pad+bells)   ', f(result.ambient));
console.log('tension drone at max  ', f(result.tension));
console.log('music switched off      ', f(result.musicOff));
console.log('--- effects (music off, in isolation) ---');
for (const [k, v] of Object.entries(result.sfx)) console.log(k.padEnd(22), f(v));
console.log('--- worst case, everything at once ---');
console.log('worst (volume 80%)    ', f(result.worst));
console.log('worst (volume 100%)   ', f(result.worstMax));

let bad = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) bad++; };
const silent = result.ambient.peak < -100;
if (silent) {
  console.log('NOTE  the headless audio context produced no signal; levels cannot be judged here');
} else {
  check(result.musicOff.peak < -70, `music off is really silent (${result.musicOff.peak.toFixed(1)} dBFS peak)`);
  check(result.worst.peak < -0.3, `worst-case output stays under 0 dBFS (${result.worst.peak.toFixed(1)} dBFS)`);
  check(result.worstMax.peak < -0.3, `...and so does it with the volume slider at 100% (${result.worstMax.peak.toFixed(1)} dBFS)`);
  check(Object.values(result.sfx).every(v => v.peak < -3), 'no single effect peaks above -3 dBFS');
  check(result.ambient.rms < -22 && result.ambient.rms > -45, `ambient music is present but quiet (${result.ambient.rms.toFixed(1)} dBFS rms)`);
  const events = ['drop', 'invade', 'pass', 'fail', 'win', 'plate', 'reward'];
  check(events.every(k => result.sfx[k].peak > result.ambient.rms + 6), 'event sounds stand out at least 6 dB above the music');
  check(result.sfx.drop.peak > -14 && result.sfx.pass.peak > -14, 'the key sounds (drop, success) reach a satisfying level (above -14 dBFS peak)');
  check(result.tension.rms < result.sfx.drop.rms + 3, 'the invader drone never overpowers the effects');
  check(['select', 'tick', 'eat', 'grow', 'aim', 'ui'].every(k => result.sfx[k].peak > -36), 'even the smallest effects are audible on their own (above -36 dBFS peak)');
}
check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await browser.close();
process.exit(bad ? 1 : 0);
