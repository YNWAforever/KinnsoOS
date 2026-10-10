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
