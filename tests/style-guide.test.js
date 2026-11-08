import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').toLowerCase();
const hexes = text => [...new Set(text.match(/#[0-9a-f]{6}\b/g))];

test('the style guide documents every palette hex', () => {
  const guide = read('docs/art/style-guide.md');
  const missing = hexes(read('src/art/palette.ts')).filter(hex => !guide.includes(hex));
  assert.deepEqual(missing, [], 'add these to docs/art/style-guide.md');
});

test('the style guide lists no colors the palette no longer ships, apart from the retired violet', () => {
  const palette = read('src/art/palette.ts');
  const stale = hexes(read('docs/art/style-guide.md')).filter(hex => !palette.includes(hex) && hex !== '#c778ff');
  assert.deepEqual(stale, [], 'remove or update these in docs/art/style-guide.md');
});
