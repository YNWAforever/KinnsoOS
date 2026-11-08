import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',testMatch:['studio-creator-flow.spec.ts'],workers:1,retries:0,timeout:30000,
 reporter:[['list'],['json',{outputFile:'../../docs/implementation/evidence/conversation-studio/browser-results.json'}]],
 outputDir:'../../docs/implementation/evidence/conversation-studio/browser',
 use:{baseURL:'http://127.0.0.1:3497',browserName:'chromium',headless:true},
 webServer:{command:'node tests/studio-fixture/server.mjs',url:'http://127.0.0.1:3497',reuseExistingServer:false,timeout:30000},
});
