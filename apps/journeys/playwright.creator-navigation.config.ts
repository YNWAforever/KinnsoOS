import {defineConfig,devices} from '@playwright/test';

// Component browser coverage with isolated transport; no server or DB required.
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'creator-draft-navigation.spec.ts',
 workers:1,retries:0,timeout:30000,reporter:'list',
 outputDir:'./evidence/creator-navigation-browser',
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
});
