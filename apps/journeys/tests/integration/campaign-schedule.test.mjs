import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,admin} from './local-fixtures.mjs';
import {spawn,spawnSync} from 'node:child_process';
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

test('published auto-approval policy rejects direct owner writes and preserves the audited ops setter',async()=>{
 const x=await setup();let opsMember;try{
  const id=randomUUID(),ops=await x.f.actor();await ok(x.command({type:'createDraft',id,input:x.input,publish:true,reason:'Confirm immutable campaign'}));
  opsMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:ops.id,display_name:'Synthetic schedule operator',role:'admin'}).select('id').single())).id;
  assert.equal((await x.owner.client.from('missions').update({auto_approve_policy:'verified_signal_only'}).eq('id',id)).error?.message,'forbidden');
  await ok(ops.client.rpc('admin_set_mission_auto_approve_policy',{p_mission_id:id,p_policy:'verified_signal_only'}));
  assert.equal((await ok(admin.from('missions').select('auto_approve_policy').eq('id',id).single())).auto_approve_policy,'verified_signal_only');
  const audit=await ok(admin.from('ops_audit_log').select('id,action').eq('actor_ops_member_id',opsMember));assert.equal(audit.length,1);assert.equal(audit[0].action,'mission.auto_approve_policy');
 }finally{if(opsMember){await ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id',opsMember));await ok(admin.from('kinnso_ops_members').delete().eq('id',opsMember));}await x.cleanup();}
});

test('published identity cannot be deleted and recreated while an unused draft still rolls back',async()=>{
 const x=await setup();try{
  const id=randomUUID();await ok(x.command({type:'createDraft',id,input:x.input,publish:true,reason:'Retain published history'}));
  assert.equal((await x.owner.client.from('missions').delete().eq('id',id)).error?.message,'immutable_campaign_terms');
  assert.equal((await x.owner.client.from('missions').insert({id,merchant_profile_id:x.merchantId,title:'Changed replacement',summary:'Reset published identity',mission_type:'coupon_affiliate',status:'draft'})).error?.code,'23505');
  const draft=randomUUID();await ok(x.command({type:'createDraft',id:draft,input:{...x.input,milestones:[]},publish:false,reason:'Unused draft rollback'}));
  await ok(x.owner.client.from('missions').delete().eq('id',draft));assert.equal((await ok(admin.from('missions').select('id').eq('id',draft))).length,0);
 }finally{await x.cleanup();}
});

test('historically published draft-shaped rows advertise read-only terms and reject edits terminally',async()=>{
 const x=await setup();try{
  const mission=await x.legacyMission({status:'draft',published_at:'2000-01-01T00:00:00Z'});
  const data=await ok(x.owner.client.rpc('get_kinnso_merchant_campaigns',{p_merchant_id:x.merchantId,p_campaign_id:mission.id}));assert.equal(data.detail.canEdit,false);
  assert.equal((await x.command({type:'updateDraft',id:mission.id,input:x.input,expectedUpdatedAt:data.detail.updatedAt,reason:'Historical lock cannot reset'})).error?.message,'revision_conflict');
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

// The imported fixture verifies the exact disposable project/container before
// either authenticated requests or this DB-owner lock transport can run.
async function holdRow(table,id,close=false){
 assert.ok(['missions','mission_participants'].includes(table));assert.match(id,/^[0-9a-f-]{36}$/i);
 const child=spawn('docker',['exec','-i',process.env.KINNSO_TEST_DB_CONTAINER,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']);let output='',errors='';
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(errors||`Lock transport exited ${code}`)));});
 const held=new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/HELD:(\d+)/);if(match)resolve(Number(match[1]));});child.stderr.on('data',chunk=>errors+=chunk);child.on('error',reject);child.on('exit',()=>reject(Error(errors||'Lock transport ended before readiness')));});
 child.stdin.write(`BEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='20s'; SELECT 1 FROM public.${table} WHERE id='${id}'::uuid FOR UPDATE; ${close?`UPDATE public.missions SET status='paused' WHERE id='${id}'::uuid;`:''} SELECT 'HELD:'||pg_backend_pid();\n`);
 const pid=await held;return{pid,release:async()=>{child.stdin.end('COMMIT;\n');await done;}};
}
async function waitBlocked(holder,count=1){
 const stop=Date.now()+5000;while(Date.now()<stop){
  const sql=`WITH RECURSIVE waits(pid) AS (SELECT ${holder.pid} UNION SELECT a.pid FROM pg_catalog.pg_stat_activity a JOIN waits w ON w.pid=ANY(pg_catalog.pg_blocking_pids(a.pid))) SELECT count(*)-1 FROM waits;`;
  const result=spawnSync('docker',['exec','-i',process.env.KINNSO_TEST_DB_CONTAINER,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:2000});assert.equal(result.status,0,result.stderr);
  if(Number(result.stdout.trim())>=count)return;await new Promise(resolve=>setTimeout(resolve,100));
 }assert.fail('Authenticated requests must actually wait on the owned fixture lock');
}

