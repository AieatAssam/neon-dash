import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const OUT = '/opt/cursor/artifacts';
const DEV_PORT = 5173;

async function waitFor(url, ms = 45000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Server not ready: ${url}`);
}

function startDev() {
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(DEV_PORT)], {
    cwd: process.cwd(), stdio: 'ignore',
  });
}

async function captureSet(tag, baseUrl, { verticalDemo = true } = {}) {
  const browser = await chromium.launch();
  const shots = [
    ['phone-390x844', { width: 390, height: 844 }],
    ['phone-360x640', { width: 360, height: 640 }],
    ['landscape-844x390', { width: 844, height: 390 }],
  ];
  for (const [name, viewport] of shots) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.height > viewport.width });
    const page = await context.newPage();
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
    await context.close();
  }
  const intro = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
  const introPage = await intro.newPage();
  await introPage.route('https://fonts.googleapis.com/**', route => route.abort());
  await introPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await introPage.locator('#playBtn').tap();
  await introPage.waitForTimeout(20000);
  await intro.close();

  if (verticalDemo) {
    const vertical = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
      recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
    const vPage = await vertical.newPage();
    await vPage.route('https://fonts.googleapis.com/**', route => route.abort());
    await vPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await vPage.locator('#playBtn').tap();
    await vPage.waitForTimeout(600);
    await vPage.evaluate(() => window.__enterVerticalTest?.(17));
    const initial = await vPage.evaluate(() => window.__verticalTestState?.());
    if (initial && initial.phase !== initial.firstSafePhase) await vPage.locator('#phaseBtn').tap();
    await vPage.waitForTimeout(4500);
    await vertical.close();
  }
  await browser.close();
}

await mkdir(OUT, { recursive: true });
const dev = startDev();
try {
  const base = `http://127.0.0.1:${DEV_PORT}/`;
  await waitFor(base);
  await captureSet(process.argv[2] || 'after-overhaul', base, { verticalDemo: process.argv[2] !== 'before-baseline' });
  console.log('Artifacts saved to', OUT);
} finally {
  dev.kill('SIGTERM');
}
