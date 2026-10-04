import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',testMatch:['**/creator-workspace.spec.ts','**/u0*.spec.ts','**/seo-migration.spec.ts','**/agent-workspace.spec.ts','**/inbox-support-workspace.spec.ts','**/ssr-private-trip-heading.spec.ts'],fullyParallel:false,workers:1,retries:0,timeout:30000,
 outputDir:'./evidence/connected-browser',reporter:[['list']],use:{baseURL:'http://127.0.0.1:3495',trace:'off'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{command:'node scripts/start-connected-local.mjs',url:'http://127.0.0.1:3495/en',reuseExistingServer:false,timeout:120000}});
