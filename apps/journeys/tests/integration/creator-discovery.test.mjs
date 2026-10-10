import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fixture,admin} from './local-fixtures.mjs';import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
function sql(text){const target=verifyTestTarget();const r=spawnSync('docker',['exec','-i',target.dbContainer,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);}
const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
async function setup(requiresApplication=false){const f=await fixture(),owner=await f.actor(),foreign=await f.actor(),authors=[];
 for(let i=0;i<6;i++){const a=await f.actor(true);await ok(admin.from('creators').update({handle:'synthetic-discovery-'+randomUUID(),display_name:'Synthetic public author '+i,bio:'Synthetic public biography',public_profile:{niches:['City'],languages:['en'],audience_geos:['HK'],platforms:[{platform:'instagram',private_token:'DO_NOT_RETURN'}],email:'DO_NOT_RETURN',privateEvidence:'DO_NOT_RETURN'}}).eq('id',a.id));authors.push(a);}
 const merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic discovery owner',contact_email:'synthetic@example.test'}).select('id').single())).id;
 const inserted=await ok(admin.from('missions').insert({merchant_profile_id:merchantId,title:'Synthetic invitation brief',summary:'Authored complete public brief',mission_type:'coupon_affiliate',mission_source:'merchant',status:'published',kinnso_requires_application:requiresApplication}).select('id,updated_at').single());
 const mission=await ok(admin.from('missions').select('id,updated_at').eq('id',inserted.id).single());
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
test('native invite receipt replay charges once, keeps full creator brief and rejects foreign/stale/inactive/duplicate targets',async()=>{for(const flag of [false,true]){const x=await setup(flag);try{
 const requestId=randomUUID(),command=x.invite(x.authors[0]),first=await ok(x.command(command,requestId));assert.deepEqual(await ok(x.command(command,requestId)),first);
 const receipt=await ok(x.owner.client.rpc('get_kinnso_merchant_creator_receipt',{p_merchant_id:x.merchantId,p_request_id:requestId}));assert.deepEqual(receipt.result,first);assert.equal((await ok(x.list())).quota.used,1);
 assert.equal((await ok(admin.from('notifications').select('id').eq('creator_id',x.authors[0].id).eq('entity_id',x.mission.id).eq('notification_type','collaboration.invited'))).length,1);
 assert.equal((await x.command({...command,creatorId:x.authors[1].id},requestId)).error?.message,'idempotency_conflict');
 assert.equal((await x.command(command)).error?.message,'already_participant');
 assert.equal((await x.command({...x.invite(x.authors[1]),expectedUpdatedAt:'2000-01-01T00:00:00Z'})).error?.message,'revision_conflict');
 await ok(admin.from('creators').update({status:'suspended'}).eq('id',x.authors[2].id));assert.equal((await x.command(x.invite(x.authors[2]))).error?.message,'creator_not_found');
 assert.equal((await x.foreign.client.rpc('apply_kinnso_merchant_campaign_command',{p_merchant_id:x.merchantId,p_request_id:randomUUID(),p_command:x.invite(x.authors[1])})).error?.message,'forbidden');
 const creatorView=await ok(x.authors[0].client.rpc('get_kinnso_creator_mission',{p_mission_id:x.mission.id}));assert.match(JSON.stringify(creatorView),/Authored complete public brief/);
 await ok(x.authors[0].client.rpc('accept_mission_invite',{p_mission_id:x.mission.id}));assert.equal((await ok(x.list())).quota.used,1);
 }finally{await x.cleanup();}}});
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
test('an invitation inbox failure rolls back participant, quota and receipt together',async()=>{for(const flag of [false,true]){const x=await setup(flag);const requestId=randomUUID();let fault=false;try{
 sql(`create function public.synthetic_discovery_inbox_fault()returns trigger language plpgsql set search_path='' as $$begin if new.entity_id='${x.mission.id}'::uuid then raise exception 'synthetic_inbox_failure';end if;return new;end$$;create trigger synthetic_discovery_inbox_fault before insert on public.notifications for each row execute function public.synthetic_discovery_inbox_fault();`);fault=true;
 const failed=await x.command(x.invite(x.authors[0]),requestId);assert.equal(failed.error?.message,'synthetic_inbox_failure');
 assert.equal((await ok(admin.from('mission_participants').select('id').eq('mission_id',x.mission.id))).length,0);assert.equal((await ok(x.list())).quota.used,0);assert.equal((await ok(x.owner.client.rpc('get_kinnso_merchant_creator_receipt',{p_merchant_id:x.merchantId,p_request_id:requestId}))).result,null);
 sql('drop trigger synthetic_discovery_inbox_fault on public.notifications;drop function public.synthetic_discovery_inbox_fault();');fault=false;
 await ok(x.command(x.invite(x.authors[0]),requestId));assert.equal((await ok(x.list())).quota.used,1);
 }finally{if(fault)sql('drop trigger synthetic_discovery_inbox_fault on public.notifications;drop function public.synthetic_discovery_inbox_fault();');await x.cleanup();}}});
test('public search is bounded with scope/filter/version cursors, while mature free saved lists retain access',async()=>{const x=await setup();try{
 const prefix='Synthetic bounded '+randomUUID();for(const a of x.authors)await ok(admin.from('creators').update({display_name:prefix}).eq('id',a.id));
 const free=await ok(x.list(x.owner,{q:prefix}));assert.equal(free.items.length,3);assert.equal(free.nextCursor,null);assert.equal((await ok(x.list(x.owner,{q:'DO_NOT_RETURN'}))).items.length,0);
 for(const a of x.authors.slice(0,4))await ok(x.command({type:'saveCreator',id:a.id,reason:'Owner shortlist'}));assert.equal((await ok(x.list(x.owner,{q:prefix,savedOnly:true}))).items.length,4);
 await ok(admin.from('merchant_profiles').update({tier:'growth'}).eq('id',x.merchantId));
 for(let i=0;i<16;i++){const a=await x.f.actor(true);x.authors.push(a);await ok(admin.from('creators').update({display_name:prefix,handle:'synthetic-bounded-'+randomUUID(),public_profile:{niches:['City']}}).eq('id',a.id));}
 const first=await ok(x.list(x.owner,{q:prefix}));assert.equal(first.items.length,20);assert.ok(first.nextCursor);const second=await ok(x.list(x.owner,{q:prefix,after:first.nextCursor}));assert.equal(second.items.length,2);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.items,...second.items].map(c=>c.id)).size,22);
 assert.equal((await x.list(x.owner,{q:'Other query',after:first.nextCursor})).error?.message,'invalid_cursor');assert.equal((await x.list(x.owner,{q:prefix,savedOnly:true,after:first.nextCursor})).error?.message,'invalid_cursor');
 await ok(admin.from('creators').update({status:'suspended'}).eq('id',first.items.at(-1).id));assert.equal((await x.list(x.owner,{q:prefix,after:first.nextCursor})).error?.message,'invalid_cursor');
 }finally{await x.cleanup();}});
