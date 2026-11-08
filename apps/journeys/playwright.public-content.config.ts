import{defineConfig}from '@playwright/test';
import{readFileSync}from 'node:fs';
import{execFileSync}from 'node:child_process';
import path from 'node:path';
import{publicTargetConfiguration,validatePublicApproval,root}from './tests/real-public-content/target.mjs';

const location=process.env.KINNSO_REAL_IT_APPROVAL_FILE;
if(!location)throw Error('BLOCKED_APPROVAL_REQUIRED');
const approval=JSON.parse(readFileSync(location,'utf8'));
const target=publicTargetConfiguration(process.env);
validatePublicApproval(approval,execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),{env:process.env});
if(approval.testSelection!=='PUBLIC_CONTENT_8')throw Error('UNAPPROVED_TEST_SELECTION');
if(!process.env.KINNSO_REAL_IT_EVIDENCE)throw Error('BLOCKED_EVIDENCE_DIRECTORY_REQUIRED');

export default defineConfig({
 testDir:'./tests/real-public-content',testMatch:'journey.spec.ts',fullyParallel:false,workers:1,retries:0,
 reporter:[['list']],outputDir:path.join(process.env.KINNSO_REAL_IT_EVIDENCE,'playwright-public-content-artifacts'),
 timeout:120000,use:{baseURL:target.appOrigin,trace:'off',screenshot:'off',video:'off'},
 projects:[{name:'edge-public-content',use:{browserName:'chromium',channel:'msedge',headless:true}}],
});
