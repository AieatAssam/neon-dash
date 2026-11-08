import { test, expect } from '@playwright/test';

const URL = 'http://127.0.0.1:5173/';
const sizes = [[360, 640], [390, 844], [430, 932], [844, 390], [932, 430], [1280, 800]];

async function open(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__harness));
}

/** Bounding boxes of the visible elements among `selectors`. */
async function visibleBoxes(page, selectors) {
  return page.evaluate(list => list.flatMap(selector => {
    const element = document.querySelector(selector);
    if (!element) return [];
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || !rect.width || !rect.height || element.closest('[hidden]')) return [];
    return [{ selector, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }];
  }), selectors);
}

function expectInside(boxes, width, height, margin = 0) {
  for (const box of boxes) {
    expect(box.x, box.selector).toBeGreaterThanOrEqual(margin - .5);
    expect(box.y, box.selector).toBeGreaterThanOrEqual(margin - .5);
    expect(box.right, box.selector).toBeLessThanOrEqual(width - margin + .5);
    expect(box.bottom, box.selector).toBeLessThanOrEqual(height - margin + .5);
  }
}

function expectNoOverlap(boxes) {
  for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
    const a = boxes[i], b = boxes[j];
    expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `${a.selector} overlaps ${b.selector}`).toBeTruthy();
  }
}

const HUD = ['.progress', '.hud-actions', '#practiceBadge', '#banner', '#teach', '#phaseBtn', '#jumpBtn'];

test('the menu is a logo, one PLAY button, mode chips and a single short hint', async ({ page }) => {
  await open(page, 390, 844);
  const lines = await page.locator('#titleCard').evaluate(card => [...card.querySelectorAll('p, small, li')].filter(el => !el.closest('[hidden]')).map(el => el.textContent.trim()).filter(Boolean));
  expect(lines.length).toBeLessThanOrEqual(1);
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(32);
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(page.locator('.mode-chips label')).toHaveCount(3);
  const play = await page.locator('#playBtn').boundingBox();
  expect(play.height).toBeGreaterThanOrEqual(56);
  expect(play.width).toBeGreaterThanOrEqual(200);
});

for (const [width, height] of sizes) {
  test(`${width}x${height} menu, HUD, pause and result cards fit without overlap`, async ({ page }) => {
    await open(page, width, height);

    const title = await visibleBoxes(page, ['#overlayTitle', '#bestLine', '#playBtn', '.mode-chips', '#overlayHint']);
    expect(title.map(box => box.selector)).toEqual(expect.arrayContaining(['#overlayTitle', '#playBtn', '.mode-chips']));
    expectInside(title, width, height, 8);
    expectNoOverlap(title);
    expectNoOverlap(await visibleBoxes(page, ['.mode-chips', '#soundBtn']));

    // Opening seconds: the jump prompt is up.
    await page.locator('#playBtn').click();
    await expect.poll(() => page.evaluate(() => window.__harness.state().teach)).not.toBe('');
    const opening = await visibleBoxes(page, HUD);
    expectInside(opening, width, height);
    expectNoOverlap(opening);

    // Approach to the gravity turn: banner plus HUD.
    await page.evaluate(() => window.__harness.play({ seed: 7, bot: 'good', skipTo: 'cue', after: 3 }));
    await expect.poll(() => page.evaluate(() => window.__harness.state().banner)).not.toBe('');
    const approach = await visibleBoxes(page, HUD);
    expectInside(approach, width, height);
    expectNoOverlap(approach);

    // First seconds in the shaft: big one-line tutorial, banner and the switch button.
    await page.evaluate(() => { localStorage.removeItem('neon-dash-shaft'); window.__harness.play({ seed: 7, bot: 'none', skipTo: 'vertical', after: .3 }); });
    await expect.poll(() => page.evaluate(() => window.__harness.state().teach)).toMatch(/SWAP WALLS/);
    const shaft = await visibleBoxes(page, HUD);
    expect(shaft.map(box => box.selector)).toContain('#teach');
    expectInside(shaft, width, height);
    expectNoOverlap(shaft);

    await page.locator('#pauseBtn').click();
    const pause = await visibleBoxes(page, ['#pauseOverlay h2', '#resumeBtn', '#restartBtn', '#titleBtn', '#vibrationBtn', '#pauseSoundBtn', '.audio-credit']);
    expectInside(pause, width, height, 8);
    expectNoOverlap(pause);
    await page.locator('#resumeBtn').click();

    for (const state of ['dead', 'won']) {
      await page.evaluate(() => window.__harness.play({ seed: 7, bot: 'none' }));
      await page.evaluate(s => window.__layoutTestState(s), state);
      await expect(page.locator('#resultCard')).toBeVisible();
      await expect(page.locator('.hud .progress')).toBeHidden();
      const result = await visibleBoxes(page, ['#resultKicker', '#resultScore', '#resultBest', '#retryBtn', '#menuBtn', '#soundBtn']);
      expect(result.map(box => box.selector)).toEqual(expect.arrayContaining(['#resultScore', '#retryBtn', '#menuBtn']));
      expectInside(result, width, height, 8);
      expectNoOverlap(result);
      const [retry, menu] = await Promise.all([page.locator('#retryBtn').boundingBox(), page.locator('#menuBtn').boundingBox()]);
      expect(retry.width * retry.height).toBeGreaterThan(menu.width * menu.height * 2);
      expect(menu.height).toBeGreaterThanOrEqual(40);
    }
  });
}

