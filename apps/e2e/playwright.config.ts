import { defineConfig, devices } from '@playwright/test'
import { resolveE2EBaseURL } from './e2e-target'

// Resolved while the config module evaluates, so an unguarded remote target fails before
// Playwright launches a browser rather than after the first spec has written to it.
const baseURL = resolveE2EBaseURL(process.env)

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  timeout: process.env.CI ? 120_000 : 30_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})