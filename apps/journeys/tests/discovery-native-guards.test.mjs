import {test} from 'node:test';import assert from 'node:assert/strict';import {discoveryModule} from './helpers/discovery-load.mjs';
const bridge=await discoveryModule('native-bridge','integrations/smeassistant'),projection=await discoveryModule('native-projection'),ops=await discoveryModule('operations');
const now=Date.parse('2026-11-01T00:00:00Z'),ref={offerId:'offer',revision:1,hash:'a'.repeat(64),locationId:'location'};
function setup(){let active=true;const scope={companyId:'company',workspaceId:'workspace',locationIds:['location'],readRefreshAllowed:true,scopeVersion:3,linkVersion:1};const client={call:async()=>({schemaVersion:'kinnso.sme.read.v1',status:'ready',requestId:'sample',observedAt:new Date(now).toISOString(),scope:{workspaceId:'workspace',locationId:'location',scopeVersion:3},data:{items:[{offerId:'offer',state:'current',currentRevision:1,checkedAt:new Date(now).toISOString()}]},warnings:[]})};return {scope,client,ports:{link:async()=>active?scope:null,clock:()=>now},revoke:()=>{active=false;}};}
test('fresh native evidence checks exact scope and every reference before allowing a writer',async()=>{const s=setup();assert.equal((await bridge.validateNativeOfferRefs(s.client,s.ports,'link',[ref])).ok,true);s.scope.scopeVersion=4;assert.equal((await bridge.validateNativeOfferRefs(s.client,s.ports,'link',[ref])).code,'SOURCE_CHANGED');});
test('remote stale, changed, missing and revoked-after-await are not success',async()=>{
 for(const mutate of [r=>{r.data.items=[];},r=>{r.data.items[0].checkedAt=new Date(now-60001).toISOString();},r=>{r.data.items[0].state='changed';},r=>{r.scope.workspaceId='foreign';},r=>{r.data.items[0].currentRevision=9;}]){const s=setup(),original=s.client.call;s.client.call=async()=>{const r=await original();mutate(r);return r;};assert.equal((await bridge.validateNativeOfferRefs(s.client,s.ports,'link',[ref])).ok,false);}
 const s=setup(),original=s.client.call;s.client.call=async()=>{const r=await original();s.revoke();return r;};assert.equal((await bridge.validateNativeOfferRefs(s.client,s.ports,'link',[ref])).code,'RESTRICTED');
});
test('read-refresh consent missing never calls transport; unavailable is not zero/current',async()=>{const s=setup();s.scope.readRefreshAllowed=false;s.client.call=async()=>{assert.fail('must not call');};assert.equal((await bridge.validateNativeOfferRefs(s.client,s.ports,'link',[ref])).code,'NOT_CONNECTED');});
test('revocation redacts root/day/source fields without altering private notes or immutable original',()=>{
 const original={title:'Licensed name',summary:'Licensed summary',city:'Licensed city',day_title:'Licensed day',sourceDescription:'Licensed stop',travellerNote:'my note'};
 const bindings=['root_metadata','day_title','sourceDescription'].map(fieldPath=>({fieldPath,grantId:'grant',grantVersion:1,publicationId:'pub',publicationContentVersion:1}));
 const p=projection.projectNativeRecord(original,bindings,()=>false);assert.equal(p.travellerNote,'my note');assert.equal(JSON.stringify(p).includes('Licensed'),false);assert.equal(original.title,'Licensed name');
 assert.deepEqual(projection.projectNativeRecord(original,bindings,()=>true),original);assert.deepEqual(projection.projectNativeRecord(original,[],()=>false),original);
});
test('observability strips private bodies, tokens and arbitrary labels',()=>{
 const event=ops.discoveryEvent({requestId:'11111111-1111-4111-8111-111111111111',status:'unknown',durationMs:12,token:'secret',intent:{city:'private'},error:'private',resourceId:'bad'});
 assert.deepEqual(Object.keys(event).sort(),['durationMs','requestId','status']);assert.equal(ops.discoveryEvent({status:'private body',durationMs:NaN}).status,'unavailable');
 assert.equal(ops.nativeReadiness().enabled,false);assert.equal(ops.nativeReadiness().booking,false);assert.equal(ops.nativeReadiness().payment,false);
});
