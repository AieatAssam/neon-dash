/** Repeatable local browser probe against the production bundle. */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { summarizeRuns } from './perf-stats.mjs';

const port = 5189;
const warmupFrames = 5;
const measuredFrames = 20;
const targetRuns = 3;
const maxAttempts = 5;
// Keep a stalled browser/probe from leaving `npm run perf` in the foreground
// indefinitely. The handler below still runs the normal child/browser cleanup.
const probeTimeoutMs = 90_000;
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
let stopping;

async function cleanup() {
  if (stopping) return stopping;
  stopping = (async () => {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => {
        const timer = setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 2000);
        server.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  })();
  return stopping;
}

async function stopOnSignal(signal) {
  await cleanup();
  process.exit(signal === 'SIGINT' ? 130 : 143);
}
process.once('SIGTERM', () => { void stopOnSignal('SIGTERM'); });
process.once('SIGINT', () => { void stopOnSignal('SIGINT'); });
const watchdog = setTimeout(() => {
  console.error(`Performance probe timed out after ${probeTimeoutMs}ms`);
  const forceExit = setTimeout(() => process.exit(124), 3000);
  void cleanup().finally(() => {
    clearTimeout(forceExit);
    process.exit(124);
  });
}, probeTimeoutMs);

try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    if (server.exitCode !== null) throw new Error(`Vite preview exited (${server.exitCode}); port ${port} may be occupied`);
    try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch {}
    if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Vite preview did not become ready');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  // Fix the generated opening without adding any runtime debug interface.
  await page.addInitScript(() => { Math.random = () => 0.25; });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  // Endless mode keeps retries comparable and avoids a fixed finish line.
  await page.locator('input[name="gameMode"][value="endless"]').check();
  const runs = [];
  const started = Date.now();
  for (let attempt = 0; attempt < maxAttempts && runs.filter(run => !run.endedEarly && run.samples.length === measuredFrames).length < targetRuns; attempt++) {
    if (await page.locator('#overlay').isVisible()) await page.locator('#playBtn').tap();
    else await page.keyboard.press('KeyR');
    const result = await page.evaluate(({ warmupFrames, measuredFrames }) => new Promise(resolve => {
      let last;
      let frameCount = 0;
      const samples = [];
      function frame(time) {
        if (!document.querySelector('#overlay').hidden) return resolve({ samples, endedEarly: true });
        if (last !== undefined && frameCount >= warmupFrames) samples.push(time - last);
        last = time;
        frameCount++;
        if (samples.length < measuredFrames) requestAnimationFrame(frame);
        else resolve({ samples, endedEarly: false });
      }
      requestAnimationFrame(frame);
    }), { warmupFrames, measuredFrames });
    runs.push(result);
  }
  const summary = summarizeRuns(runs, measuredFrames);
  const backing = await page.locator('canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight }));
  if (backing.width !== Math.round(backing.cssWidth * 3) || backing.height !== Math.round(backing.cssHeight * 3)) throw new Error('Canvas backing size does not match DPR 3');
  console.log(JSON.stringify({ viewport: '390x844', dpr: 3, cpuThrottle: 4, browser: browser.version(), seedSource: 'fixed Math.random=0.25', warmupFrames, measuredFrames, targetRuns, elapsedMs: Date.now() - started, backing, ...summary }));
  if (summary.completedRuns < targetRuns) process.exitCode = 1;
  await context.close();
} finally {
  await cleanup();
  clearTimeout(watchdog);
}
