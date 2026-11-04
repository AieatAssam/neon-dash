import { test, expect } from '@playwright/test';

test('mobile challenge enters the color wall, accepts color steering, dies, and retries cleanly', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.locator('#playBtn').tap();
    await page.evaluate(() => window.__enterVerticalTest(1));

    await expect(page.locator('#levelText')).toHaveText('COLOR WALL');
    await expect(page.locator('#phaseBtn')).toBeVisible();
    await expect(page.locator('#jumpBtn')).toBeHidden();
    await page.screenshot({ path: '/tmp/geometry-vertical-mobile.png' });
    const initial = await page.evaluate(() => window.__verticalTestState());
    if (initial.phase !== initial.firstSafePhase) await page.locator('#phaseBtn').tap();
    await expect.poll(() => page.evaluate(() => window.__verticalTestState().phase)).toBe(initial.firstSafePhase);
    await expect(page.locator('#phaseBtn')).toContainText(initial.firstSafePhase === 0 ? 'CYAN' : 'VIOLET');

    await expect(page.locator('#overlay')).toBeVisible({ timeout: 12000 });
    await expect(page.locator('#overlayTitle')).toHaveText('TRY AGAIN');
    await page.locator('#playBtn').tap();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__verticalTestState().active)).toBe(false);
    await expect(page.locator('#attempt')).toHaveText('02');
  } finally {
    await context.close();
  }
});
