/** Repeatable local browser probe; the server and browser are owned and closed here. */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const port = 5189;
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
async function stopOnSignal() {
  server.kill('SIGTERM');
  if (browser) await browser.close();
  process.exit(124);
}
process.once('SIGTERM', stopOnSignal);
process.once('SIGINT', stopOnSignal);
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    if (server.exitCode !== null) throw new Error(`Vite exited (${server.exitCode}); port ${port} may be occupied`);
    try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch {}
    if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Vite did not become ready');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.locator('#playBtn').tap();
  const result = await page.evaluate(() => new Promise(resolve => {
    let last;
    const samples = [];
    function frame(time) {
      if (!document.querySelector('#overlay').hidden) return resolve({ samples, endedEarly: true });
      if (last !== undefined) samples.push(time - last);
      last = time;
      if (samples.length < 20) requestAnimationFrame(frame);
      else resolve({ samples, endedEarly: false });
    }
    requestAnimationFrame(frame);
  }));
  const sorted = [...result.samples].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  console.log(JSON.stringify({ viewport: '390x844', dpr: 3, cpuThrottle: 4, frames: sorted.length, endedEarly: result.endedEarly, meanMs: Math.round(mean * 10) / 10, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] }));
  if (sorted.length < 20) process.exitCode = 1;
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
