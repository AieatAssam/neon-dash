import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './layout-tests',
  timeout: 30000,
  use: { headless: true },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', timeout: 30000, reuseExistingServer: false },
});
