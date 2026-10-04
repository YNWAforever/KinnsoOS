import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fixture,admin,anonymous} from './local-fixtures.mjs';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
const target=verifyTestTarget(),ok=async promise=>{const r=await promise;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
function sql(input){const container=JSON.parse(execFileSync('docker',['inspect',target.dbContainer],{encoding:'utf8'}))[0];assert.equal(container.Config.Labels['com.supabase.cli.project'],target.projectRef);return execFileSync('docker',['exec','-i',target.dbContainer,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8'}).trim();}
test('USD monthly cap is shared across services, serializes races, fences sessions and preserves charged overrun',async()=>{
 const f=await fixture(),month=new Date().toISOString().slice(0,7)+'-01';let ownerId,ownedMonth=false;
 try {
  const owner=await f.actor(),a=await f.actor(),b=await f.actor();ownerId=owner.id;
  await ok(admin.from('kinnso_ops_members').insert({user_id:owner.id,display_name:'Synthetic monthly budget owner',role:'owner'}));
  if(sql("select coalesce(to_regclass('kinnso_internal.monthly_cost_limits')::text,'');"))assert.equal(sql(`select count(*) from kinnso_internal.monthly_cost_limits where month='${month}';`),'0','unoccupied month required; preserve preexisting configuration');
  const config={p_owner_id:owner.id,p_month:month,p_limit_usd_micros:5000000,p_rates:{ai:'synthetic-fixed-usd-v1',storage:'synthetic-fixed-usd-v1',maps:'synthetic-fixed-usd-v1'}};
  await ok(admin.rpc('configure_kinnso_monthly_cost_limit',config));ownedMonth=true;
  assert.equal((await a.client.rpc('get_kinnso_monthly_costs')).error?.message,'forbidden');
  const initial=await ok(owner.client.rpc('get_kinnso_monthly_costs'));assert.equal(initial.currency,'USD');assert.equal(initial.limit,5000000);assert.equal(initial.spent,0);assert.equal(initial.services.length,5);assert.equal(initial.services.find(s=>s.service==='jobs').enabled,false);
  assert.equal((await admin.rpc('configure_kinnso_monthly_cost_limit',{...config,p_limit_usd_micros:5000001})).error?.message,'invalid_budget');
  const session=async actor=>JSON.parse(Buffer.from((await actor.client.auth.getSession()).data.session.access_token.split('.')[1],'base64url')).session_id;
  const args={p_actor_id:a.id,p_session_id:await session(a),p_service:'ai',p_request_id:randomUUID(),p_estimate_usd_micros:3000000,p_rate_version:'synthetic-fixed-usd-v1'};
  assert.equal((await a.client.rpc('reserve_kinnso_monthly_cost',args)).error?.code,'42501');assert.equal((await anonymous.rpc('reserve_kinnso_monthly_cost',args)).error?.code,'42501');
  assert.equal((await admin.rpc('reserve_kinnso_monthly_cost',{...args,p_session_id:await session(b)})).error?.message,'unauthenticated');
  assert.equal((await ok(admin.rpc('reserve_kinnso_monthly_cost',{...args,p_service:'jobs'}))).reason,'disabled');
  assert.equal((await ok(admin.rpc('reserve_kinnso_monthly_cost',{...args,p_rate_version:'unapproved-v2'}))).reason,'disabled');
  const other={...args,p_actor_id:b.id,p_session_id:await session(b),p_service:'storage',p_request_id:randomUUID()};
  const races=await Promise.all([admin.rpc('reserve_kinnso_monthly_cost',args),admin.rpc('reserve_kinnso_monthly_cost',other)]);for(const r of races)assert.equal(r.error,null);
  assert.equal(races.filter(r=>r.data.allowed).length,1);assert.equal(races.filter(r=>r.data.reason==='exhausted').length,1);
  const index=races[0].data.allowed?0:1,winner=index===0?args:other,reservation=races[index].data.reservationId;
  assert.equal((await ok(admin.rpc('reserve_kinnso_monthly_cost',winner))).reason,'in_flight');
  assert.equal((await admin.rpc('reserve_kinnso_monthly_cost',{...winner,p_estimate_usd_micros:1})).error?.message,'idempotency_conflict');
  const finish={p_actor_id:winner.p_actor_id,p_request_id:winner.p_request_id,p_reservation_id:reservation,p_actual_usd_micros:6000000,p_successful:false,p_release:false};
  const wrong=await admin.rpc('finish_kinnso_monthly_cost',{...finish,p_actor_id:owner.id});assert.equal(wrong.error?.message,'reservation_not_found');
  await ok(admin.auth.admin.updateUserById(winner.p_actor_id,{ban_duration:'24h'}));
  await ok(admin.rpc('finish_kinnso_monthly_cost',finish));await ok(admin.rpc('finish_kinnso_monthly_cost',finish));
  assert.equal(sql(`select spent_usd_micros||':'||reserved_usd_micros from kinnso_internal.monthly_cost_limits where month='${month}';`),'6000000:0');
  const report=await ok(owner.client.rpc('get_kinnso_monthly_costs'));assert.equal(report.status,'overrun');assert.equal(report.spent,6000000);assert.equal(report.services.find(s=>s.service===winner.p_service).successfulFlows,0);assert.ok(!JSON.stringify(report).includes(winner.p_actor_id));assert.ok(!JSON.stringify(report).includes(winner.p_request_id));
  assert.equal((await admin.rpc('finish_kinnso_monthly_cost',{...finish,p_actual_usd_micros:0,p_release:true})).error?.message,'idempotency_conflict');
  await ok(admin.auth.admin.updateUserById(winner.p_actor_id,{ban_duration:'none'}));
  assert.equal((await ok(admin.rpc('reserve_kinnso_monthly_cost',{...args,p_request_id:randomUUID(),p_service:'maps',p_estimate_usd_micros:1}))).reason,'exhausted');
  assert.equal((await ok(admin.rpc('reserve_kinnso_monthly_cost',winner))).reason,'already_finished');
  for(const role of ['anon','authenticated','service_role'])for(const table of ['monthly_cost_limits','monthly_cost_reservations'])assert.equal(sql(`select has_table_privilege('${role}','kinnso_internal.${table}','SELECT,INSERT,UPDATE,DELETE');`),'f');
  sql(`update auth.users set banned_until=now()+interval '1 day' where id='${owner.id}';`);
  assert.equal((await owner.client.rpc('get_kinnso_monthly_costs')).error?.message,'forbidden');
  sql(`update auth.users set banned_until=null,deleted_at=now() where id='${owner.id}';`);
  assert.equal((await owner.client.rpc('get_kinnso_monthly_costs')).error?.message,'forbidden');
  sql(`update auth.users set deleted_at=null where id='${owner.id}';`);
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('user_id',owner.id));assert.equal((await admin.rpc('configure_kinnso_monthly_cost_limit',config)).error?.message,'forbidden');
 }finally{
  if(ownedMonth)sql(`delete from kinnso_internal.monthly_cost_reservations where month='${month}';delete from kinnso_internal.monthly_cost_limits where month='${month}';`);
  if(ownerId)await ok(admin.from('kinnso_ops_members').delete().eq('user_id',ownerId));await f.cleanup();
 }
});