test('an invitation acceptance started before cutoff is denied after its mission lock is released past cutoff',async()=>{
 const x=await setup();let held;try{
  const cutoff=new Date(Date.now()+7000).toISOString(),mission=await x.legacyMission({ends_at:cutoff});
  await ok(x.owner.client.rpc('merchant_invite_creator',{p_mission_id:mission.id,p_creator_id:x.other.id}));held=await holdRow('missions',mission.id);
  const result=x.other.client.rpc('accept_mission_invite',{p_mission_id:mission.id}).then(value=>value);await waitBlocked(held);assert.ok(Date.now()<Date.parse(cutoff),'The request reached the lock before cutoff');
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(cutoff)-Date.now()+150)));await held.release();held=null;
  assert.equal((await result).error?.message,'invalid_mission_unavailable');assert.equal((await ok(admin.from('mission_participants').select('status').eq('mission_id',mission.id).single())).status,'invited');
 }finally{if(held)await held.release();await x.cleanup();}
});

test('closing and both native and direct admission serialize without admitting after closure',async()=>{
 const x=await setup();let held;try{
  const mission=await x.legacyMission({});held=await holdRow('missions',mission.id,true);
  const native=x.creator.client.rpc('apply_kinnso_creator_mission_command',{p_mission_id:mission.id,p_request_id:randomUUID(),p_command:{type:'join'}}).then(value=>value);
  const direct=x.other.client.from('mission_participants').insert({mission_id:mission.id,creator_id:x.other.id,status:'active',source:'open_join'}).then(value=>value);
  await waitBlocked(held,2);await held.release();held=null;
  for(const r of await Promise.all([native,direct]))assert.equal(r.error?.message,'invalid_mission_unavailable');assert.equal((await ok(admin.from('mission_participants').select('id').eq('mission_id',mission.id))).length,0);
 }finally{if(held)await held.release();await x.cleanup();}
});

test('legacy and native application review use one lock order and one winning receipt',async()=>{
 const x=await setup();let held;try{
  const mission=await x.legacyMission({}),p=await ok(admin.from('mission_participants').insert({mission_id:mission.id,creator_id:x.creator.id,status:'applied',source:'open_join'}).select('id,updated_at').single());
  held=await holdRow('mission_participants',p.id);
  const legacy=x.owner.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:x.merchantId,p_request_id:randomUUID(),p_command:{type:'reviewApplication',id:p.id,expectedStatus:'applied',action:'approve',note:'Reviewed once',reason:'Synthetic lock order'}}).then(value=>value);await waitBlocked(held);
  const native=x.command({type:'reviewApplication',id:p.id,expectedUpdatedAt:p.updated_at,action:'approve',note:'Reviewed once',reason:'Synthetic native race'}).then(value=>value);await waitBlocked(held,2);await held.release();held=null;
  const results=await Promise.all([legacy,native]);assert.equal(results.filter(r=>!r.error).length,1,JSON.stringify(results.map(r=>r.error)));assert.deepEqual(results.filter(r=>r.error).map(r=>r.error.message),['revision_conflict']);
  assert.equal((await ok(admin.from('mission_participants').select('status').eq('id',p.id).single())).status,'active');
 }finally{if(held)await held.release();await x.cleanup();}
});
