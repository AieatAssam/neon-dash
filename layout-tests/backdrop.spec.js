import { test, expect } from '@playwright/test';

/** Luma statistics for a horizontal band of the composited page, sampled on a coarse grid. */
async function band(page, top, bottom) {
  const png = await page.screenshot();
  return page.evaluate(async ({ data, top, bottom }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const lumas = [];
    let chroma = 0;
    for (let y = Math.floor(image.height * top); y < image.height * bottom; y += 9) {
      for (let x = 3; x < image.width; x += 11) {
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        lumas.push(.2126 * r + .7152 * g + .0722 * b);
        chroma = Math.max(chroma, Math.max(r, g, b) - Math.min(r, g, b));
      }
    }
    const mean = lumas.reduce((a, b) => a + b, 0) / lumas.length;
    const spread = Math.sqrt(lumas.reduce((a, b) => a + (b - mean) ** 2, 0) / lumas.length);
    return { mean, spread, chroma };
  }, { data: png.toString('base64'), top, bottom });
}

for (const [width, height] of [[390, 844], [844, 390]]) {
  test(`${width}x${height} backdrop is alive: coloured sky, lit grid, and it moves`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__harness));
    await page.evaluate(() => window.__harness.play({ seed: 7, bot: 'good', skipTo: 2 }));
    await page.waitForTimeout(300);
    const sky = await band(page, .12, .4);
    const floor = await band(page, .66, .95);
    // Never a flat black screen: the sky has colour and structure, the floor carries a visible grid.
    expect(sky.mean).toBeGreaterThan(14);
    expect(sky.chroma).toBeGreaterThan(60);
    expect(sky.spread).toBeGreaterThan(6);
    expect(floor.spread).toBeGreaterThan(4);
    const first = await page.screenshot({ clip: { x: 0, y: height * .5, width, height: height * .45 } });
    await page.waitForTimeout(250);
    const second = await page.screenshot({ clip: { x: 0, y: height * .5, width, height: height * .45 } });
    expect(first.equals(second)).toBe(false);
  });
}

test('the canvas follows resizes at device resolution', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 430, height: 932 });
  await expect.poll(() => page.locator('canvas').evaluate(canvas => canvas.width)).toBe(430);
  await page.setViewportSize({ width: 430, height: 700 });
  await expect.poll(() => page.locator('canvas').evaluate(canvas => canvas.height)).toBe(700);
  const sky = await band(page, .1, .3);
  expect(sky.mean).toBeGreaterThan(10);
});
