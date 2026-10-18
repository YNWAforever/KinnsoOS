import {defineConfig} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {expected,validateApproval,root} from './tests/real-integration/target.mjs';

const location=process.env.KINNSO_REAL_IT_APPROVAL_FILE;
if(!location)throw new Error('BLOCKED_APPROVAL_REQUIRED');
const approval=JSON.parse(readFileSync(location,'utf8'));
validateApproval(approval,execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
if(approval.testSelection!=='TODAY_SLICE_4')throw new Error('UNAPPROVED_TEST_SELECTION');
if(!process.env.KINNSO_REAL_IT_EVIDENCE)throw new Error('BLOCKED_EVIDENCE_DIRECTORY_REQUIRED');

export default defineConfig({
 testDir:'./tests/real-integration',testMatch:'today-slice.spec.ts',fullyParallel:false,workers:1,retries:0,
 reporter:[['list']],outputDir:path.join(process.env.KINNSO_REAL_IT_EVIDENCE,'playwright-today-artifacts'),
 timeout:120000,use:{baseURL:expected.appOrigin,trace:'off',screenshot:'off',video:'off'},
 projects:[{name:'chromium-today-slice',use:{browserName:'chromium',headless:true}}],
});
