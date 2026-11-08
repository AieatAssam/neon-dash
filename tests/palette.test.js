import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMEPLAY_COLORS, SHAFT_PALETTE, SKY_PALETTES, UI_CSS_COLORS, contrastRatio, colorDifference } from '../src/art/palette.ts';

/** Opaque fills that gameplay can sit on. The horizon line, sun and halos are
 * decorative light and are kept out from behind contours by layout instead. */
const SURFACES = ['skyTop', 'skyMid', 'skyLow', 'mountain', 'city', 'floorTop', 'floorBottom'];
const SCENES = [...SKY_PALETTES, SHAFT_PALETTE];

test('contrast utility uses linearized sRGB relative luminance', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#dfb8ff', '#dfb8ff'), 1);
});

test('the shipped scenes are the three sky sets plus the shaft', () => {
  assert.deepEqual(SKY_PALETTES.map(p => p.name), ['dusk', 'ember', 'lagoon']);
  assert.equal(SHAFT_PALETTE.name, 'shaft');
});

test('violet and off-phase geometry stay legible on every scene surface', () => {
  for (const scene of SCENES) for (const surface of SURFACES) {
    assert.ok(contrastRatio(GAMEPLAY_COLORS.violet, scene[surface]) >= 6, `${scene.name}: violet on ${surface}`);
    assert.ok(contrastRatio(GAMEPLAY_COLORS.off, scene[surface]) >= 2.5, `${scene.name}: off on ${surface}`);
  }
});

test('danger and safe tokens differ by at least 25 CIELAB units', () => {
  assert.equal(colorDifference('#000000', '#000000'), 0);
  assert.ok(Math.abs(colorDifference('#000000', '#ffffff') - 100) < 0.01);
  assert.ok(colorDifference(GAMEPLAY_COLORS.danger, GAMEPLAY_COLORS.safe) >= 25);
});

test('platforms and neutral danger keep gold exclusive to rewards', () => {
  const C = GAMEPLAY_COLORS;
  assert.notEqual(C.platform, C.gold);
  assert.notEqual(C.danger, C.gold);
  assert.ok(colorDifference(C.platform, C.danger) >= 25);
});

test('all visible gameplay contours meet their contrast targets on every scene surface', () => {
  const targets = { cyan: 6, violet: 6, off: 2.5, danger: 3, safe: 6, platform: 6, reward: 6, white: 6, gold: 6 };
  for (const scene of SCENES) for (const surface of SURFACES) {
    for (const [token, minimum] of Object.entries(targets)) {
      assert.ok(contrastRatio(GAMEPLAY_COLORS[token], scene[surface]) >= minimum, `${scene.name} ${token} on ${surface}`);
    }
  }
});

test('stylesheet uses defined shared UI palette tokens', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  for (const [, token] of css.matchAll(/var\((--ui-[a-z0-9-]+)\)/g)) {
    assert.ok(UI_CSS_COLORS[token], `missing ${token}`);
  }
});
