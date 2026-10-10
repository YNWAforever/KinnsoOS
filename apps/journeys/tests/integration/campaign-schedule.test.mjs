import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,admin} from './local-fixtures.mjs';
const ok=async promise=>{const r=await promise;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
async function setup(){
 const f=await fixture(),owner=await f.actor(),creator=await f.actor(true),other=await f.actor(true);
 const merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic schedule company',contact_email:'synthetic@example.test'}).select('id').single())).id;
 const command=(c,requestId=randomUUID())=>owner.client.rpc('apply_kinnso_merchant_campaign_command',{p_merchant_id:merchantId,p_request_id:requestId,p_command:c});
 const input={title:'Synthetic immutable brief',summary:'Authored original guide',couponCode:'CITY',couponUrl:'https://example.test/city',affiliateRate:70,kinnsoRate:30,creatorRate:70,requirements:['Original sources'],deliverables:['One guide'],milestones:[{id:randomUUID(),title:'Original guide',description:'Source-backed guide URL',dueAt:null}]};
 const legacyMission=async patch=>await ok(admin.from('missions').insert({merchant_profile_id:merchantId,title:'Synthetic legacy schedule',summary:'Preserved legacy workflow',mission_type:'coupon_affiliate',status:'published',...patch}).select('id').single());
 return{f,owner,creator,other,merchantId,command,input,legacyMission,cleanup:async()=>{await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));await f.cleanup();}};
}
test('published native terms cannot bypass RPC through direct owner UPDATE or mutable milestones',async()=>{
 const x=await setup();try{
  const id=randomUUID();const receipt=await ok(x.command({type:'createDraft',id,input:x.input,publish:true,reason:'Confirm authored terms'}));
  for(const patch of [{coupon_code:'CHANGED'},{creator_commission_rate:99},{requirements:['Changed obligation']},{kinnso_requires_application:false},{status:'draft'}]){
   const denied=await x.owner.client.from('missions').update(patch).eq('id',id);assert.equal(denied.error?.message,'immutable_campaign_terms');
  }
  const milestone=await x.owner.client.from('mission_milestones').update({due_at:'2030-01-01T00:00:00Z'}).eq('id',x.input.milestones[0].id);assert.equal(milestone.error?.message,'immutable_campaign_terms');
  const fresh=await ok(x.owner.client.rpc('get_kinnso_merchant_campaigns',{p_merchant_id:x.merchantId,p_campaign_id:id}));assert.equal(fresh.detail.couponCode,'CITY');assert.deepEqual(fresh.detail.requirements,['Original sources']);assert.equal(fresh.detail.updatedAt,receipt.updatedAt);
  await ok(x.command({type:'close',id,expectedUpdatedAt:receipt.updatedAt,reason:'Close recruitment only'}));
 }finally{await x.cleanup();}
});
test('legacy direct join, owner invite and invitation acceptance all obey server application windows',async()=>{
 const x=await setup();try{
  const future=await x.legacyMission({starts_at:'2099-01-01T00:00:00Z'}),expired=await x.legacyMission({ends_at:'2000-01-01T00:00:00Z'}),open=await x.legacyMission({starts_at:null,ends_at:null});
  for(const mission of [future,expired]){
   const denied=await x.creator.client.from('mission_participants').insert({mission_id:mission.id,creator_id:x.creator.id,status:'active',source:'open_join'});assert.equal(denied.error?.message,'invalid_mission_unavailable');
   assert.equal((await x.owner.client.rpc('merchant_invite_creator',{p_mission_id:mission.id,p_creator_id:x.other.id})).error?.message,'invalid_mission_unavailable');
  }
  const joined=await ok(x.creator.client.from('mission_participants').insert({mission_id:open.id,creator_id:x.creator.id,status:'active',source:'open_join'}).select('id').single());assert.ok(joined.id);
  const cutoff=new Date(Date.now()+4000).toISOString(),expiring=await x.legacyMission({ends_at:cutoff});
  const invitationId=await ok(x.owner.client.rpc('merchant_invite_creator',{p_mission_id:expiring.id,p_creator_id:x.other.id}));
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(cutoff)-Date.now()+150)));
  assert.equal((await x.other.client.rpc('accept_mission_invite',{p_mission_id:expiring.id})).error?.message,'invalid_mission_unavailable');
  assert.equal((await ok(admin.from('mission_participants').select('status').eq('id',invitationId).single())).status,'invited');
 }finally{await x.cleanup();}
});

