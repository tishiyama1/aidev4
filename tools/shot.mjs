// Drive a page in headless Chromium: run a list of steps and take screenshots, logging console errors.
// usage: node tools/shot.mjs <url> <outdir> '<json steps>'
import { createRequire } from 'module';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const [url, out, stepsJson] = process.argv.slice(2);
const steps = JSON.parse(stepsJson || '[]');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1200), height: Number(process.env.H || 820) } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForTimeout(600);
let n = 0;
for (const st of steps) {
  if (st.key) for (let i = 0; i < (st.times || 1); i++) { await page.keyboard.press(st.key); await page.waitForTimeout(st.gap || 160); }
  if (st.click) await page.mouse.click(st.click[0], st.click[1]);
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.eval) console.log('eval:', JSON.stringify(await page.evaluate(st.eval)));
  if (st.shot) await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${st.shot}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
