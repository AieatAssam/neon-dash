import { test, expect } from '@playwright/test';

test('touch jump and phase button change simulation state, and phase release keeps jump held', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.keyboard.down('Space');
    await expect(page.locator('#overlay')).toBeHidden();
    expect(await page.evaluate(() => window.__touchTestState().jumpHeld)).toBe(true);
    await page.keyboard.up('Space');
    expect(await page.evaluate(() => window.__touchTestState().jumpHeld)).toBe(false);
    await page.reload();
    await page.locator('#playBtn').tap();

    const initial = await page.evaluate(() => window.__touchTestState());
    await page.locator('#jumpBtn').tap();
    await expect.poll(() => page.evaluate(() => window.__touchTestState().jumps)).toBeGreaterThan(initial.jumps);
    await expect.poll(() => page.evaluate(() => window.__touchTestState().runnerY)).toBeLessThan(initial.runnerY);

    const beforePhase = await page.evaluate(() => window.__touchTestState());
    await page.locator('#phaseBtn').tap();
    await expect.poll(() => page.evaluate(() => window.__touchTestState().phase)).toBe(1 - beforePhase.phase);

    // Keep the jump pointer down while a second touch taps and releases phase.
    await page.evaluate(() => {
      const jump = document.querySelector('#jumpBtn');
      jump.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, pointerType: 'touch', isPrimary: true }));
      const phase = document.querySelector('#phaseBtn');
      phase.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 12, pointerType: 'touch', isPrimary: false }));
      phase.click();
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 12, pointerType: 'touch', isPrimary: false }));
    });
    expect(await page.evaluate(() => window.__touchTestState().jumpHeld)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, pointerType: 'touch', isPrimary: true })));
    expect(await page.evaluate(() => window.__touchTestState().jumpHeld)).toBe(false);
  } finally {
    await context.close();
  }
});