test('schedule dates round-trip across roles, v1 drafts preserve dates, and expired accepted work retains proof and revision rights',async()=>{
 const x=await setup();try{
  const id=randomUUID(),cutoff=new Date(Date.now()+7000).toISOString();
  const input={...x.input,applicationOpensAt:'2000-01-01T00:00:00+08:00',applicationClosesAt:cutoff,scheduleTimeZone:'Asia/Hong_Kong',milestones:[{...x.input.milestones[0],dueAt:'2000-01-01T00:00:00Z'}]};
  const draft=await ok(x.command({type:'createDraft',id,input,publish:false,reason:'Author UTC schedule'}));
  // A prior native client must not silently erase a schedule it cannot edit.
  const edited=await ok(x.command({type:'updateDraft',id,input:{...x.input,milestones:input.milestones},expectedUpdatedAt:draft.updatedAt,reason:'Old client title edit'}));
  const owner=await ok(x.owner.client.rpc('get_kinnso_merchant_campaigns',{p_merchant_id:x.merchantId,p_campaign_id:id}));
  assert.equal(Date.parse(owner.detail.applicationOpensAt),Date.parse(input.applicationOpensAt));assert.equal(Date.parse(owner.detail.applicationClosesAt),Date.parse(cutoff));assert.equal(owner.detail.scheduleTimeZone,'Asia/Hong_Kong');
  await ok(x.command({type:'publish',id,expectedUpdatedAt:edited.updatedAt,reason:'Confirm complete scheduled draft'}));
  const read=await ok(x.creator.client.rpc('get_kinnso_creator_mission',{p_mission_id:id}));assert.equal(read.scheduleTimeZone,owner.detail.scheduleTimeZone);assert.equal(read.applicationOpensAt,owner.detail.applicationOpensAt);assert.equal(read.applicationClosesAt,owner.detail.applicationClosesAt);
  const joined=await ok(x.creator.client.rpc('apply_kinnso_creator_mission_command',{p_mission_id:id,p_request_id:randomUUID(),p_command:{type:'join'}}));
  await ok(x.command({type:'reviewApplication',id:joined.id,expectedUpdatedAt:joined.updatedAt,action:'approve',note:'Original proposal accepted',reason:'Confirm accepted work'}));
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(cutoff)-Date.now()+150)));
  const final=await ok(x.creator.client.rpc('get_kinnso_creator_mission',{p_mission_id:id}));assert.equal(final.evidenceAvailable,true);assert.equal(final.participant.status,'active');
  const payload={type:'submitEvidence',milestoneId:x.input.milestones[0].id,submissionId:null,expectedUpdatedAt:null,proofUrls:['https://example.test/original-guide'],notes:'Original accepted work after recruitment cutoff'};
  const requestId=randomUUID(),proof=await ok(x.creator.client.rpc('apply_kinnso_creator_mission_command',{p_mission_id:id,p_request_id:requestId,p_command:payload}));
  assert.deepEqual(await ok(x.creator.client.rpc('apply_kinnso_creator_mission_command',{p_mission_id:id,p_request_id:requestId,p_command:payload})),proof);
  const closed=await ok(x.owner.client.rpc('get_kinnso_merchant_campaigns',{p_merchant_id:x.merchantId,p_campaign_id:id}));await ok(x.command({type:'close',id,expectedUpdatedAt:closed.detail.updatedAt,reason:'Close expired recruitment'}));
  const revision=await ok(x.command({type:'reviewSubmission',id:proof.id,expectedUpdatedAt:proof.updatedAt,action:'request_revision',feedback:'Add one original source',reason:'Source clarification'}));
  await ok(x.creator.client.rpc('apply_kinnso_creator_mission_command',{p_mission_id:id,p_request_id:randomUUID(),p_command:{...payload,submissionId:proof.id,expectedUpdatedAt:revision.updatedAt,notes:'Original source added'}}));
  assert.equal((await ok(admin.from('mission_settlements').select('id').eq('mission_id',id))).length,0);
 }finally{await x.cleanup();}
});
