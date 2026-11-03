import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

export async function paletteStyle() {
  const source = await readFile(new URL('./src/art/palette.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  const palette = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return `:root{${Object.entries(palette.UI_CSS_COLORS).map(([name, color]) => `${name}:${color}`).join(';')}}`;
}

export function inlinePalette() {
  return {
    name: 'inline-palette-before-first-paint',
    async transformIndexHtml(html) {
      const css = await paletteStyle();
      return html.replace(/(<meta\s+charset=[^>]+>)/i, `$1<style id="palette-tokens">${css}</style>`);
    },
  };
}

export default defineConfig({ base: './', plugins: [inlinePalette()], build: { rollupOptions: { output: { manualChunks(id) { if (id.includes('/node_modules/phaser/')) return 'phaser'; } } } } });
