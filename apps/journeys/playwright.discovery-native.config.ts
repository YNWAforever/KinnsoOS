import {defineConfig} from '@playwright/test';
/** Actual Next server, strictly disconnected. No schema, credentials or provider. */
export default defineConfig({testDir:'./tests/e2e',testMatch:['discovery-native.spec.ts'],workers:1,retries:0,timeout:30000,
 reporter:[['list'],['json',{outputFile:'../../docs/implementation/evidence/discovery-native/native-disabled-browser.json'}]],
 outputDir:'../../docs/implementation/evidence/discovery-native/native-disabled-browser',
 use:{baseURL:'http://127.0.0.1:3498',browserName:'chromium',headless:true},
 webServer:{command:'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3498',url:'http://127.0.0.1:3498/zh-HK',reuseExistingServer:false,timeout:60000,
  env:{NEXT_TELEMETRY_DISABLED:'1',KINNSO_SITE_URL:'http://127.0.0.1:3498',KINNSO_SUPABASE_URL:'',KINNSO_APPROVED_SUPABASE_ORIGIN:'',KINNSO_LEGACY_AUTH_ORIGIN:'',KINNSO_SUPABASE_PUBLISHABLE_KEY:'',KINNSO_SUPABASE_SECRET_KEY:'',KINNSO_ENABLED_CAPABILITIES:'',KINNSO_SYNTHETIC_RUN:'true'}},
});
