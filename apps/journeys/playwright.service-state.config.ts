import {defineConfig} from '@playwright/test';

// A component fixture: no Auth, database, seed or cleanup. Connected CI also
// discovers this spec alongside the full owned-stack collaboration stories.
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'u06-workspace-service-state.spec.ts',
 workers:1,retries:0,reporter:'list',
 outputDir:'evidence/service-state-browser',use:{browserName:'chromium'},
});
