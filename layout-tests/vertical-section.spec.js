import { test, expect } from '@playwright/test';

test('phone shaft fills the screen, swaps walls on tap, and retries back to the start', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.locator('#playBtn').tap();
    await page.evaluate(() => window.__harness.play({ seed: 7, bot: 'none', skipTo: 'vertical' }));

    await expect(page.locator('#viewport')).toHaveClass(/shaft/);
    await expect(page.locator('#phaseBtn')).toBeVisible();
    await expect(page.locator('#jumpBtn')).toBeHidden();
    await expect(page.locator('#banner')).toHaveText('GRAVITY TURNS!');
    const before = await page.evaluate(() => window.__verticalTestState());
    expect(before.active).toBe(true);
    // The runway becomes the cyan wall.
    expect(before.phase).toBe(0);
    await page.locator('#phaseBtn').tap();
    await expect.poll(() => page.evaluate(() => window.__verticalTestState().phase)).toBe(1);
    // Tapping anywhere on the playfield swaps back.
    await page.locator('#game').tap({ position: { x: 200, y: 500 } });
    await expect.poll(() => page.evaluate(() => window.__verticalTestState().phase)).toBe(0);
    await page.screenshot({ path: '/tmp/geometry-vertical-mobile.png' });

    await expect(page.locator('#resultCard')).toBeVisible({ timeout: 20000 });
    await page.locator('#retryBtn').tap();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__verticalTestState().active)).toBe(false);
    await expect(page.locator('#viewport')).not.toHaveClass(/shaft/);
  } finally {
    await context.close();
  }
});
