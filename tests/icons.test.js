import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, MASKABLE_SAFE_RADIUS, renderIcon } from '../scripts/icon-art.mjs';
import { decodePng } from '../scripts/png.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const rendered = new Map(ICONS.map(icon => [icon.file, renderIcon(icon)]));

function walk(dir) {
  return readdirSync(new URL(dir, root)).flatMap(name => {
    const path = `${dir}/${name}`;
    return statSync(new URL(path, root)).isDirectory() ? walk(path) : [path];
  });
}

test('committed icons match the generator; run `npm run icons` after palette or art changes', () => {
  for (const icon of ICONS) {
    const png = decodePng(read(`public/icons/${icon.file}`));
    assert.equal(png.width, icon.size, icon.file);
    assert.equal(png.height, icon.size, icon.file);
    const { rgba } = rendered.get(icon.file);
    let worst = 0;
    for (let i = 0; i < rgba.length; i++) worst = Math.max(worst, Math.abs(rgba[i] - png.rgba[i]));
    assert.ok(worst <= 1, `${icon.file} differs from the generator by ${worst}`);
  }
});

test('the maskable icon keeps the cube, spike and sun inside the safe circle', () => {
  const icon = ICONS.find(i => i.variant === 'maskable');
  const { essential } = rendered.get(icon.file);
  const n = icon.size, limit = MASKABLE_SAFE_RADIUS * n;
  let painted = 0, farthest = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (essential[j * n + i] <= 0) continue;
    painted++;
    farthest = Math.max(farthest, Math.hypot(i + .5 - n / 2, j + .5 - n / 2));
  }
  assert.ok(painted > n * n * .05);
  assert.ok(farthest <= limit, `essential art reaches ${farthest.toFixed(1)} px, safe radius is ${limit} px`);
});

test('tile and maskable variants have the right alpha: rounded corners vs full bleed', () => {
  for (const icon of ICONS) {
    const { rgba } = rendered.get(icon.file);
    const corner = rgba[3], center = rgba[((icon.size >> 1) * icon.size + (icon.size >> 1)) * 4 + 3];
    assert.equal(center, 255, icon.file);
    assert.equal(corner, icon.variant === 'any' || icon.variant === 'favicon' ? 0 : 255, icon.file);
  }
});

test('manifest and page link every icon at its real size', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  const html = read('index.html').toString();
  const linked = new Set();
  for (const entry of manifest.icons) {
    const file = entry.src.replace('./icons/', '');
    const icon = ICONS.find(i => i.file === file);
    assert.ok(icon, `manifest names unknown icon ${entry.src}`);
    assert.equal(entry.sizes, `${icon.size}x${icon.size}`, entry.src);
    assert.equal(entry.purpose === 'maskable', icon.variant === 'maskable', entry.src);
    linked.add(file);
  }
  for (const [, href] of html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\.\/icons\/([^"]+)"/g)) linked.add(href);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="icon" href="\.\/icons\/favicon-32\.png" sizes="32x32" type="image\/png">/);
  for (const icon of ICONS) assert.ok(linked.has(icon.file), `${icon.file} is not linked`);
});

test('the retired violet #C778FF appears in no shipped asset', () => {
  const shipped = ['index.html', 'style.css', 'vite.config.js', ...walk('public'), ...walk('src'),
    ...readdirSync(root).filter(name => /\.(ts|js)$/.test(name))];
  for (const path of shipped) {
    if (path.endsWith('.png')) {
      const { rgba } = decodePng(read(path));
      let hits = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] && Math.abs(rgba[i] - 0xc7) <= 6 && Math.abs(rgba[i + 1] - 0x78) <= 6 && Math.abs(rgba[i + 2] - 0xff) <= 6) hits++;
      }
      assert.equal(hits, 0, `${path} paints ${hits} pixels of retired violet`);
    } else if (/\.(html|css|js|ts|mjs|json|webmanifest|svg)$/.test(path)) {
      assert.doesNotMatch(read(path).toString(), /c778ff|199\s*,\s*120\s*,\s*255/i, path);
    }
  }
});
