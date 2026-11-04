import { test, expect } from '@playwright/test';

test('backdrop redraws after a palette change and viewport resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__setBackdropDistance === 'function');
  const pixel = () => page.locator('canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(5, 5, 1, 1).data]);
  await expect.poll(async () => (await pixel()).slice(0, 3).some(Boolean)).toBeTruthy();
  const before = await pixel();
  await page.evaluate(() => window.__setBackdropDistance(4800));
  await expect.poll(pixel).not.toEqual(before);
  const changed = await pixel();
  await page.setViewportSize({ width: 430, height: 932 });
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => canvas.width)).toBe(430);
  await expect.poll(pixel).toEqual(changed);
});
