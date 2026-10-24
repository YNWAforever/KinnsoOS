import {defineConfig} from '@playwright/test';
// Actual browser/component presentation with transport ports. No DB/Auth/seed/cleanup.
export default defineConfig({testDir:'./tests/e2e',testMatch:'u21-pilot-presentation.spec.ts',workers:1,retries:0,reporter:'list',outputDir:'evidence/pilot-presentation-browser',use:{browserName:'chromium'}});
