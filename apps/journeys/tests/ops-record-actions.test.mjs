import test from 'node:test';
import assert from 'node:assert/strict';

let actions={};
try{actions=await import('../lib/ops/record-actions.ts');}catch{}
const id='11111111-1111-4111-8111-111111111111';

test('creator moderation actions accept only bounded audited transitions',()=>{
 assert.equal(typeof actions.parseOpsRecordAction,'function');
 assert.deepEqual(actions.parseOpsRecordAction({action:'setCreatorStatus',locale:'en',id,status:'suspended',reason:'Synthetic safety review'}),{action:'setCreatorStatus',locale:'en',id,status:'suspended',reason:'Synthetic safety review'});
 assert.deepEqual(actions.parseOpsRecordAction({action:'setCreatorVerified',locale:'zh-HK',id,verified:true,reason:'Synthetic verification review'}),{action:'setCreatorVerified',locale:'zh-HK',id,verified:true,reason:'Synthetic verification review'});
 assert.deepEqual(actions.parseOpsRecordAction({action:'setCreatorListed',locale:'en',id,listed:false,reason:'Synthetic directory review'}),{action:'setCreatorListed',locale:'en',id,listed:false,reason:'Synthetic directory review'});
 assert.deepEqual(actions.parseOpsRecordAction({action:'addCreatorNote',locale:'en',id,reason:'Synthetic creator note'}),{action:'addCreatorNote',locale:'en',id,reason:'Synthetic creator note'});
 for(const value of [
  {action:'setCreatorStatus',locale:'en',id,status:'onboarding',reason:'Invalid status'},
  {action:'setCreatorStatus',locale:'ja',id,status:'active',reason:'Invalid locale'},
  {action:'setCreatorVerified',locale:'en',id,verified:'true',reason:'Invalid boolean'},
  {action:'setCreatorListed',locale:'en',id,listed:false,reason:''},
  {action:'setCreatorStatus',locale:'en',id,status:'active',reason:'x'.repeat(501)},
  {action:'setCreatorStatus',locale:'en',id,status:'active',reason:'Valid',actorId:'foreign'},
 ])assert.throws(()=>actions.parseOpsRecordAction(value),/INVALID_OPS_RECORD/);
});

test('merchant moderation actions reject ownership, financial and unknown fields',()=>{
 assert.deepEqual(actions.parseOpsRecordAction({action:'setMerchantStatus',locale:'en',id,status:'paused',reason:'Synthetic merchant review'}),{action:'setMerchantStatus',locale:'en',id,status:'paused',reason:'Synthetic merchant review'});
 assert.deepEqual(actions.parseOpsRecordAction({action:'setMerchantTier',locale:'zh-HK',id,tier:'growth',reason:'Synthetic tier review'}),{action:'setMerchantTier',locale:'zh-HK',id,tier:'growth',reason:'Synthetic tier review'});
 assert.deepEqual(actions.parseOpsRecordAction({action:'addMerchantNote',locale:'en',id,reason:'Synthetic merchant note'}),{action:'addMerchantNote',locale:'en',id,reason:'Synthetic merchant note'});
 for(const value of [
  {action:'setMerchantStatus',locale:'en',id,status:'paid',reason:'Invalid status'},
  {action:'setMerchantTier',locale:'en',id,tier:'enterprise',reason:'Invalid tier'},
  {action:'setMerchantStatus',locale:'en',id,status:'active',reason:'Valid',amount:1},
  {action:'creditBudget',locale:'en',id,amount:100,reason:'Financial action'},
 ])assert.throws(()=>actions.parseOpsRecordAction(value),/INVALID_OPS_RECORD/);
});
