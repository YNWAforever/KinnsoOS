import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fixture,admin,anonymous} from './local-fixtures.mjs';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
import {scheduledHealth} from '../../lib/telemetry/alerts.ts';
const ok=async promise=>{const r=await promise;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const target=verifyTestTarget();
function sql(input){
 const container=JSON.parse(execFileSync('docker',['inspect',target.dbContainer],{encoding:'utf8'}))[0];
 assert.equal(container.Config.Labels['com.supabase.cli.project'],target.projectRef);
 return execFileSync('docker',['exec','-i',target.dbContainer,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8'});
}

test('durable reservations serialize races, fence actor/request, debit overrun and reject charged release',async()=>{
 const f=await fixture();let opsId;const day=new Date().toISOString().slice(0,10);
 // This test owns a fresh local fixture only; never delete preexisting budget configuration.
 assert.equal(sql('select count(*) from kinnso_internal.service_budgets;').trim(),'0','fresh isolated budget store required');
 try{
  const owner=await f.actor(),a=await f.actor(),b=await f.actor();opsId=owner.id;
  const sessionId=async actor=>JSON.parse(Buffer.from((await actor.client.auth.getSession()).data.session.access_token.split('.')[1],'base64url')).session_id;
  const sessionA=await sessionId(a),sessionB=await sessionId(b);
  const reserve=async(actor,args)=>admin.rpc('reserve_kinnso_budget',{p_actor_id:actor.id,p_session_id:actor.id===a.id?sessionA:sessionB,...args});
  const direct={p_actor_id:a.id,p_session_id:sessionA,p_service:'ai',p_request_id:randomUUID(),p_estimate:1};
  assert.equal((await a.client.rpc('reserve_kinnso_budget',direct)).error?.code,'42501');assert.equal((await anonymous.rpc('reserve_kinnso_budget',direct)).error?.code,'42501');

  await ok(admin.from('kinnso_ops_members').insert({user_id:owner.id,display_name:'Synthetic budget operator',role:'owner'}));
  for(const role of ['anon','authenticated','service_role'])for(const table of ['service_budgets','budget_reservations','telemetry_receipts','funnel_daily','performance_samples','scheduled_health']){
   assert.equal(sql(`select has_table_privilege('${role}','kinnso_internal.${table}','SELECT,INSERT,UPDATE,DELETE');`).trim(),'f');
  }
  assert.ok((await anonymous.rpc('reserve_kinnso_budget',{p_service:'ai',p_request_id:randomUUID(),p_estimate:1})).error);
  assert.deepEqual(await ok(reserve(a,{p_service:'storage',p_request_id:randomUUID(),p_estimate:1})),{allowed:false,reason:'disabled',stopBehavior:'stop'});
  const config={p_owner_id:owner.id,p_service:'ai',p_period:day,p_unit:'microcurrency',p_limit:10,p_stop_behavior:'stop'};
  await ok(admin.rpc('configure_kinnso_budget',config));
  const req=randomUUID(),bReq=randomUUID(),args={p_service:'ai',p_request_id:req,p_estimate:7};
  const races=await Promise.all([reserve(a,args),reserve(a,args),reserve(b,{...args,p_request_id:bReq})]);
  for(const r of races)assert.equal(r.error,null);
  assert.equal(races.filter(r=>r.data.allowed).length,1);
  const reservation=races.find(r=>r.data.allowed).data;
  const winner=races[2].data.allowed?b:a,loser=races[2].data.allowed?a:b,winnerReq=races[2].data.allowed?bReq:req;
  const finish={p_actor_id:winner.id,p_request_id:winnerReq,p_reservation_id:reservation.reservationId,p_actual:12,p_successful:true,p_release:false};
  assert.equal((await admin.rpc('finish_kinnso_budget',{...finish,p_actor_id:loser.id})).error?.message,'reservation_not_found');
  assert.equal((await admin.rpc('finish_kinnso_budget',{...finish,p_request_id:randomUUID()})).error?.message,'reservation_not_found');
  assert.ok((await a.client.rpc('finish_kinnso_budget',finish)).error);
  await ok(admin.auth.admin.updateUserById(winner.id,{ban_duration:'24h'}));
  assert.equal((await reserve(winner,{...args,p_request_id:randomUUID()})).error?.message,'unauthenticated');
  await ok(admin.rpc('finish_kinnso_budget',finish));await ok(admin.rpc('finish_kinnso_budget',finish));
  await ok(admin.auth.admin.updateUserById(winner.id,{ban_duration:'none'}));

  assert.equal((await admin.rpc('finish_kinnso_budget',{...finish,p_actual:0,p_successful:false,p_release:true})).error?.message,'idempotency_conflict');
  const report=await ok(owner.client.rpc('get_kinnso_monitoring'));
  const budget=report.budgets.find(x=>x.service==='ai');assert.equal(budget.spent,12);assert.equal(budget.reserved,0);assert.equal(budget.status,'overrun');assert.equal(budget.successfulFlows,1);
  assert.equal((await reserve(a,{...args,p_request_id:randomUUID(),p_estimate:1})).data.reason,'exhausted');
  assert.equal((await reserve(winner,{...args,p_request_id:winnerReq,p_estimate:8})).error?.message,'idempotency_conflict');
  assert.equal((await b.client.rpc('get_kinnso_monitoring')).error?.message,'forbidden');
  await ok(admin.rpc('configure_kinnso_budget',{...config,p_service:'maps'}));
  const mapReq=randomUUID(),map=await ok(reserve(a,{p_service:'maps',p_request_id:mapReq,p_estimate:10}));
  const release={...finish,p_actor_id:a.id,p_request_id:mapReq,p_reservation_id:map.reservationId,p_actual:0,p_successful:false,p_release:true};
  await ok(admin.rpc('finish_kinnso_budget',release));await ok(admin.rpc('finish_kinnso_budget',release));
  assert.equal((await admin.rpc('finish_kinnso_budget',{...release,p_release:false,p_actual:1})).error?.message,'idempotency_conflict');
  assert.equal((await reserve(a,{p_service:'maps',p_request_id:mapReq,p_estimate:10})).data.reason,'already_finished');
  const deleted=await f.actor(),deletedRequest=randomUUID();await ok(admin.rpc('configure_kinnso_budget',{...config,p_service:'storage'}));
  const deletedReservation=await ok(admin.rpc('reserve_kinnso_budget',{p_actor_id:deleted.id,p_session_id:await sessionId(deleted),p_service:'storage',p_request_id:deletedRequest,p_estimate:5}));
  await f.deleteActor(deleted.id);
  const deletedFinish={...finish,p_actor_id:deleted.id,p_request_id:deletedRequest,p_reservation_id:deletedReservation.reservationId,p_actual:4,p_successful:true};
  await ok(admin.rpc('finish_kinnso_budget',deletedFinish));await ok(admin.rpc('finish_kinnso_budget',deletedFinish));
  assert.equal((await ok(owner.client.rpc('get_kinnso_monitoring'))).budgets.find(x=>x.service==='storage').spent,4);
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('user_id',owner.id));
  assert.equal((await owner.client.rpc('get_kinnso_monitoring')).error?.message,'forbidden');
  assert.equal((await admin.rpc('configure_kinnso_budget',config)).error?.message,'forbidden');
 }finally{
  // Exact fresh-local fixture services only. No remote paths or dynamic SQL identifiers.
  sql("delete from kinnso_internal.budget_reservations where service in('ai','maps','storage');delete from kinnso_internal.service_budgets where service in('ai','maps','storage');");
  if(opsId)await ok(admin.from('kinnso_ops_members').delete().eq('user_id',opsId));await f.cleanup();
 }
});

test('durable consent-filtered aggregates and latency samples preserve unknown, idempotency and failed job health',async()=>{
 const f=await fixture();let opsId;
 assert.equal(sql('select count(*) from kinnso_internal.funnel_daily;').trim(),'0','fresh isolated telemetry fixture required');
 assert.equal(sql('select count(*) from kinnso_internal.performance_samples;').trim(),'0');
 // Cleanup tests leave durable health records. Own one unused job and preserve all others.
 const fixtureJob='telemetry_retention';
 assert.equal(sql("select count(*) from kinnso_internal.scheduled_health where job='telemetry_retention';").trim(),'0','unoccupied scheduled-health fixture required');
 const otherHealth="select coalesce(jsonb_agg(to_jsonb(h) order by job),'[]'::jsonb) from kinnso_internal.scheduled_health h where job<>'telemetry_retention';";
 const previousHealth=sql(otherHealth);
 try{
  const owner=await f.actor(),a=await f.actor();opsId=owner.id;
  await ok(admin.from('kinnso_ops_members').insert({user_id:owner.id,display_name:'Synthetic measurement operator',role:'owner'}));
  const before=await ok(owner.client.rpc('get_kinnso_monitoring'));
  assert.ok(before.funnel.every(x=>x.count===null&&x.status==='unknown'));
  assert.ok(before.performance.every(x=>x.status==='unknown'&&x.p75===null));
  assert.ok(before.budgets.every(x=>x.status==='disabled'&&x.limit===null&&x.successfulFlows===null));
  const event={name:'trip_created',mode:'connected',context:'traveller',consent:'accepted',requestId:randomUUID()};
  for(const patch of [{mode:'demo'},{context:'admin'},{context:'synthetic'},{consent:'denied'}])assert.equal((await ok(admin.rpc('ingest_kinnso_telemetry',{p_actor_id:a.id,p_event:{...event,...patch}}))).accepted,false);
  assert.equal((await ok(admin.rpc('ingest_kinnso_telemetry',{p_actor_id:owner.id,p_event:event}))).accepted,false);
  for(const patch of [{note:'private'},{email:'synthetic@example.test'},{shareToken:randomUUID()}])assert.equal((await admin.rpc('ingest_kinnso_telemetry',{p_actor_id:a.id,p_event:{...event,...patch}})).error?.message,'invalid_command');
  assert.ok((await a.client.rpc('ingest_kinnso_telemetry',{p_actor_id:a.id,p_event:event})).error);
  const races=await Promise.all([admin.rpc('ingest_kinnso_telemetry',{p_actor_id:a.id,p_event:event}),admin.rpc('ingest_kinnso_telemetry',{p_actor_id:a.id,p_event:event})]);
  for(const r of races)assert.equal(r.error,null);assert.equal(races.filter(r=>!r.data.replayed).length,1);
  assert.equal((await admin.rpc('ingest_kinnso_telemetry',{p_actor_id:a.id,p_event:{...event,name:'trip_imported'}})).error?.message,'idempotency_conflict');
  const sampleArgs={p_request_id:randomUUID(),p_sample:{metric:'LCP',value:0},p_mode:'connected',p_context:'traveller',p_consent:'denied'};
  assert.equal((await ok(admin.rpc('record_kinnso_performance',sampleArgs))).accepted,false);
  await ok(admin.rpc('record_kinnso_performance',{...sampleArgs,p_consent:'accepted'}));
  let report=await ok(owner.client.rpc('get_kinnso_monitoring'));
  assert.equal(report.funnel.find(x=>x.name==='trip_created').count,1);
  assert.equal(report.performance.find(x=>x.metric==='LCP').status,'insufficient');
  for(let i=1;i<20;i++)await ok(admin.rpc('record_kinnso_performance',{...sampleArgs,p_request_id:randomUUID(),p_consent:'accepted',p_sample:{metric:'LCP',value:i}}));
  report=await ok(owner.client.rpc('get_kinnso_monitoring'));assert.equal(report.performance.find(x=>x.metric==='LCP').p75,14);
  assert.equal(JSON.stringify(report).includes(a.id),false);assert.equal(JSON.stringify(report).includes(event.requestId),false);
  await ok(admin.rpc('record_kinnso_scheduled_run',{p_job:fixtureJob,p_successful:true,p_started_at:'2026-01-01T00:00:00Z'}));
  const success=(await ok(owner.client.rpc('get_kinnso_monitoring'))).scheduledRuns.find(x=>x.job===fixtureJob).lastSuccessAt;
  await ok(admin.rpc('record_kinnso_scheduled_run',{p_job:fixtureJob,p_successful:false,p_started_at:'2026-01-02T00:00:00Z'}));
  const failed=(await ok(owner.client.rpc('get_kinnso_monitoring'))).scheduledRuns.find(x=>x.job===fixtureJob);assert.equal(failed.lastStatus,'failed');assert.equal(failed.lastSuccessAt,success);
  const alert=scheduledHealth(failed);assert.equal(alert.state,'failed');assert.equal(alert.alert,true);assert.equal(alert.owner,'platform_operations');assert.equal(alert.runbook,'/docs/implementation/METRICS_AND_ALERTS.md#scheduled-jobs');
 }finally{
  sql("delete from kinnso_internal.telemetry_receipts;delete from kinnso_internal.funnel_daily;delete from kinnso_internal.performance_samples;delete from kinnso_internal.scheduled_health where job='telemetry_retention';");
  assert.equal(sql(otherHealth),previousHealth,'preexisting job-health records must be preserved');
  if(opsId)await ok(admin.from('kinnso_ops_members').delete().eq('user_id',opsId));await f.cleanup();
 }
});
