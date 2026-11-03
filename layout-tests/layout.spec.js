import { test, expect } from '@playwright/test';

const sizes = [[360, 640], [390, 844], [430, 932], [844, 390], [932, 430], [1280, 800]];
const states = ['title', 'play', 'pause', 'game over', 'complete'];

for (const [width, height] of sizes) {
  test(`${width}x${height} all states`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
      for (const state of states) {
      if (state === 'play') await page.locator('#playBtn').click();
      if (state === 'pause') await page.locator('#pauseBtn').click();
      if (state === 'game over') await page.locator('#resumeBtn').click();
      if (state === 'complete') await page.locator('#playBtn').click();
      if (state === 'game over' || state === 'complete') {
        await page.evaluate(s => window.__layoutTestState(s), state === 'complete' ? 'won' : 'dead');
      }
      const overlay = state === 'pause' ? '#pauseOverlay' : '#overlay';
      const controls = state === 'play' ? ['#pauseBtn', '#soundBtn'] : state === 'pause' ? ['#resumeBtn', '#restartBtn'] : ['#playBtn', ...(state === 'title' ? [] : ['#freshBtn'])];
      for (const selector of controls) {
        const item = page.locator(selector);
        await expect(item).toBeVisible();
        const box = await item.boundingBox();
        expect(box.x, selector).toBeGreaterThanOrEqual(0);
        expect(box.y, selector).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, selector).toBeLessThanOrEqual(width + 0.5);
        expect(box.y + box.height, selector).toBeLessThanOrEqual(height + 0.5);
      }
      if (state !== 'play') {
        await expect(page.locator('.hud')).toBeHidden();
        const parts = state === 'pause'
          ? ['.overlay-kicker', 'h2', '#resumeBtn', '#restartBtn', '.menu-controls', '.audio-credit']
          : ['#overlayKicker', '#overlayTitle', '#overlayDescription', '.mode-select', '#playBtn', '#freshBtn', '#overlayHint', '#seedText', '.achievement-summary', '.menu-controls'];
        const rectangles = [];
        for (const selector of parts) {
          const item = page.locator(`${overlay} ${selector}`);
          if (!(await item.isVisible())) continue;
          const box = await item.boundingBox();
          if (!box || !box.width || !box.height) continue;
          expect(box.x, selector).toBeGreaterThanOrEqual(12);
          expect(box.y, selector).toBeGreaterThanOrEqual(12);
          expect(box.x + box.width, selector).toBeLessThanOrEqual(width - 12);
          expect(box.y + box.height, selector).toBeLessThanOrEqual(height - 12);
          for (const other of rectangles) {
            expect(box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y, `${selector} overlaps ${other.selector}`).toBeTruthy();
          }
          rectangles.push({ ...box, selector });
        }
        const menu = page.locator(`${overlay} .menu`);
        const menuBox = await menu.boundingBox();
        expect(menuBox.y).toBeGreaterThanOrEqual(0);
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(height + 0.5);
        const bounds = await menu.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }));
        expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
      } else {
        const boxes = await Promise.all(['.run-stats', '.progress', '.hud-actions'].map(s => page.locator(s).boundingBox()));
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBeTruthy();
        }
      }
      }
    });
}

for (const [width, height] of sizes.slice(0, 3)) {
  test(`${width}x${height} touch controls at DPR 3`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    try {
      const page = await context.newPage();
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => devicePixelRatio)).toBe(3);
      await expect.poll(() => page.locator('#game').evaluate(canvas => canvas.width / canvas.clientWidth)).toBe(3);
      await expect.poll(() => page.locator('#game').evaluate(canvas => canvas.height / canvas.clientHeight)).toBe(3);
      await page.locator('#playBtn').tap();
      const boxes = await page.evaluate(() => ['#soundBtn', '#pauseBtn', '#phaseBtn', '#jumpBtn'].map(selector => {
        const element = document.querySelector(selector);
        const rect = element.getBoundingClientRect();
        return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' };
      }));
      for (const [index, box] of boxes.entries()) {
        const { selector } = box;
        expect(box.visible, selector).toBeTruthy();
        expect(box.width, selector).toBeGreaterThanOrEqual(44);
        expect(box.height, selector).toBeGreaterThanOrEqual(44);
        expect(box.x, selector).toBeGreaterThanOrEqual(0);
        expect(box.y, selector).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, selector).toBeLessThanOrEqual(width);
        expect(box.y + box.height, selector).toBeLessThanOrEqual(height);
        for (const other of boxes.slice(0, index)) expect(box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y, `${selector} overlaps ${other.selector}`).toBeTruthy();
      }
    } finally {
      await context.close();
    }
  });
}
