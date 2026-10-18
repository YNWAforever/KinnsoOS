import {defineConfig} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {expected,validateApproval,root} from './tests/real-integration/target.mjs';

const location=process.env.KINNSO_REAL_IT_APPROVAL_FILE;
if(!location)throw new Error('BLOCKED_APPROVAL_REQUIRED');
let approval;try{approval=JSON.parse(readFileSync(location,'utf8'))}catch{throw new Error('BLOCKED_APPROVAL_RECORD_UNREADABLE')}
validateApproval(approval,execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
if(!process.env.KINNSO_REAL_IT_EVIDENCE)throw new Error('BLOCKED_EVIDENCE_DIRECTORY_REQUIRED');

export default defineConfig({
 testDir:'./tests/real-integration',testMatch:'stale-tab.spec.ts',fullyParallel:false,workers:1,retries:0,
 reporter:[['list']],outputDir:path.join(process.env.KINNSO_REAL_IT_EVIDENCE,'playwright-stale-artifacts'),
 timeout:90000,use:{baseURL:expected.appOrigin,trace:'off',screenshot:'off',video:'off'},
 projects:[{name:'chromium-stale-tab',use:{browserName:'chromium',headless:true}}],
});
