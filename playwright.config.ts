import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 45000,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } },
  webServer: { command: 'node scripts/dev.mjs', url: 'http://127.0.0.1:3000', reuseExistingServer: false, timeout: 120000, env: { HOTL_TEST_INSTANCE_DIR: resolve('.data', `e2e-${randomUUID()}`) } },
});
