import {defineConfig} from '@playwright/test';
// Actual browser/component presentation with transport ports. No DB/Auth/seed/cleanup.
export default defineConfig({testDir:'./tests/e2e',testMatch:['u21-pilot-presentation.spec.ts','pilot-control-room-ui.spec.ts','pilot-participant-ui.spec.ts','pr115-review-ui.spec.ts'],workers:1,retries:0,reporter:'list',outputDir:'evidence/pilot-presentation-browser',use:{browserName:'chromium',channel:process.env.KINNSO_PILOT_BROWSER_CHANNEL}});
