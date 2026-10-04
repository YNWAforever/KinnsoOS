import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, admin } from './local-fixtures.mjs';
const ok=async promise=>{const r=await promise;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
test('ops queue keyset and currency totals remain complete above the actual API rowcap; detail stays mission-scoped',async()=>{
 const f=await fixture();let merchantId,missionId,opsId;
 try{
  const owner=await f.actor(),ops=await f.actor(),creator=await f.actor(true);
  opsId=ops.id;await ok(admin.from('kinnso_ops_members').insert({user_id:ops.id,display_name:'Synthetic operator',role:'moderator'}));
  // The RPC must exist and enforce fresh authority before constructing scale data.
  await ok(ops.client.rpc('get_kinnso_review_queue',{p_filter:{},p_cursor:null,p_limit:50}));
  assert.equal((await creator.client.rpc('get_kinnso_review_queue',{p_filter:{},p_cursor:null,p_limit:50})).error?.message,'forbidden');
  merchantId=randomUUID();missionId=randomUUID();const participantId=randomUUID();
  await ok(admin.from('merchant_profiles').insert({id:merchantId,user_id:owner.id,company_name:'Synthetic queue owner',contact_email:'synthetic@example.test'}));
  await ok(admin.from('missions').insert({id:missionId,merchant_profile_id:merchantId,title:'Synthetic scale',summary:'Owned test fixture',mission_type:'coupon_affiliate',status:'published'}));
  await ok(admin.from('mission_participants').insert({id:participantId,mission_id:missionId,creator_id:creator.id,status:'active',source:'open_join'}));
  const ids=Array.from({length:1205},()=>randomUUID());
  for(let n=0;n<ids.length;n+=200){const chunk=ids.slice(n,n+200);await ok(admin.from('mission_milestones').insert(chunk.map((id,i)=>({id,mission_id:missionId,title:'Synthetic '+(n+i),description:'Fixture',sort_order:n+i}))));await ok(admin.from('mission_milestone_submissions').insert(chunk.map(id=>({id,mission_milestone_id:id,mission_participant_id:participantId,status:'submitted',submitted_at:'2030-01-01T00:00:00Z',review_deadline:null}))));await ok(admin.from('mission_settlements').insert(chunk.map((id,i)=>({mission_id:missionId,status:'pending',amount_currency:(n+i)%2?'USD':'HKD',creator_commission_amount:1,paid_fee_amount:2}))));}
  await ok(admin.from('mission_verification_jobs').insert([
   {mission_milestone_submission_id:ids[1203],creator_id:creator.id,status:'ready',confidence_status:'verified_signal',created_at:'2030-01-01T00:00:00Z'},
   {mission_milestone_submission_id:ids[1204],creator_id:creator.id,status:'ready',confidence_status:'verified_signal',created_at:'2030-01-01T00:00:00Z'},
   {mission_milestone_submission_id:ids[1204],creator_id:creator.id,status:'ready',confidence_status:'needs_review',created_at:'2031-01-01T00:00:00Z'}]));
  const ranked=await ok(ops.client.rpc('get_kinnso_review_queue',{p_filter:{missionId},p_cursor:null,p_limit:50}));assert.equal(ranked.items[0].submissionId,ids[1203]);assert.equal(ranked.items[1].submissionId,ids[1204]);assert.equal(ranked.items[1].confidenceStatus,'needs_review');
  assert.equal((await ops.client.rpc('get_kinnso_review_queue',{p_filter:{missionId},p_cursor:ranked.nextCursor,p_limit:51})).error?.message,'invalid_filter');
  assert.equal((await ops.client.rpc('get_kinnso_review_queue',{p_filter:{},p_cursor:ranked.nextCursor,p_limit:50})).error?.message,'invalid_cursor');
  const seen=new Set();let cursor=null;
  do{const page=await ok(ops.client.rpc('get_kinnso_review_queue',{p_filter:{missionId},p_cursor:cursor,p_limit:50}));assert.ok(page.items.length<=50);for(const row of page.items){assert.equal(row.missionId,missionId);assert.ok(!seen.has(row.submissionId));seen.add(row.submissionId);}cursor=page.nextCursor;}while(cursor);
  assert.equal(seen.size,1205);
  const totals=await ok(ops.client.rpc('get_kinnso_settlement_summary',{p_mission_id:missionId}));assert.deepEqual(totals.map(x=>[x.currency,x.count,x.creatorAmount]).sort(),[['HKD',603,'1809.00'],['USD',602,'1806.00']]);
  await ok(admin.from('kinnso_ops_members').update({role:'admin'}).eq('user_id',ops.id));
  const selected=ids.slice(0,100),preview=await ok(ops.client.rpc('preview_kinnso_review_bulk',{p_ids:selected}));
  assert.equal(preview.selectionSnapshot.length,100);assert.equal(preview.scope,'explicit_selection');
  await ok(admin.from('mission_milestone_submissions').update({notes:'Changed after preview',proof_urls:['https://example.test/changed-proof']}).in('id',selected.slice(0,3)));
  const args={p_job_id:preview.jobId,p_action:'request_revision',p_reason_category:'other',p_reason:'Synthetic review contract',p_request_id:randomUUID()};
  const bulk=await ok(ops.client.rpc('run_kinnso_review_bulk',args));assert.equal(bulk.succeeded,97);assert.equal(bulk.failed,3);assert.ok(bulk.results.filter(x=>!x.ok).every(x=>x.code==='stale_selection'));
  assert.deepEqual(await ok(ops.client.rpc('run_kinnso_review_bulk',args)),bulk);
  assert.equal((await ops.client.rpc('run_kinnso_review_bulk',{...args,p_reason:'Different reason'})).error?.message,'idempotency_conflict');
  const retryPreview=await ok(ops.client.rpc('preview_kinnso_review_bulk',{p_ids:bulk.results.filter(x=>!x.ok).map(x=>x.id)}));
  const retry=await ok(ops.client.rpc('run_kinnso_review_bulk',{...args,p_job_id:retryPreview.jobId,p_request_id:randomUUID()}));assert.equal(retry.succeeded,3);assert.equal(retry.failed,0);
  const audit=await ok(admin.from('ops_audit_log').select('id').eq('entity_type','mission_submission').in('entity_id',selected));assert.equal(audit.length,100);
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('user_id',ops.id));assert.equal((await ops.client.rpc('get_kinnso_review_queue',{p_filter:{},p_cursor:null,p_limit:50})).error?.message,'forbidden');
  assert.equal((await ops.client.rpc('run_kinnso_review_bulk',args)).error?.message,'forbidden');
 }finally{if(missionId)await ok(admin.from('missions').delete().eq('id',missionId));if(merchantId)await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));if(opsId){const member=await ok(admin.from('kinnso_ops_members').select('id').eq('user_id',opsId));if(member[0])await ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id',member[0].id));await ok(admin.from('kinnso_ops_members').delete().eq('user_id',opsId));}await f.cleanup();}
});
