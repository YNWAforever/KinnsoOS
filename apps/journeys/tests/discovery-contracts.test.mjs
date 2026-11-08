import {test} from 'node:test';import assert from 'node:assert/strict';
import {discoveryModule} from './helpers/discovery-load.mjs';
const p=await discoveryModule('policy'),s=await discoveryModule('contracts','integrations/smeassistant');
const intent={requestId:'11111111-1111-4111-8111-111111111111',targetId:'22222222-2222-4222-8222-222222222222',expectedRevision:0,command:{kind:'clearPreferences',data:{}}};
test('strict discovery parser exists',()=>assert.equal(typeof p.parseDiscoveryIntent,'function'));
test('rejects_client_authority_and_unknown_fields',()=>{
 assert.deepEqual(p.parseDiscoveryIntent(intent),intent);
 for(const extra of [{actorId:'other'},{role:'owner'},{verificationState:'approved'}])assert.throws(()=>p.parseDiscoveryIntent({...intent,...extra}));
 assert.throws(()=>p.parseDiscoveryIntent({...intent,command:{kind:'arbitraryTool',data:{}}}));
 assert.throws(()=>p.parseDiscoveryIntent({...intent,command:{kind:'recordMatch',data:{intentId:intent.targetId,intentRevision:1,score:100}}}));
});
test('same_uuid_changed_digest_conflicts',async()=>{
 assert.notEqual(await p.commandDigest(intent),await p.commandDigest({...intent,expectedRevision:1}));
 assert.equal(await p.commandDigest(intent),await p.commandDigest({command:intent.command,expectedRevision:0,targetId:intent.targetId,requestId:intent.requestId}));
});
test('keeps_null_money_and_separate_ids',()=>{
 const result={schemaVersion:'kinnso.sme.read.v1',status:'ready',requestId:'rpc-1',observedAt:'2026-11-01T00:00:00.000Z',scope:{workspaceId:'demo-workspace',locationId:'demo-location',scopeVersion:1},data:{items:[],nextCursor:null},warnings:[]};
 assert.equal(s.parseSmeResult('sme_confirmed_offers_v1',result).requestId,'rpc-1');
 assert.throws(()=>s.parseSmeResult('send_email',result));
 assert.throws(()=>s.parseSmeResult('sme_confirmed_offers_v1',{...result,actor:'admin'}));
 assert.equal(s.SME_TOOLS.length,6);
});

test('empty and partial retain their status and warnings; oversized and authority-bearing results fail',()=>{
 const base={schemaVersion:'kinnso.sme.read.v1',requestId:'rpc-2',observedAt:'2026-11-01T00:00:00Z',scope:{workspaceId:'workspace-a',locationId:'location-a',scopeVersion:1},data:{items:[],nextCursor:null},warnings:[]};
 assert.equal(s.parseSmeResult('sme_confirmed_offers_v1',{...base,status:'empty'}).status,'empty');
 const partial={...base,status:'partial',warnings:[{code:'MISSING_FIELD',field:'priceAmount'}]};assert.deepEqual(s.parseSmeResult('sme_confirmed_offers_v1',partial),partial);
 assert.throws(()=>s.parseSmeResult('sme_confirmed_offers_v1',{...base,status:'ready',warnings:[{code:'x'.repeat(1048576)}]}),/INVALID/);
 assert.throws(()=>s.parseSmeInput('sme_connection_status_v1',{tripIntent:{destination:'private'}}),/INVALID/);
});
