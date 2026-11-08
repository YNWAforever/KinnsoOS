import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {repositoryInputUrl} from './packaged-source.mjs';
let subject={};
try{subject=await import('../lib/seo/public-phase-envelope.ts')}catch{}

const routes=['articles','articles/[category]','articles/[category]/[url]','c/[handle]','destinations','destinations/[slug]','experiences/[slug]','g/[slug]','m/[slug]','sessions','sessions/[slug]'];
const base={schemaVersion:1,status:'READY_FOR_USER_REVIEW',codeHead:'43fa96ba563ef5635dc78b5f2d0dedfb690f2f21',project:'kinnsoos-public-it-20261106',finalTarget:{name:'kinnso-os.vercel.app',productionChanged:false},routes:routes.map(path=>({legacyPath:'/{locale}/'+path,nativePath:'/{locale}/'+path,disposition:'accepted-public-read',evidenceKinds:['LOCAL_FIXTURE_UI_ONLY','REAL_ISOLATED_TARGET']})),locales:['en','zh-HK','zh-tw','zh-cn','ja','ko','th'],browser:{viewports:[390,1280],javaScript:[false,true],keyboard:true,accessibility:true,reflow:true},sessions:{present:true,absent:true,failure:true},security:{withdrawal:true,suspension:true,crossAccountIsolation:true,duplicateProtected:true},tests:{unit:'PASS',typecheck:'PASS',build:'PASS',fixtureBrowser:'PASS_28',connected:'PASS_8'},backupRestore:'WAIVED'};

test('complete phase envelope binds the exact source and all acceptance dimensions',()=>{
 assert.equal(typeof subject.validatePublicPhaseEnvelope,'function');
 const result=subject.validatePublicPhaseEnvelope(base);assert.equal(result.status,'READY_FOR_USER_REVIEW');assert.equal(result.codeHead,base.codeHead);
 const patches=[
  {codeHead:'0'.repeat(40)},{project:'kinnso-v3'},{finalTarget:{name:'kinnso-os.vercel.app',productionChanged:true}},
  {backupRestore:'PASS'},{locales:['en','zh-HK']},{browser:{...base.browser,keyboard:false}},
  {browser:{...base.browser,accessibility:false}},{sessions:{present:true,absent:false,failure:true}},
  {security:{...base.security,withdrawal:false}},{tests:{...base.tests,connected:'PASS_7'}},
 ];
 for(const patch of patches)assert.throws(()=>subject.validatePublicPhaseEnvelope({...base,...patch}),error=>Boolean(error.code),'INVALID_ENVELOPE',JSON.stringify(patch));
});

test('fixture evidence cannot claim connected acceptance and SHA mismatch invalidates results',()=>{
 const localOnly={...base,routes:base.routes.map(route=>({...route,evidenceKinds:['LOCAL_FIXTURE_UI_ONLY']}))};
 assert.throws(()=>subject.validatePublicPhaseEnvelope(localOnly),error=>error.code==='CONNECTED_EVIDENCE_REQUIRED');
 const stale={...base,connectedResult:{productHead:'f'.repeat(40),passed:8,expected:8}};
 assert.throws(()=>subject.validatePublicPhaseEnvelope(stale),error=>error.code==='EVIDENCE_SHA_MISMATCH');
});

test('reviewable envelope document and route matrix expose only this phase as accepted',async()=>{
 const document=await readFile(repositoryInputUrl('docs/public-destination-phase-envelope-2026-11-06.md',import.meta.url),'utf8');
 const block=document.match(/```json\s*([\s\S]*?)\s*```/);assert.ok(block);
 const envelope=JSON.parse(block[1]);assert.equal(subject.validatePublicPhaseEnvelope(envelope).status,'READY_FOR_USER_REVIEW');
 const matrix=JSON.parse(await readFile(repositoryInputUrl('docs/legacy-route-matrix.json',import.meta.url),'utf8'));
 for(const route of envelope.routes){const row=matrix.routes.find(value=>value.legacyPath===route.legacyPath);assert.ok(row,route.legacyPath);assert.equal(row.disposition,'native-port-accepted',route.legacyPath);assert.equal(row.verification,'CONNECTED_BACKEND_AND_FIXTURE_BROWSER',route.legacyPath);}
 const booked=matrix.routes.find(value=>value.legacyPath==='/{locale}/experiences/[slug]/booked');assert.notEqual(booked.disposition,'native-port-accepted');
 assert.equal(/backup\/restore remains waived/i.test(document),true);
 assert.equal(/production remains unchanged/i.test(document),true);
});
