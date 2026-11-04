import { test, expect } from '@playwright/test';

const sizes = [[360, 640], [390, 844], [430, 932], [844, 390], [932, 430], [1280, 800]];
const states = ['title', 'play', 'pause', 'game over', 'complete'];

test('title explains the shield pickup and its limits', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#overlayDescription')).toContainText('Collect cyan shields');
  await expect(page.locator('#overlayDescription')).toContainText('Gaps and falls still hurt');
});

for (const [width, height] of sizes) {
  test(`${width}x${height} charged shield HUD in practice`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.locator('#practiceMode').check();
    await page.locator('#playBtn').click();
    await page.evaluate(() => window.__setShieldCharged(true));
    await expect(page.locator('#shieldIndicator')).toBeVisible();
    const layout = await page.evaluate(() => ['.run-stats', '.progress', '.hud-actions', '#shieldIndicator'].map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { selector, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    if (width === 360 && height === 640) await page.screenshot({ path: '/tmp/shield-hud-360x640.png' });
    if (width === 844 && height === 390) await page.screenshot({ path: '/tmp/shield-hud-844x390.png' });
    for (const item of layout) {
      expect(item.x, item.selector).toBeGreaterThanOrEqual(0);
      expect(item.y, item.selector).toBeGreaterThanOrEqual(0);
      expect(item.right, item.selector).toBeLessThanOrEqual(width + .5);
      expect(item.bottom, item.selector).toBeLessThanOrEqual(height + .5);
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) {
      const a = layout[i], b = layout[j];
      expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y,
        `${a.selector} overlaps ${b.selector}`).toBeTruthy();
    }
  });
}

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
      const controls = state === 'play' ? ['#pauseBtn', '#soundBtn'] : state === 'pause' ? ['#resumeBtn', '#restartBtn', '#titleBtn'] : ['#playBtn', ...(state === 'title' ? [] : ['#freshBtn'])];
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
          ? ['.overlay-kicker', 'h2', '#resumeBtn', '#restartBtn', '#titleBtn', '.menu-controls', '.audio-credit']
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

test('a touch-capable desktop viewport exposes the jump control', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false });
  try {
    const page = await context.newPage();
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.locator('#playBtn').click();
    await expect(page.locator('#jumpBtn')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('hybrid pointer cascade keeps touch jump visible when the primary pointer is fine', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  const css = await page.evaluate(async () => (await fetch('/style.css', { headers: { Accept: 'text/css' } })).text());
  // Chromium cannot emulate a fine primary pointer and a coarse secondary pointer
  // together. Activate exactly those two media queries to exercise their real cascade.
  const simulated = css.replaceAll('@media(pointer:fine)', '@media all')
    .replaceAll('@media(any-pointer:coarse)', '@media all');
  const display = async stylesheet => {
    await page.setContent(`<style>${stylesheet}</style><button class="jump-button">Jump</button>`);
    return page.locator('.jump-button').evaluate(el => getComputedStyle(el).display);
  };
  expect(await display(simulated.replace('@media all{.jump-button{display:flex}}', ''))).toBe('none');
  expect(await display(simulated)).toBe('flex');
});

test('practice controls and completion do not change official progress', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  const progress = JSON.stringify({ bestDistance: 100, challengeBest: 12, challengeWins: 1, runs: 2, unlocked: [] });
  await page.evaluate(value => localStorage.setItem('neon-dash-progress', value), progress);
  await page.reload();
  await page.locator('#practiceMode').check();
  await page.locator('#playBtn').click();
  await expect(page.locator('#practiceBadge')).toBeVisible();
  await page.locator('#checkpointBtn').click();
  await expect(page.locator('#checkpointCount')).toHaveText('1 checkpoint');
  await expect(page.locator('#checkpointBtn')).not.toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#checkpointCount')).toHaveText('1 checkpoint');
  await page.locator('#removeCheckpointBtn').click();
  await expect(page.locator('#removeCheckpointBtn')).not.toBeFocused();
  await expect(page.locator('#checkpointCount')).toHaveText('0 checkpoints');
  await page.evaluate(() => window.__layoutTestState('won'));
  await expect(page.locator('#overlayKicker')).toHaveText('PRACTICE COMPLETE · NO RECORDS SAVED');
  expect(await page.evaluate(() => localStorage.getItem('neon-dash-progress'))).toBe(progress);
});


test('endless practice can return to mode selection without saving progress', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  const progress = JSON.stringify({ bestDistance: 100, challengeBest: 12, challengeWins: 1, runs: 2, unlocked: [] });
  await page.evaluate(value => localStorage.setItem('neon-dash-progress', value), progress);
  await page.reload();
  await page.locator('input[name=gameMode][value=endless]').check();
  await page.locator('#practiceMode').check();
  await page.locator('#playBtn').click();
  await page.locator('#checkpointBtn').click();
  await page.locator('#pauseBtn').click();
  await page.locator('#titleBtn').click();
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('input[name=gameMode][value=challenge]')).toBeEnabled();
  await expect(page.locator('#practiceControls')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('neon-dash-progress'))).toBe(progress);
  await page.locator('input[name=gameMode][value=challenge]').check();
  await page.locator('#practiceMode').uncheck();
  await page.locator('#playBtn').click();
  await expect(page.locator('#practiceBadge')).toBeHidden();
});

test('short narrow touch practice controls stay clear of jump and phase buttons', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 390 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.locator('#practiceMode').check();
    await page.locator('#playBtn').click();
    const boxes = await page.evaluate(() => ['#phaseBtn', '#practiceControls', '#jumpBtn'].map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }));
    for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        `${a.selector} overlaps ${b.selector}`).toBeTruthy();
    }
  } finally {
    await context.close();
  }
});
