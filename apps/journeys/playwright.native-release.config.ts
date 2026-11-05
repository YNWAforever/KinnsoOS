import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/real-integration',testMatch:'native-journey.spec.ts',workers:1,retries:0,timeout:60000,reporter:[['list']],outputDir:'../../.local-private/browser-candidate-20261105/browser-output',use:{browserName:'chromium',headless:true,trace:'off',screenshot:'off',video:'off'}});
