import {defineConfig} from '@playwright/test';

// A component fixture: no Auth, database, seed or cleanup. Connected CI also
// discovers this spec alongside the full owned-stack collaboration stories.
export default defineConfig({
 testDir:'./tests/e2e',testMatch:['u06-workspace-service-state.spec.ts','u06-collaboration-tasks-layout.spec.ts','u16-workspace-loading-layout.spec.ts','u17-support-form-labels.spec.ts','u18-workspace-entry.spec.ts','u18-merchant-invitation-retention.spec.ts','u19-performance-first-usable.spec.ts'],
 workers:1,retries:0,reporter:'list',
 outputDir:'evidence/service-state-browser',use:{browserName:'chromium'},
});
