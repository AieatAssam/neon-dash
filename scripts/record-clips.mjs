// Records deterministic gameplay clips by stepping the real game one frame at a time.
// Usage: node scripts/record-clips.mjs [baseUrl=http://127.0.0.1:5173/] [outDir=/opt/cursor/artifacts/clips] [clipName ...]
// Needs ffmpeg on PATH. Each clip is a fresh first-time player (empty storage).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [baseUrl = 'http://127.0.0.1:5173/', outDir = '/opt/cursor/artifacts/clips', ...only] = process.argv.slice(2);
const FPS = 30;

const clips = {
  // The first 20 s of a clean run, menu included.
  'opening-20s': { title: 1.5, play: { seed: 7, bot: 'good' }, seconds: 20, gif: true },
  // Warning banner, portal, rotate warp with slow-mo, one-line tutorial, first gates.
  'vertical-transition': { play: { seed: 7, bot: 'good', skipTo: 'cue' }, seconds: 13, gif: true },
  // Twenty-odd seconds of shaft play.
  'vertical-20s': { play: { seed: 7, bot: 'good', skipTo: 'vertical' }, seconds: 22 },
  'vertical-transition-landscape': { play: { seed: 7, bot: 'good', skipTo: 'cue' }, seconds: 13, size: 'landscape' },
  // A sloppy player (late, jittery, stray taps): dies once, retries, and reaches the shaft.
  'sloppy-bot': { play: { seed: 7, bot: 'sloppy', botSeed: 49, retry: true }, seconds: 50 },
};

const sizes = { portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [name, clip] of Object.entries(clips)) {
  if (only.length && !only.includes(name)) continue;
  const viewport = clip.size ? sizes[clip.size] : sizes.portrait;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: viewport.width < viewport.height });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Boolean(window.__harness));
  await page.waitForTimeout(400);
  const frames = join('/tmp', `frames-${name}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  await page.evaluate(() => window.__harness.manual(true));
  let index = 0;
  const shoot = async () => page.screenshot({ path: join(frames, `${String(index++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
  for (let i = 0; i < (clip.title ?? 0) * FPS; i++) { await page.evaluate(ms => window.__harness.frame(ms), 1000 / FPS); await shoot(); }
  await page.evaluate(options => window.__harness.play(options), clip.play);
  const log = [];
  for (let i = 0; i < clip.seconds * FPS; i++) {
    await page.evaluate(ms => window.__harness.frame(ms), 1000 / FPS);
    await shoot();
    if (i % FPS === 0) log.push(await page.evaluate(() => window.__harness.state()));
  }
  const mp4 = join(outDir, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%05d.jpg'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
  if (clip.gif) {
    const gif = join(outDir, `${name}.gif`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%05d.jpg'),
      '-vf', 'fps=15,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
  }
  const last = log.at(-1);
  console.log(`${name}: ${index} frames -> ${mp4}`);
  console.log('  ' + log.map(s => `${s.time.toFixed(0)}s:${s.percent}%${s.vertical ? 'V' : ''}${s.mode === 'running' ? '' : `(${s.mode})`}#${s.attempt}`).join(' '));
  console.log(`  end: ${JSON.stringify(last)}`);
  await context.close();
}
await browser.close();
