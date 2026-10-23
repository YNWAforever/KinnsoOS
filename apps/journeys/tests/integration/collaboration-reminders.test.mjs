import {runCollaborationReminders} from '../../lib/collaboration/reminders.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {execFileSync}from'node:child_process';import{verifyTestTarget}from'../../scripts/verify-test-target.mjs';import {fixture,admin,anonymous} from './local-fixtures.mjs';
const ok=async p=>{const r=await p;assert.equal(r.error,null);return r.data;};
async function setup(f,offset=30_000,count=1,differentDeadlines=false){const owner=await f.actor(),creator=await f.actor(true),other=await f.actor(true);const merchant=await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic reminder',contact_email:'synthetic@example.test'}).select('id').single());const now=new Date().toISOString(),due=offset===null?null:new Date(Date.parse(now)+offset).toISOString();const mission=await ok(admin.from('missions').insert({merchant_profile_id:merchant.id,title:'Synthetic reminder brief',summary:'Synthetic only',mission_type:'coupon_affiliate',status:'draft',coupon_code:'X',coupon_url:'https://example.test'}).select('id').single());const milestone=await ok(admin.from('mission_milestones').insert({mission_id:mission.id,title:'Original guide',description:'Synthetic reminder work',due_at:due}).select('id').single());if(count>1)await ok(admin.from('mission_milestones').insert(Array.from({length:count-1},(_,i)=>({mission_id:mission.id,title:'Synthetic reminder '+i,description:'Owned work',due_at:differentDeadlines?new Date(Date.parse(due)+(i+1)*3600_000).toISOString():due,sort_order:i+1}))));await ok(admin.from('missions').update({status:'published'}).eq('id',mission.id));const participant=await ok(admin.from('mission_participants').insert({mission_id:mission.id,creator_id:creator.id,status:'active',source:'open_join'}).select('id').single());return{owner,creator,other,merchant:merchant.id,mission:mission.id,milestone:milestone.id,participant:participant.id,now,due,cleanup:()=>ok(admin.from('missions').delete().eq('id',mission.id))};}
const scan=(now,after=null,limit=50)=>admin.rpc('due_kinnso_collaboration_reminders',{p_now:now,p_after:after,p_limit:limit});const emit=(c,now)=>admin.rpc('emit_kinnso_collaboration_reminder',{p_now:now,p_candidate:c});
test('W08 reminder payload is a canonical milestone deadline snapshot with a bounded private inbox projection',async()=>{
 const f=await fixture();let x;
 try{
  x=await setup(f,3_600_000,2,true);
  const candidates=(await ok(scan(x.now))).items.filter(c=>c.participantId===x.participant);assert.equal(candidates.length,2);
  const milestones=await ok(admin.from('mission_milestones').select('id,title,due_at').eq('mission_id',x.mission));
  for(const candidate of candidates){assert.deepEqual(Object.keys(candidate).sort(),['deadlineVersion','eventKind','milestoneId','participantId']);assert.equal((await ok(emit(candidate,x.now))).emitted,true);}
  const events=(await ok(x.creator.client.rpc('get_kinnso_inbox'))).items.filter(n=>n.type==='collaboration.due_soon');assert.equal(events.length,2);
  for(const row of milestones){
   const item=events.find(n=>n.payload.milestoneId===row.id);assert.ok(item,'each reminder identifies its actual milestone');
   assert.equal(item.payload.milestoneTitle,row.title);assert.equal(Date.parse(item.payload.dueAt),Date.parse(row.due_at));assert.equal(Date.parse(item.payload.deadlineVersion),Date.parse(row.due_at));
  }
  assert.equal((await ok(x.other.client.rpc('get_kinnso_inbox'))).items.some(n=>n.entityId===x.mission),false);
  await ok(admin.from('notifications').update({payload:{mission_title:'Legacy snapshot',private_proof:'PRIVATE_DO_NOT_PROJECT'}}).eq('id',events[0].id));
  const legacy=(await ok(x.creator.client.rpc('get_kinnso_inbox'))).items.find(n=>n.id===events[0].id);
  assert.deepEqual(legacy.payload,{missionTitle:'Legacy snapshot'});
  assert.equal((await ok(emit(candidates[0],x.now))).emitted,false,'legacy projection does not alter the dedupe fact');
 }finally{if(x)await x.cleanup();await f.cleanup();}
});
test('service-only bounded reminders are atomic and deduplicated across workers, ticks and notification retention',async()=>{const f=await fixture();let x;try{x=await setup(f);const page=await ok(scan(x.now));const c=page.items.find(c=>c.participantId===x.participant);assert.ok(c);assert.equal(c.eventKind,'collaboration.due_soon');assert.equal(c.proofs,undefined);assert.equal((await anonymous.rpc('due_kinnso_collaboration_reminders',{p_now:x.now})).error?.code,'42501');assert.equal((await x.creator.client.rpc('emit_kinnso_collaboration_reminder',{p_now:x.now,p_candidate:c})).error?.code,'42501');
 const results=await Promise.all([ok(emit(c,x.now)),ok(emit(c,x.now))]);assert.equal(results.filter(r=>r.emitted).length,1);assert.equal((await ok(emit(c,x.now))).emitted,false);let inbox=await ok(x.creator.client.rpc('get_kinnso_inbox'));const event=inbox.items.find(n=>n.type==='collaboration.due_soon');assert.ok(event);assert.equal(event.entityId,x.mission);assert.equal((await ok(x.other.client.rpc('get_kinnso_inbox'))).items.some(n=>n.entityId===x.mission),false);
 await ok(admin.from('notifications').delete().eq('id',event.id));assert.equal((await ok(emit(c,x.now))).emitted,false);const late=new Date(Date.parse(x.due)+1).toISOString();const overdue=(await ok(scan(late))).items.find(c=>c.participantId===x.participant);assert.equal(overdue.eventKind,'collaboration.overdue');assert.equal((await ok(emit(overdue,late))).emitted,true);assert.equal((await ok(emit(overdue,late))).emitted,false);
 }finally{if(x)await x.cleanup();await f.cleanup();}});
test('emission rechecks submitted/revision, cancelled and suspended recipients; recruiting cutoff preserves active work',async()=>{const f=await fixture();let x;try{x=await setup(f);const c=(await ok(scan(x.now))).items.find(c=>c.participantId===x.participant);assert.ok(c);
 await ok(admin.from('mission_milestone_submissions').insert({mission_participant_id:x.participant,mission_milestone_id:x.milestone,status:'submitted',proof_urls:['https://private.example.test/proof']}));assert.equal((await ok(emit(c,x.now))).emitted,false);await ok(admin.from('mission_milestone_submissions').update({status:'revision_requested'}).eq('mission_participant_id',x.participant));await ok(admin.from('creators').update({status:'suspended'}).eq('id',x.creator.id));assert.equal((await ok(emit(c,x.now))).emitted,false);await ok(admin.from('creators').update({status:'active'}).eq('id',x.creator.id));await ok(admin.from('mission_participants').update({status:'cancelled'}).eq('id',x.participant));assert.equal((await ok(emit(c,x.now))).emitted,false);await ok(admin.from('mission_participants').update({status:'active'}).eq('id',x.participant));assert.equal((await ok(emit({...c,deadlineVersion:new Date(Date.parse(x.due)+1).toISOString()},x.now))).emitted,false);await ok(admin.from('missions').update({status:'paused'}).eq('id',x.mission));assert.equal((await ok(emit(c,x.now))).emitted,true);const events=await ok(x.creator.client.rpc('get_kinnso_inbox'));assert.equal(events.items.filter(n=>n.type==='submission.revision_requested').length,1);assert.equal(events.items.filter(n=>n.type==='collaboration.due_soon').length,1);assert.ok(!JSON.stringify(events).includes('private.example.test'));
 }finally{if(x)await x.cleanup();await f.cleanup();}});
test('reminder job health stays unknown until success and retains last success on a later failure',async()=>{
 const f=await fixture();
 try{
  const ops=await f.actor();await ok(admin.from('kinnso_ops_members').insert({user_id:ops.id,display_name:'Synthetic reminders ops',role:'admin'}));
  const session=await ops.client.auth.getSession();assert.equal(session.error,null);
  const jwt=JSON.parse(Buffer.from(session.data.session.access_token.split('.')[1],'base64url').toString());assert.equal(jwt.sub,ops.id);assert.match(jwt.session_id,/^[0-9a-f-]{36}$/i);
  const claims=JSON.stringify({sub:ops.id,session_id:jwt.session_id,role:'authenticated',is_anonymous:false});
  const target=verifyTestTarget(),container=JSON.parse(execFileSync('docker',['inspect',target.dbContainer],{encoding:'utf8'}))[0];assert.equal(container.Config.Labels['com.supabase.cli.project'],target.projectRef);assert.equal(container.State.Running,true);
  const snapshot=()=>sql("select coalesce((select to_jsonb(h)from kinnso_internal.scheduled_health h where job='collaboration_reminders'),'null'::jsonb);").trim(),before=snapshot();
  // A rollback-only empty scope exercises first success without deleting real retained health history.
  const read=stage=>`set local role authenticated;select set_config('request.jwt.claims','${claims}',true);select jsonb_build_object('stage','${stage}','row',(select r from jsonb_array_elements(public.get_kinnso_monitoring()->'scheduledRuns')r where r->>'job'='collaboration_reminders'));reset role;`;
  const record=successful=>`set local role service_role;select set_config('request.jwt.claims','{"role":"service_role"}',true);select public.record_kinnso_scheduled_run('collaboration_reminders',${successful},clock_timestamp());reset role;`;
  const output=sql(`begin;set local lock_timeout='5s';set local statement_timeout='10s';delete from kinnso_internal.scheduled_health where job='collaboration_reminders';${read('unknown')}${record(true)}${read('success')}${record(false)}${read('failure')}rollback;`);
  const rows=output.split(String.fromCharCode(10)).filter(line=>line.startsWith('{')&&line.includes('"stage"')).map(line=>JSON.parse(line));assert.deepEqual(rows.map(x=>x.stage),['unknown','success','failure']);
  assert.ok(rows[0].row);assert.equal(rows[0].row.lastSuccessAt,null);const success=rows[1].row.lastSuccessAt;assert.ok(success);assert.equal(rows[2].row.lastSuccessAt,success);assert.equal(rows[2].row.lastStatus,'failed');
  assert.equal(snapshot(),before,'rollback retains the exact pre-existing success/failure history');
 }finally{await f.cleanup();}
});

const target=verifyTestTarget();function sql(input){const container=JSON.parse(execFileSync('docker',['inspect',target.dbContainer],{encoding:'utf8'}))[0];assert.equal(container.Config.Labels['com.supabase.cli.project'],target.projectRef);return execFileSync('docker',['exec','-i',target.dbContainer,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8'});}
test('bounded tuple pagination covers all 55 milestones and skips accounts banned at emission time',async()=>{const f=await fixture();let x;try{x=await setup(f,30_000,55);const found=[];let cursor=null;do{const page=await ok(scan(x.now,cursor,20));assert.ok(page.items.length<=20);found.push(...page.items.filter(c=>c.participantId===x.participant).map(c=>c.milestoneId));cursor=page.nextCursor;}while(cursor);assert.equal(new Set(found).size,55);assert.equal(found.length,55);const c=(await ok(scan(x.now))).items[0];sql(`update auth.users set banned_until=now()+interval '1 hour'where id='${x.creator.id}';`);assert.equal((await ok(emit(c,x.now))).emitted,false);sql(`update auth.users set banned_until=null where id='${x.creator.id}';`);await ok(admin.from('merchant_profiles').update({status:'suspended'}).eq('id',x.merchant));assert.equal((await ok(emit(c,x.now))).emitted,false);await ok(admin.from('merchant_profiles').update({status:'active'}).eq('id',x.merchant));assert.equal((await ok(emit(c,x.now))).emitted,true);
 }finally{if(x)await x.cleanup();await f.cleanup();}});
test('an inbox failure rolls back its dedupe fact so the unchanged candidate can be safely retried',async()=>{const f=await fixture();let x;const suffix=randomUUID().replaceAll('-',''),name='synthetic_reminder_'+suffix;try{x=await setup(f);const c=(await ok(scan(x.now))).items.find(c=>c.participantId===x.participant);sql(`create function public.${name}()returns trigger language plpgsql as $$begin if new.creator_id='${x.creator.id}'::uuid and new.notification_type='collaboration.due_soon'then raise exception 'synthetic_reminder_inbox_failure';end if;return new;end $$;create trigger ${name} before insert on public.notifications for each row execute function public.${name}();`);assert.equal((await emit(c,x.now)).error?.message,'synthetic_reminder_inbox_failure');sql(`drop trigger ${name} on public.notifications;drop function public.${name}();`);assert.equal((await ok(emit(c,x.now))).emitted,true);assert.equal((await ok(emit(c,x.now))).emitted,false);
 }finally{sql(`drop trigger if exists ${name} on public.notifications;drop function if exists public.${name}();`);if(x)await x.cleanup();await f.cleanup();}});

test('a milestone without a due date emits no deadline event',async()=>{const f=await fixture();let x;try{x=await setup(f,null);assert.equal((await ok(scan(x.now))).items.some(c=>c.participantId===x.participant),false);}finally{if(x)await x.cleanup();await f.cleanup();}});


test('final rejected non-repeatable work is absent from scan and suppressed after a stale scan',async()=>{const f=await fixture();let x;try{x=await setup(f);const c=(await ok(scan(x.now))).items.find(c=>c.participantId===x.participant);assert.ok(c);await ok(admin.from('mission_milestone_submissions').insert({mission_participant_id:x.participant,mission_milestone_id:x.milestone,status:'submitted',proof_urls:['https://private.example.test/final']}));await ok(admin.from('mission_milestone_submissions').update({status:'rejected'}).eq('mission_participant_id',x.participant));assert.equal((await ok(scan(x.now))).items.some(c=>c.participantId===x.participant),false);assert.equal((await ok(emit(c,x.now))).emitted,false);}finally{if(x)await x.cleanup();await f.cleanup();}});

test('bounded candidate query applies processed-history exclusion and cursor before its internal limit',async()=>{const f=await fixture();let x;try{x=await setup(f,30_000,1001);sql(`insert into kinnso_internal.collaboration_reminder_facts(event_kind,milestone_id,recipient_id,deadline_version)select 'collaboration.due_soon',id,'${x.creator.id}',due_at from public.mission_milestones where mission_id='${x.mission}'order by id limit 999;`);const rows=JSON.parse(sql(`select coalesce(jsonb_agg(c),'[]')from kinnso_internal.collaboration_reminder_candidates('${x.now}',null,null,null,null,2)c;`).trim());assert.equal(rows.length,2);const page=await ok(scan(x.now,null,1));assert.equal(page.items.length,1);assert.ok(page.nextCursor);const last=await ok(scan(x.now,page.nextCursor,1));assert.equal(last.items.length,1);assert.equal(last.nextCursor,null);assert.notEqual(page.items[0].milestoneId,last.items[0].milestoneId);
 const body=sql("select prosrc from pg_proc where oid='kinnso_internal.collaboration_reminder_candidates(timestamptz,uuid,uuid,uuid,uuid,integer)'::regprocedure;").trim();const params=['p_now','p_participant','p_milestone','p_after_participant','p_after_milestone','p_limit'];let query=body;params.forEach((name,i)=>query=query.replace(new RegExp('\\b'+name+'\\b','g'),'$'+(i+1)));const plan=JSON.parse(sql(`prepare owned_reminder_plan(timestamptz,uuid,uuid,uuid,uuid,integer)as ${query.replace(/;\s*$/,'')};explain(analyze,format json)execute owned_reminder_plan('${x.now}',null,null,null,null,2);`).slice('PREPARE\n'.length).trim())[0];const nodes=[];function walk(n){nodes.push(n);for(const child of n.Plans??[])walk(child);}walk(plan.Plan);assert.equal(plan.Plan['Node Type'],'Limit');assert.ok(plan.Plan['Actual Rows']<=2);assert.equal(nodes.some(n=>n['Node Type']==='Function Scan'),false);console.log('owned reminder processed-history plan',JSON.stringify({rows:plan.Plan['Actual Rows'],executionMs:plan['Execution Time'],nodes:nodes.map(n=>n['Node Type'])}));
 }finally{if(x)await x.cleanup();await f.cleanup();}});

async function cleanupOwnedReminderProbe(f,x){
 if(x)await x.cleanup();await f.cleanup();
 if(x){assert.deepEqual(await ok(admin.from('missions').select('id').eq('id',x.mission)),[]);for(const actor of [x.owner,x.creator,x.other]){const r=await admin.auth.admin.getUserById(actor.id);assert.equal(r.error?.status,404);assert.equal(r.data.user,null);}console.log('PD17_OWNED_CLEANUP',JSON.stringify({exactMissionAbsent:true,exactFixtureActorsAbsent:3}));}
}

test('PD17 owned DB: a committed emit with lost ACK recovers from the same tick without duplicate recipient events', async () => {
 const f=await fixture();let x;
 try {
  x=await setup(f,3_600_000,5);let emittedCalls=0,lost=null;
  const port={
   due:async({now,after,limit})=>{assert.equal(now,x.now);const page=await ok(scan(now,after,limit));return {...page,items:page.items.filter(c=>c.participantId===x.participant)};},
   emit:async(c,now)=>{assert.equal(c.participantId,x.participant);const result=await ok(emit(c,now));if(++emittedCalls===3){lost={candidate:structuredClone(c),now};throw Error('owned transport ACK lost after committed RPC');}return result;},
  };
  await assert.rejects(runCollaborationReminders(x.now,port),/ACK lost after committed RPC/);
  assert.ok(lost);assert.equal(lost.now,x.now);
  let events=(await ok(x.creator.client.rpc('get_kinnso_inbox'))).items.filter(n=>n.entityId===x.mission&&n.type==='collaboration.due_soon');
  assert.equal(events.length,3,'the unknown third result really committed in the owned DB');
  assert.equal((await ok(emit(lost.candidate,lost.now))).emitted,false,'reconcile/retry the identical candidate and tick, never invent an event');
  const resumed=await runCollaborationReminders(x.now,port);
  assert.equal(resumed.completed,true);assert.equal(resumed.emitted,2);
  events=(await ok(x.creator.client.rpc('get_kinnso_inbox'))).items.filter(n=>n.entityId===x.mission&&n.type==='collaboration.due_soon');
  assert.equal(events.length,5);assert.equal(new Set(events.map(n=>n.payload.milestoneId)).size,5);
  const before=events.map(n=>n.id).sort();assert.equal((await runCollaborationReminders(x.now,port)).emitted,0);
  assert.deepEqual((await ok(x.creator.client.rpc('get_kinnso_inbox'))).items.filter(n=>n.entityId===x.mission&&n.type==='collaboration.due_soon').map(n=>n.id).sort(),before);
  assert.equal((await ok(x.other.client.rpc('get_kinnso_inbox'))).items.some(n=>n.entityId===x.mission),false);
  console.log('PD17_OWNED_RECOVERY',JSON.stringify({scenario:'committed_ack_loss',source:process.env.GITHUB_SHA??'local',committedBeforeRecovery:3,recipientReadback:5,duplicates:0,externalDelivery:'NOT_RUN'}));
 } finally {await cleanupOwnedReminderProbe(f,x);}
});

test('PD17 owned DB: bounded cursor and failed reread preserve the checkpoint, then recover every remaining event', async () => {
 const f=await fixture();let x;
 try {
  x=await setup(f,3_600_000,5);
  const port={due:async({now,after,limit})=>{assert.equal(now,x.now);const p=await ok(scan(now,after,limit));return {...p,items:p.items.filter(c=>c.participantId===x.participant)};},emit:async(c,now)=>{assert.equal(c.participantId,x.participant);return ok(emit(c,now));}};
  const first=await runCollaborationReminders(x.now,port,{limit:2,maxPages:1});
  assert.equal(first.completed,false);assert.ok(first.nextCursor);const checkpoint=first.nextCursor;
  const ownEvents=async()=>(await ok(x.creator.client.rpc('get_kinnso_inbox'))).items.filter(n=>n.entityId===x.mission&&n.type==='collaboration.due_soon');
  const before=await ownEvents();assert.equal(before.length,2);
  await assert.rejects(runCollaborationReminders(x.now,{...port,due:async()=>{throw Error('owned controlled reread outage');}},{after:checkpoint}),/controlled reread outage/);
  assert.deepEqual((await ownEvents()).map(n=>n.id).sort(),before.map(n=>n.id).sort(),'failed read caused no replay write or unlocked new window');
  assert.equal(first.nextCursor,checkpoint);
  const resumed=await runCollaborationReminders(x.now,port,{after:checkpoint});
  assert.equal(resumed.completed,true);assert.equal(resumed.emitted,3);
  const events=await ownEvents();assert.equal(events.length,5);assert.equal(new Set(events.map(n=>n.payload.milestoneId)).size,5);
  assert.equal((await runCollaborationReminders(x.now,port)).emitted,0);
  assert.equal((await ok(x.other.client.rpc('get_kinnso_inbox'))).items.some(n=>n.entityId===x.mission),false);
  console.log('PD17_OWNED_RECOVERY',JSON.stringify({scenario:'bounded_cursor_read_outage',source:process.env.GITHUB_SHA??'local',checkpointRetained:true,recipientReadback:5,duplicates:0,externalDelivery:'NOT_RUN'}));
 } finally {await cleanupOwnedReminderProbe(f,x);}
});
