import { test, expect } from '@playwright/test';

test('backdrop redraws after a palette change and viewport resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__setBackdropDistance === 'function');
  // Sample the composited page: the static gradient is a CSS layer behind the canvas.
  const pixel = async () => {
    const png = await page.screenshot();
    return page.evaluate(async data => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      context.drawImage(image, -5, -5);
      return [...context.getImageData(0, 0, 1, 1).data];
    }, png.toString('base64'));
  };
  await expect.poll(async () => (await pixel()).slice(0, 3).some(Boolean)).toBeTruthy();
  const before = await pixel();
  await page.evaluate(() => window.__setBackdropDistance(4800));
  await expect.poll(pixel).not.toEqual(before);
  const changed = await pixel();
  await page.setViewportSize({ width: 430, height: 932 });
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => canvas.width)).toBe(430);
  await expect.poll(pixel).toEqual(changed);
  // A height-only resize must repaint the composited backdrop as well.
  await page.setViewportSize({ width: 430, height: 700 });
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => canvas.height)).toBe(700);
  await expect.poll(async () => (await pixel()).slice(0, 3).some(Boolean)).toBeTruthy();
});

test('a gap remains dark against the composited floor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__setTestTerrain === 'function');
  await page.locator('#overlay').evaluate(el => { el.style.visibility = 'hidden'; });
  await page.evaluate(() => window.__setTestTerrain([{ kind: 'gap', x: 100, width: 90, height: 0 }]));
  await page.waitForTimeout(100);
  const pixelsAt = async y => {
    const png = await page.screenshot();
    return page.evaluate(async ({ data, y }) => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return [115, 197].map(x => [...context.getImageData(x,y,1,1).data]);
    }, { data: png.toString('base64'), y });
  };
  const assertGap = pixels => {
    expect(pixels[0][0]).toBeLessThan(8);
    expect(pixels[1][0]).toBeGreaterThan(pixels[0][0] + 5);
  };
  assertGap(await pixelsAt(550));
  await page.setViewportSize({ width: 390, height: 700 });
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => canvas.height)).toBe(700);
  await expect.poll(async () => (await pixelsAt(460))[1][0]).toBeGreaterThan(8);
  await expect.poll(async () => (await pixelsAt(460))[0][0]).toBeLessThan(8);
  assertGap(await pixelsAt(460));
});
