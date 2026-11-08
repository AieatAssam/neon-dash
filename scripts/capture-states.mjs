// Capture menu, gameplay, vertical and game-over screenshots at the phone
// sizes used in review. Usage: node scripts/capture-states.mjs <baseUrl> <outDir>
// Works against older builds (dev hooks only) and the autoplay harness; with
// the harness, frames are stepped by hand so every shot is deterministic.
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
  const name = state => `${outDir}/${state}-${width}x${height}.png`;
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const harness = await page.evaluate(() => typeof window.__harness?.frame === 'function');
  const frames = (count, ms = 1000 / 60) => page.evaluate(([n, step]) => { for (let i = 0; i < n; i++) window.__harness.frame(step); }, [count, ms]);

  if (harness) {
    await page.evaluate(() => window.__harness.manual(true));
    await frames(90);
  } else {
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: name('menu') });

  if (harness) {
    // Mid-jump over the opening spikes, with a fresh player's prompt still up.
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(s => window.__harness.play({ seed: s, bot: 'good', skipTo: 7.2 }), seed);
    await frames(20);
    for (let i = 0; i < 120 && !(await page.evaluate(() => window.__harness.state().airborne)); i++) await frames(1);
    await frames(11);
  } else {
    await page.locator('#playBtn').tap();
    await page.waitForTimeout(2100);
  }
  await page.screenshot({ path: name('gameplay') });

  if (harness) {
    await page.evaluate(s => window.__harness.play({ seed: s, bot: 'good', skipTo: 'vertical', after: 6.3 }), seed);
    await frames(30);
  } else {
    await page.evaluate(s => window.__enterVerticalTest(s), seed);
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: name('vertical') });

  if (harness) {
    await page.evaluate(s => window.__harness.play({ seed: s, bot: 'none', skipTo: 5 }), seed);
    for (let i = 0; i < 900 && (await page.evaluate(() => window.__harness.state().mode)) !== 'over'; i++) await frames(6);
    await frames(30);
  } else {
    await page.evaluate(() => window.__layoutTestState('dead'));
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: name('gameover') });
  await context.close();
}
await browser.close();
console.log(`saved to ${outDir}`);