test('true foreign campaign IDs, accepted re-invites and revoked owner receipt/replay retain exact denials with owned controls',async()=>{const x=await setup();let foreignMerchant='';try{
 foreignMerchant=(await ok(admin.from('merchant_profiles').insert({user_id:x.foreign.id,company_name:'Synthetic foreign company',contact_email:'synthetic@example.test'}).select('id').single())).id;
 const foreignMission=await ok(admin.from('missions').insert({merchant_profile_id:foreignMerchant,title:'Synthetic foreign campaign',summary:'Foreign owner brief',mission_source:'merchant',mission_type:'coupon_affiliate',status:'published'}).select('id,updated_at').single());
 assert.equal((await x.command({...x.invite(x.authors[0]),id:foreignMission.id,expectedUpdatedAt:foreignMission.updated_at})).error?.message,'forbidden');
 await ok(x.command(x.invite(x.authors[0])));await ok(x.authors[0].client.rpc('accept_mission_invite',{p_mission_id:x.mission.id}));assert.equal((await x.command(x.invite(x.authors[0]))).error?.message,'already_participant');assert.equal((await ok(x.list())).quota.used,1);
 const requestId=randomUUID(),command={type:'saveCreator',id:x.authors[1].id,reason:'Owner shortlist'};await ok(x.command(command,requestId));
 await ok(admin.from('merchant_profiles').update({user_id:x.foreign.id}).eq('id',x.merchantId));
 assert.equal((await x.command(command,requestId)).error?.message,'forbidden');assert.equal((await x.command({type:'unsaveCreator',id:x.authors[1].id,reason:'Revoked owner attempt'})).error?.message,'forbidden');
 assert.equal((await x.owner.client.rpc('get_kinnso_merchant_creator_receipt',{p_merchant_id:x.merchantId,p_request_id:requestId})).error?.message,'forbidden');assert.equal((await x.owner.client.from('merchant_saved_creators').select('*').eq('merchant_id',x.merchantId)).data.length,0);
 assert.equal((await ok(x.list(x.foreign,{savedOnly:true}))).items.length,1);await ok(x.foreign.client.rpc('apply_kinnso_merchant_campaign_command',{p_merchant_id:x.merchantId,p_request_id:requestId,p_command:command}));assert.ok((await ok(x.foreign.client.rpc('get_kinnso_merchant_creator_receipt',{p_merchant_id:x.merchantId,p_request_id:requestId}))).result);
 }finally{if(foreignMerchant)await ok(admin.from('merchant_profiles').delete().eq('id',foreignMerchant));await x.cleanup();}});
