/** Repeatable local browser probe against the production bundle. */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const port = 5189;
const warmupFrames = 5;
const measuredFrames = 20;
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
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  // Endless mode keeps retries comparable and avoids a fixed finish line.
  await page.locator('input[name="gameMode"][value="endless"]').check();
  const samples = [];
  let endedEarly = false;
  let attempts = 0;
  for (; attempts < maxAttempts && samples.length < measuredFrames; attempts++) {
    await page.locator('#playBtn').tap();
    const result = await page.evaluate(({ warmupFrames, needed }) => new Promise(resolve => {
      let last;
      let frameCount = 0;
      const samples = [];
      function frame(time) {
        if (!document.querySelector('#overlay').hidden) return resolve({ samples, endedEarly: true });
        if (last !== undefined && frameCount >= warmupFrames) samples.push(time - last);
        last = time;
        frameCount++;
        if (samples.length < needed) requestAnimationFrame(frame);
        else resolve({ samples, endedEarly: false });
      }
      requestAnimationFrame(frame);
    }), { warmupFrames, needed: measuredFrames - samples.length });
    samples.push(...result.samples);
    endedEarly ||= result.endedEarly;
  }
  attempts = Math.min(attempts, maxAttempts);
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  const round = value => Math.round(value * 10) / 10;
  console.log(JSON.stringify({
    viewport: '390x844', dpr: 3, cpuThrottle: 4,
    warmupFrames, frames: sorted.length, attempts, maxAttempts, endedEarly,
    meanMs: round(mean), medianMs: round(percentile(.5)), p95Ms: round(percentile(.95)),
    p99Ms: round(percentile(.99)), stddevMs: round(Math.sqrt(variance)),
    over25ms: sorted.filter(value => value > 25).length,
  }));
  if (sorted.length < measuredFrames) process.exitCode = 1;
  await context.close();
} finally {
  await cleanup();
  clearTimeout(watchdog);
}
