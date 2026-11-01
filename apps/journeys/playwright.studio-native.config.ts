import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',testMatch:['studio-native.spec.ts'],workers:1,retries:0,timeout:60000,
 reporter:[['list'],['json',{outputFile:'../../docs/implementation/evidence/conversation-studio/native-results.json'}]],
 outputDir:'../../docs/implementation/evidence/conversation-studio/native',use:{baseURL:'http://127.0.0.1:3498',browserName:'chromium'},
 webServer:{command:'pnpm exec next dev --hostname 127.0.0.1 --port 3498',url:'http://127.0.0.1:3498/zh-HK',reuseExistingServer:false,timeout:120000,env:{KINNSO_SUPABASE_URL:'',KINNSO_APPROVED_SUPABASE_ORIGIN:'',KINNSO_LEGACY_AUTH_ORIGIN:'',KINNSO_SUPABASE_PUBLISHABLE_KEY:'',KINNSO_SUPABASE_SECRET_KEY:'',KINNSO_ENABLED_CAPABILITIES:'',KINNSO_SYNTHETIC_RUN:'true'}},
});
