import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fixture,admin} from './local-fixtures.mjs';
test('real pilot measurement deduplicates receipts, proves edited readback and new-session reopen; synthetic events are rolled back',async()=>{
 const f=await fixture();
 const merchantId=randomUUID(),experienceId=randomUUID();
 try{
  const author=await f.actor(true),owner=await f.actor(),guideId=await f.guide(author);
  const checked=result=>{assert.equal(result.error,null);return result.data};
  checked(await author.client.rpc('publish_guide_version',{p_guide_id:guideId,p_expected_version:0,p_request_id:randomUUID(),p_content:{days:[{offset:0,title:'Synthetic day',stops:[{title:'Synthetic stop',description:'Synthetic authored content',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}]}}));
  const created=checked(await owner.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic measurement trip',timezone:'UTC'}}));
  const requestId=randomUUID(),adopted=checked(await owner.client.rpc('adopt_guide_to_trip',{p_guide_id:guideId,p_version:1,p_trip_id:created.id,p_expected_revision:1,p_request_id:requestId}));
  const editId=randomUUID(),edited=checked(await owner.client.rpc('apply_trip_command',{p_trip_id:created.id,p_expected_revision:adopted.revision,p_request_id:editId,p_command:{type:'patchTrip',patch:{startDate:'2026-11-01'}}}));
  const flowId=randomUUID(),sessionId=randomUUID(),otherSession=randomUUID();
  const merchant=await f.actor();
  checked(await admin.from('merchant_profiles').insert({id:merchantId,user_id:merchant.id,company_name:'Synthetic pilot measurement merchant',contact_email:'synthetic-'+merchant.id+'@example.test',slug:'synthetic-'+merchantId,status:'active'}));
  checked(await admin.from('experiences').insert({id:experienceId,merchant_profile_id:merchantId,slug:'synthetic-'+experienceId,title:'Synthetic pilot measurement experience',summary:'Synthetic only',city:'Kyoto',price_amount:0,currency:'HKD',status:'published',published_at:new Date().toISOString()}));
  const base={flowId,guideId,sessionId},events=[
   [null,{...base,phase:'guide_viewed',requestId:flowId}],
   [null,{...base,phase:'started',requestId:flowId}],
   [owner.id,{...base,tripId:created.id,phase:'confirmed',requestId}],
   [owner.id,{...base,tripId:created.id,phase:'adopted',requestId,revision:adopted.revision}],
   [owner.id,{tripId:created.id,sessionId,phase:'edited',requestId:editId,revision:edited.revision}],
   [owner.id,{tripId:created.id,sessionId,phase:'read',requestId:randomUUID(),revision:edited.revision}],
   [owner.id,{tripId:created.id,sessionId:otherSession,phase:'reopen_attempt',requestId:otherSession}],
   [owner.id,{tripId:created.id,sessionId:otherSession,phase:'reopened',requestId:otherSession,revision:edited.revision}],
  ];
  const calls=events.flatMap(([actor,event])=>[1,2].map(()=>`SELECT public.record_kinnso_pilot_event(${actor?`'${actor}'`:'null'},'${JSON.stringify(event)}'::jsonb);`)).join('\n');
  const referrals=['experience_referral','merchant_referral'].map(phase=>`SELECT public.record_kinnso_pilot_event(null,'${JSON.stringify({...base,phase,experienceId,requestId:flowId})}'::jsonb);`).join('\n');
  const reusedSession=randomUUID(),yesterday=randomUUID(),today=randomUUID();
  const oldEvents=['reopen_attempt','reopened'].map(phase=>`SELECT public.record_kinnso_pilot_event('${owner.id}','${JSON.stringify({phase,tripId:created.id,sessionId:reusedSession,requestId:yesterday,...phase==='reopened'?{revision:edited.revision}:{}})}'::jsonb);`).join('\n');
  const failedToday=`SELECT public.record_kinnso_pilot_event('${owner.id}','${JSON.stringify({phase:'reopen_attempt',tripId:created.id,sessionId:reusedSession,requestId:today})}'::jsonb);`;
  const session=checked(await owner.client.auth.getSession()).session;
  const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
  const historical=`INSERT INTO public.kinnso_ops_members(user_id,status,display_name) VALUES('${owner.id}','active','Synthetic transaction-only operator');
DO $claims$ BEGIN PERFORM set_config('request.jwt.claims','${JSON.stringify(claims).replaceAll("'","''")}',true); END $claims$;
SET LOCAL ROLE authenticated;
SELECT json_build_object('historicalPilot',public.get_kinnso_pilot_metrics((now() at time zone 'UTC')::date-30));
RESET ROLE;`;
  const script=`BEGIN;\nSET LOCAL statement_timeout='15s';\nSET LOCAL ROLE service_role;\n${calls}\n${referrals}\n${oldEvents}\nRESET ROLE;\nUPDATE kinnso_internal.pilot_events SET recorded_at=recorded_at-interval '1 day' WHERE request_id='${yesterday}';\nSET LOCAL ROLE service_role;\n${failedToday}\nRESET ROLE;\nSELECT kinnso_internal.pilot_metrics((now() at time zone 'UTC')::date);\n${historical}\nSELECT json_build_object('anonIngest',has_function_privilege('anon','public.record_kinnso_pilot_event(uuid,jsonb)','EXECUTE'),'authIngest',has_function_privilege('authenticated','public.record_kinnso_pilot_event(uuid,jsonb)','EXECUTE'),'anonTable',has_table_privilege('anon','kinnso_internal.pilot_events','SELECT'),'authTable',has_table_privilege('authenticated','kinnso_internal.pilot_events','SELECT'));\nROLLBACK;\n`;
  const output=execFileSync('docker',['exec','-i',process.env.KINNSO_TEST_DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:script,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  const rows=output.trim().split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  const report=rows.at(-3),permissions=rows.at(-1);
  assert.deepEqual(rows.at(-2),{historicalPilot:null},'retention limits must not fail the pre-existing historical monitoring response');
  assert.equal(report.adoptionAttempts,1);assert.equal(report.adoptions,1);assert.equal(report.adoptionSuccessRate,1);
  assert.equal(report.firstCompletions,1);assert.equal(report.firstCompletionP50Ms,0);
  assert.equal(report.reopenAttempts,2);assert.equal(report.reopens,1);assert.equal(report.reopenSuccessRate,.5);
  assert.equal(report.qualifiedGuideViews,1);assert.equal(report.experienceReferrals,1);assert.equal(report.merchantReferrals,1);assert.equal(report.merchantReferralRate,1);
  assert.deepEqual(permissions,{anonIngest:false,authIngest:false,anonTable:false,authTable:false});
 }finally{
  assert.equal((await admin.from('experiences').delete().eq('id',experienceId).eq('merchant_profile_id',merchantId)).error,null);
  assert.equal((await admin.from('merchant_profiles').delete().eq('id',merchantId)).error,null);
  await f.cleanup();
 }
});