for (const [width, height] of sizes.slice(0, 3)) {
  test(`${width}x${height} touch controls at DPR 3`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    try {
      const page = await context.newPage();
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => devicePixelRatio)).toBe(3);
      await expect.poll(() => page.locator('#game').evaluate(canvas => canvas.width / canvas.clientWidth)).toBe(3);
      await expect.poll(() => page.locator('#game').evaluate(canvas => canvas.height / canvas.clientHeight)).toBe(3);
      await page.locator('#playBtn').tap();
      const boxes = await visibleBoxes(page, ['#pauseBtn', '#phaseBtn', '#jumpBtn']);
      expect(boxes.map(box => box.selector)).toEqual(['#pauseBtn', '#phaseBtn', '#jumpBtn']);
      for (const box of boxes) {
        expect(box.right - box.x, box.selector).toBeGreaterThanOrEqual(44);
        expect(box.bottom - box.y, box.selector).toBeGreaterThanOrEqual(44);
      }
      expectInside(boxes, width, height);
      expectNoOverlap(boxes);
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
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#playBtn').click();
    await expect(page.locator('#jumpBtn')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('hybrid pointer cascade keeps touch jump visible when the primary pointer is fine', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const css = await page.evaluate(async () => (await fetch('/style.css', { headers: { Accept: 'text/css' } })).text());
  // Chromium cannot emulate a fine primary pointer and a coarse secondary pointer
  // together. Activate exactly those two media queries to exercise their real cascade.
  const simulated = css.replaceAll('@media(pointer:fine)', '@media all')
    .replaceAll('@media(any-pointer:coarse)', '@media all');
  const display = async stylesheet => {
    await page.setContent(`<style>${stylesheet}</style><button class="jump-button">Jump</button>`);
    return page.locator('.jump-button').evaluate(el => getComputedStyle(el).display);
  };
  expect(await display(simulated.replace('@media all{.jump-button{display:grid}}', ''))).toBe('none');
  expect(await display(simulated)).toBe('grid');
});

test('practice respawns at an automatic checkpoint and never touches saved progress', async ({ page }) => {
  await open(page, 390, 844);
  const progress = JSON.stringify({ bestDistance: 100, challengeBest: 12, challengeWins: 1, runs: 2, unlocked: [] });
  await page.evaluate(value => localStorage.setItem('neon-dash-progress', value), progress);
  await page.reload();
  await page.locator('input[name=gameMode][value=practice]').check();
  await page.locator('#playBtn').click();
  await expect(page.locator('#practiceBadge')).toBeVisible();
  // Let the expert bot bank checkpoints, then stop pressing so the runner dies.
  await page.evaluate(() => window.__harness.setBot('good'));
  await expect.poll(() => page.evaluate(() => window.__harness.state().time), { timeout: 15000 }).toBeGreaterThan(8);
  await page.evaluate(() => window.__harness.setBot('none'));
  await expect.poll(() => page.evaluate(() => window.__harness.state().attempt), { timeout: 15000 }).toBeGreaterThan(1);
  const respawned = await page.evaluate(() => window.__harness.state());
  expect(respawned.mode).toBe('running');
  expect(respawned.time).toBeGreaterThan(4);
  await expect(page.locator('#overlay')).toBeHidden();
  await page.evaluate(() => window.__layoutTestState('won'));
  await expect(page.locator('#resultKicker')).toHaveText('PRACTICE COMPLETE');
  expect(await page.evaluate(() => localStorage.getItem('neon-dash-progress'))).toBe(progress);
  await page.locator('#menuBtn').click();
  await expect(page.locator('#titleCard')).toBeVisible();
  await expect(page.locator('input[name=gameMode][value=practice]')).toBeChecked();
});

test('retry restarts in well under half a second from the result card or a tap', async ({ page }) => {
  await open(page, 390, 844);
  await page.locator('#playBtn').click();
  await page.evaluate(() => window.__harness.setBot('none'));
  await expect(page.locator('#resultCard')).toBeVisible({ timeout: 15000 });
  const elapsed = await page.evaluate(async () => {
    const begin = performance.now();
    document.querySelector('#overlay').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    while (window.__harness.state().mode !== 'running') await new Promise(requestAnimationFrame);
    return performance.now() - begin;
  });
  expect(elapsed).toBeLessThan(500);
  expect(await page.evaluate(() => window.__harness.state().attempt)).toBe(2);
});
