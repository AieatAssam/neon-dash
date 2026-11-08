// Fast visual check during development: node scripts/quick-shots.mjs <url> <outDir> [WxH ...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [url = 'http://127.0.0.1:5180/', out = '/tmp/shots', ...sizes] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const size of sizes.length ? sizes : ['390x844']) {
  const [width, height] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: width < height });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${size}-title.png` });
  const shots = [
    ['play', { seed: 7, bot: 'good', skipTo: 7.6 }, 400],
    ['cue', { seed: 7, bot: 'good', skipTo: 'cue', after: 3.2 }, 300],
    ['portal', { seed: 7, bot: 'good', skipTo: 'cue', after: 4.75 }, 300],
    ['warp', { seed: 7, bot: 'good', skipTo: 'warp' }, 560],
    ['shaft', { seed: 7, bot: 'good', skipTo: 'vertical', after: 1.2 }, 300],
    ['shaft-gates', { seed: 7, bot: 'good', skipTo: 'vertical', after: 8 }, 300],
    ['after', { seed: 7, bot: 'good', skipTo: 'exit', after: 4 }, 300],
  ];
  for (const [name, options, wait] of shots) {
    await page.evaluate(o => window.__harness.play(o), options);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${size}-${name}.png` });
  }
  await page.evaluate(() => window.__harness.play({ seed: 7, bot: 'none', skipTo: 5 }));
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/${size}-over.png` });
  console.log(size, JSON.stringify(await page.evaluate(() => window.__harness.state())), errors.slice(0, 5));
  await context.close();
}
await browser.close();
