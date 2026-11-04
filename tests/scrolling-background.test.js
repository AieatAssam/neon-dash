import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollingTiles, blendHex } from '../src/art/scrolling-background.ts';

test('palette crossfade has stable endpoints and a continuous midpoint', () => {
  assert.equal(blendHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(blendHex('#000000', '#ffffff', .5), '#808080');
  assert.equal(blendHex('#000000', '#ffffff', 1), '#ffffff');
});

test('tile identity and appearance stay fixed as scroll crosses tile boundaries', () => {
  const before = scrollingTiles(499, 700, 110, 0.18, 1);
  const after = scrollingTiles(501, 700, 110, 0.18, 1);
  for (const tile of before) {
    const next = after.find(candidate => candidate.index === tile.index);
    assert.ok(next, `tile ${tile.index} remains in overscan`);
    assert.equal(next.seed, tile.seed);
    assert.ok(Math.abs((next.x - tile.x) + 0.36) < 1e-9);
  }
});

test('tiles cover the full viewport continuously at arbitrary scroll positions', () => {
  for (const distance of [0, 1, 609.9, 610, 12345.67]) {
    const tiles = scrollingTiles(distance, 900, 110, 0.18, 1);
    const xPositions = tiles.map(tile => tile.x).sort((a, b) => a - b);
    assert.ok(xPositions[0] <= 0);
    assert.ok(xPositions.at(-1) >= 900);
    for (let i = 1; i < xPositions.length; i++) assert.ok(Math.abs(xPositions[i] - xPositions[i - 1] - 110) < 1e-9);
  }
});

test('invalid dimensions are rejected', () => {
  assert.throws(() => scrollingTiles(0, 100, 0, 1), RangeError);
});
