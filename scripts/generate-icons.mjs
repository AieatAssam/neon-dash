// Writes public/icons/* from scripts/icon-art.mjs. Usage: npm run icons
import { writeFileSync } from 'node:fs';
import { ICONS, renderIcon } from './icon-art.mjs';
import { encodePng } from './png.mjs';

for (const icon of ICONS) {
  const { rgba } = renderIcon(icon);
  const path = new URL(`../public/icons/${icon.file}`, import.meta.url);
  writeFileSync(path, encodePng(icon.size, icon.size, rgba));
  console.log(`${icon.file} ${icon.size}x${icon.size} (${icon.variant})`);
}
