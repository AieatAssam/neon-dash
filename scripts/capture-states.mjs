// Capture menu, gameplay, vertical and game-over screenshots at the phone
// sizes used in review. Usage: node scripts/capture-states.mjs <baseUrl> <outDir>
// Works against older builds (dev hooks only) and the autoplay harness.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const [baseUrl = 'http://127.0.0.1:5173/', outDir = '/opt/cursor/artifacts/after'] = process.argv.slice(2);
const sizes = [[390, 844], [360, 640], [844, 390]];
const seed = 7;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [width, height] of sizes) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  const name = state => `${outDir}/${state}-${width}x${height}.png`;
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: name('menu') });

  const harness = await page.evaluate(() => typeof window.__harness === 'object');
  if (harness) {
    await page.evaluate(s => window.__harness.play({ seed: s, bot: 'good', skipTo: 9 }), seed);
    await page.waitForTimeout(1400);
  } else {
    await page.locator('#playBtn').tap();
    await page.waitForTimeout(2100);
  }
  await page.screenshot({ path: name('gameplay') });

  if (harness) {
    await page.evaluate(s => window.__harness.play({ seed: s, bot: 'good', skipTo: 'vertical', after: 5 }), seed);
    await page.waitForTimeout(1200);
  } else {
    await page.evaluate(s => window.__enterVerticalTest(s), seed);
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: name('vertical') });

  if (harness) {
    await page.evaluate(s => window.__harness.play({ seed: s, bot: 'none', skipTo: 4 }), seed);
    await page.waitForFunction(() => !document.querySelector('#overlay').hidden, null, { timeout: 15000 });
    await page.waitForTimeout(900);
  } else {
    await page.evaluate(() => window.__layoutTestState('dead'));
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: name('gameover') });
  await context.close();
}
await browser.close();
console.log(`saved to ${outDir}`);
