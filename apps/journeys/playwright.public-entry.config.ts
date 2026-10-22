import {defineConfig} from '@playwright/test';

// Real Next routing with every backend capability disabled. No shared target.
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'u20-public-entry.spec.ts',workers:1,retries:0,
 reporter:'list',outputDir:'evidence/public-entry-browser',
 use:{baseURL:'http://127.0.0.1:3496',browserName:'chromium'},
 webServer:{command:'npm run dev -- --port 3496',url:'http://127.0.0.1:3496/en/workspace',reuseExistingServer:false,timeout:120_000,
  env:{KINNSO_SUPABASE_URL:'',KINNSO_APPROVED_SUPABASE_ORIGIN:'',KINNSO_LEGACY_AUTH_ORIGIN:'',KINNSO_SUPABASE_PUBLISHABLE_KEY:'',KINNSO_ENABLED_CAPABILITIES:'',KINNSO_SYNTHETIC_RUN:'true'}},
});
