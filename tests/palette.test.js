import test from 'node:test';
import assert from 'node:assert/strict';
import { ART_PALETTES, contrastRatio, colorDifference } from '../src/art/palette.ts';

test('contrast utility uses linearized sRGB relative luminance', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#c778ff', '#c778ff'), 1);
});

test('all schemes keep violet and off-phase geometry legible on every scene surface', () => {
  assert.equal(ART_PALETTES.length, 3);
  for (const palette of ART_PALETTES) {
    for (const surface of [palette.top, palette.horizon, palette.floor]) {
      assert.ok(contrastRatio(palette.violet, surface) >= 6, `${palette.name}: violet on ${surface}`);
      assert.ok(contrastRatio(palette.off, surface) >= 2.5, `${palette.name}: off on ${surface}`);
    }
  }
});

test('danger and safe tokens differ by at least 25 CIELAB units in every scheme', () => {
  assert.equal(colorDifference('#000000', '#000000'), 0);
  assert.ok(Math.abs(colorDifference('#000000', '#ffffff') - 100) < 0.01);
  for (const palette of ART_PALETTES) {
    assert.ok(colorDifference(palette.danger, palette.safe) >= 25, palette.name);
  }
});


test('platforms and neutral danger keep gold exclusive to rewards', () => {
  for (const palette of ART_PALETTES) {
    assert.notEqual(palette.platform, palette.gold);
    assert.notEqual(palette.danger, palette.gold);
    assert.ok(colorDifference(palette.platform, palette.danger) >= 25, palette.name);
    for (const surface of [palette.top, palette.horizon, palette.floor]) {
      assert.ok(contrastRatio(palette.platform, surface) >= 6, palette.name);
    }
  }
});

test('all visible gameplay contours meet their contrast targets on every scheme', () => {
  const targets = { cyan: 6, violet: 6, off: 2.5, danger: 3, safe: 6, platform: 6, reward: 6, white: 6, gold: 6 };
  for (const palette of ART_PALETTES) for (const surface of [palette.top, palette.horizon, palette.floor]) {
    for (const [token, minimum] of Object.entries(targets)) {
      assert.ok(contrastRatio(palette[token], surface) >= minimum, `${palette.name} ${token} on ${surface}`);
    }
  }
});
