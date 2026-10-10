import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fixture,admin} from './local-fixtures.mjs';
const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
async function setup(){const f=await fixture(),owner=await f.actor(),foreign=await f.actor(),authors=[];
 for(let i=0;i<6;i++){const a=await f.actor(true);await ok(admin.from('creators').update({handle:'synthetic-discovery-'+randomUUID(),display_name:'Synthetic public author '+i,bio:'Synthetic public biography',public_profile:{niches:['City'],languages:['en'],audience_geos:['HK'],platforms:[{platform:'instagram',private_token:'DO_NOT_RETURN'}],email:'DO_NOT_RETURN',privateEvidence:'DO_NOT_RETURN'}}).eq('id',a.id));authors.push(a);}
 const merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic discovery owner',contact_email:'synthetic@example.test'}).select('id').single())).id;
 const mission=await ok(admin.from('missions').insert({merchant_profile_id:merchantId,title:'Synthetic invitation brief',summary:'Authored complete public brief',mission_type:'coupon_affiliate',mission_source:'merchant',status:'published'}).select('id,updated_at').single());
 const command=(c,r=randomUUID())=>owner.client.rpc('apply_kinnso_merchant_campaign_command',{p_merchant_id:merchantId,p_request_id:r,p_command:c});
 const list=(actor=owner,q={})=>actor.client.rpc('get_kinnso_merchant_creators',{p_merchant_id:merchantId,p_query:q});
 const invite=a=>({type:'inviteCreator',id:mission.id,creatorId:a.id,expectedUpdatedAt:mission.updated_at,reason:'Owner reviewed public profile'});
 return{f,owner,foreign,authors,merchantId,mission,command,list,invite,cleanup:async()=>{await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));await f.cleanup();}};
}
test('discovery allowlists public active attributes, retains owner-only saved notes and denies revoked/foreign reads',async()=>{const x=await setup();try{
 await ok(admin.from('merchant_profiles').update({tier:'growth'}).eq('id',x.merchantId));await ok(admin.from('creators').update({status:'suspended'}).eq('id',x.authors[5].id));
 const result=await ok(x.list());assert.equal(result.items.some(c=>c.id===x.authors[5].id),false);assert.ok(result.items.some(c=>c.id===x.authors[0].id));assert.doesNotMatch(JSON.stringify(result),/DO_NOT_RETURN/);
 await ok(x.command({type:'saveCreator',id:x.authors[0].id,reason:'Owner shortlist'}));let saved=await ok(x.list(x.owner,{savedOnly:true}));assert.equal(saved.items.length,1);
 const note={type:'setSavedNote',id:x.authors[0].id,note:'Owner-only private note',expectedUpdatedAt:saved.items[0].savedUpdatedAt,reason:'Owner assessment'};
 await ok(x.command(note));assert.equal((await x.command({...note,note:'Stale overwrite'})).error?.message,'revision_conflict');
 assert.equal((await x.list(x.foreign)).error?.message,'forbidden');assert.equal((await x.foreign.client.from('merchant_saved_creators').select('*').eq('merchant_id',x.merchantId)).data.length,0);
 await ok(admin.from('merchant_profiles').update({status:'suspended'}).eq('id',x.merchantId));assert.equal((await x.list()).error?.message,'forbidden');
 }finally{await x.cleanup();}});
test('native invite receipt replay charges once, keeps full creator brief and rejects foreign/stale/inactive/duplicate targets',async()=>{const x=await setup();try{
 const requestId=randomUUID(),command=x.invite(x.authors[0]),first=await ok(x.command(command,requestId));assert.deepEqual(await ok(x.command(command,requestId)),first);
 const receipt=await ok(x.owner.client.rpc('get_kinnso_merchant_creator_receipt',{p_merchant_id:x.merchantId,p_request_id:requestId}));assert.deepEqual(receipt.result,first);assert.equal((await ok(x.list())).quota.used,1);
 assert.equal((await x.command({...command,creatorId:x.authors[1].id},requestId)).error?.message,'idempotency_conflict');
 assert.equal((await x.command(command)).error?.message,'already_participant');
 assert.equal((await x.command({...x.invite(x.authors[1]),expectedUpdatedAt:'2000-01-01T00:00:00Z'})).error?.message,'revision_conflict');
 await ok(admin.from('creators').update({status:'suspended'}).eq('id',x.authors[2].id));assert.equal((await x.command(x.invite(x.authors[2]))).error?.message,'creator_not_found');
 assert.equal((await x.foreign.client.rpc('apply_kinnso_merchant_campaign_command',{p_merchant_id:x.merchantId,p_request_id:randomUUID(),p_command:x.invite(x.authors[1])})).error?.message,'forbidden');
 const creatorView=await ok(x.authors[0].client.rpc('get_kinnso_creator_mission',{p_mission_id:x.mission.id}));assert.match(JSON.stringify(creatorView),/Authored complete public brief/);
 await ok(x.authors[0].client.rpc('accept_mission_invite',{p_mission_id:x.mission.id}));assert.equal((await ok(x.list())).quota.used,1);
 }finally{await x.cleanup();}});
test('legacy/native/direct invitation paths serialize the last quota slot and immutable attribution prevents backdating',async()=>{const x=await setup();try{
 for(const a of x.authors.slice(0,2))await ok(x.owner.client.rpc('merchant_invite_creator',{p_mission_id:x.mission.id,p_creator_id:a.id}));
 const raced=await Promise.all([x.command(x.invite(x.authors[2])),x.owner.client.rpc('merchant_invite_creator',{p_mission_id:x.mission.id,p_creator_id:x.authors[3].id})]);assert.equal(raced.filter(r=>!r.error).length,1);assert.equal(raced.find(r=>r.error).error.message,'invite_quota_exceeded');
 const direct=await x.owner.client.from('mission_participants').insert({mission_id:x.mission.id,creator_id:x.authors[4].id,status:'invited',source:'merchant_invite',created_at:'2000-01-01T00:00:00Z'});assert.equal(direct.error?.message,'invite_quota_exceeded');
 const prior=await ok(admin.from('mission_participants').select('id').eq('mission_id',x.mission.id).eq('creator_id',x.authors[0].id).single());
 for(const patch of [{created_at:'2000-01-01T00:00:00Z'},{source:'open_join'}])assert.equal((await x.owner.client.from('mission_participants').update(patch).eq('id',prior.id)).error?.message,'invalid_invite_attribution');
 assert.equal((await ok(admin.from('mission_participants').select('id').eq('mission_id',x.mission.id))).length,3);
 }finally{await x.cleanup();}});
test('direct owner insertion cannot evade the mature monthly quota with an earlier created_at',async()=>{const x=await setup();try{
 for(const a of x.authors.slice(0,3))await ok(x.owner.client.rpc('merchant_invite_creator',{p_mission_id:x.mission.id,p_creator_id:a.id}));
 const attempt=await x.owner.client.from('mission_participants').insert({mission_id:x.mission.id,creator_id:x.authors[4].id,status:'invited',source:'merchant_invite',created_at:'2000-01-01T00:00:00Z'});
 assert.equal(attempt.error?.message,'invite_quota_exceeded');assert.equal((await ok(admin.from('mission_participants').select('id').eq('mission_id',x.mission.id))).length,3);
 }finally{await x.cleanup();}});
