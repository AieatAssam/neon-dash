import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
await page.route('https://fonts.googleapis.com/**', route => route.abort());
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.locator('#playBtn').tap();
await page.evaluate(() => window.__enterVerticalTest(17));
await page.waitForTimeout(900);
await page.screenshot({ path: '/workspace/docs/media/color-wall-390.png' });
await page.screenshot({ path: '/opt/cursor/artifacts/after-overhaul-vertical-390x844.png' });
await browser.close();
