import {defineConfig} from '@playwright/test';

export default defineConfig({
 testDir:'./tests/e2e',testMatch:['studio-home-continuation.spec.ts','studio-trip-draft.spec.ts'],
 workers:1,retries:0,timeout:30000,reporter:'list',
 outputDir:'./test-results/home-continuation',
 use:{baseURL:'http://127.0.0.1:3496',browserName:'chromium',headless:true,
  launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}},
 webServer:{
  command:'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3496',
  url:'http://127.0.0.1:3496/en',reuseExistingServer:false,timeout:120000,
  env:{KINNSO_SUPABASE_URL:'',KINNSO_APPROVED_SUPABASE_ORIGIN:'',KINNSO_LEGACY_AUTH_ORIGIN:'',KINNSO_SUPABASE_PUBLISHABLE_KEY:'',KINNSO_SUPABASE_SECRET_KEY:'',KINNSO_ENABLED_CAPABILITIES:'',KINNSO_SYNTHETIC_RUN:'true'},
 },
});
