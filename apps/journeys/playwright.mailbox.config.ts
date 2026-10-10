import {defineConfig} from '@playwright/test';
import connected from './playwright.connected.config';
export default defineConfig({...connected,testMatch:['**/auth-mailbox.spec.ts'],timeout:60000,
 outputDir:'./evidence/mailbox-browser',use:{...connected.use,trace:'off',screenshot:'off',video:'off'}});
