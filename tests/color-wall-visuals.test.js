import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMEPLAY_COLORS } from '../src/art/palette.ts';
import { colorWallLayout } from '../color-wall-visuals.ts';

test('color wall lane remains centered and fills tall mobile framing', () => {
  const layout = colorWallLayout(390, 844);
  assert.equal(layout.x + layout.width / 2, 195);
  assert.equal(layout.height, 844);
  assert.ok(layout.width >= 210);
  assert.ok(layout.width < 390);
});

test('color wall lane uses bounded width on desktop', () => {
  const layout = colorWallLayout(1280, 720);
  assert.equal(layout.x + layout.width / 2, 640);
  assert.ok(layout.width <= 1280 * .78);
  assert.ok(layout.width <= 720 * .52);
});

test('course hazard rectangles paint at their collision bounds with forward mobile visibility', async () => {
  const { drawVerticalSectionVisuals } = await import('../color-wall-visuals.ts');
  const translations = [];
  const outlines = [];
  const ctx = new Proxy({
    canvas: { width: 390, height: 844 },
    getTransform: () => ({ a: 1, d: 1 }),
    translate: (x, y) => translations.push([x, y]),
    strokeRect: () => outlines.push(ctx.strokeStyle),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  drawVerticalSectionVisuals(ctx, {
    width: 420, state: { x: 210, y: 0, phase: 0 },
    obstacles: [{ x: 0, y: 300, width: 230, height: 50 }],
    cameraY: -844 / (colorWallLayout(390, 844).width / 420) * .25,
  });
  const layout = colorWallLayout(390, 844);
  const scale = layout.width / 420;
  assert.deepEqual(translations[0], [layout.x + 115 * scale, 844 * .25 + 325 * scale]);
  assert.deepEqual(translations[1], [195, 844 * .25]);
  assert.ok(outlines.includes(GAMEPLAY_COLORS.danger), 'lethal blocks use the shared danger pink');
  assert.ok(translations[0][1] < 700, 'first hazard appears above the touch controls');
});
