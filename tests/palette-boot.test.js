import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteStyle } from '../vite.config.js';
import { UI_CSS_COLORS } from '../src/art/palette.ts';

test('first-paint palette contains the shared UI colors before the game loads', async () => {
  const css = await paletteStyle();
  assert.ok(css.startsWith(':root{'));
  for (const [name, value] of Object.entries(UI_CSS_COLORS)) assert.ok(css.includes(`${name}:${value}`), name);
});

test('first-paint styles follow charset and precede the stylesheet', async () => {
  const { inlinePalette } = await import('../vite.config.js');
  const html = '<html><head><meta charset="UTF-8"><link rel="stylesheet" href="style.css"></head></html>';
  const result = await inlinePalette().transformIndexHtml(html);
  assert.ok(result.indexOf('charset') < result.indexOf('palette-tokens'));
  assert.ok(result.indexOf('palette-tokens') < result.indexOf('stylesheet'));
});
