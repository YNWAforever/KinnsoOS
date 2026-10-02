import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 30_000, reporter: [['list']],
  outputDir: './evidence/browser',
  use: { baseURL: 'http://127.0.0.1:3491', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 3491', url: 'http://127.0.0.1:3491/en',
    reuseExistingServer: process.env.KINNSO_REUSE_PREVIEW === '1', timeout: 120_000,
  },
});
