import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fixture,admin,anonymous} from './local-fixtures.mjs';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
const ok=async promise=>{const r=await promise;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const target=verifyTestTarget();
function sql(input){const container=JSON.parse(execFileSync('docker',['inspect',target.dbContainer],{encoding:'utf8'}))[0];assert.equal(container.Config.Labels['com.supabase.cli.project'],target.projectRef);return execFileSync('docker',['exec','-i',target.dbContainer,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8'});}
async function setup(){
 const f=await fixture(),creator=await f.actor(true),other=await f.actor(true),owner=await f.actor(true);
 const merchant=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic collaboration merchant',contact_email:'synthetic@example.test'}).select('id').single())).id;
 async function mission(patch={}){
  const row=await ok(admin.from('missions').insert({merchant_profile_id:merchant,title:'Synthetic authored campaign',summary:'Local isolated collaboration contract',mission_source:'merchant',mission_type:'coupon_affiliate',visibility:'open',status:'published',...patch}).select('id').single());
  const milestone=patch.mission_type==='receipt_cashback'?(await ok(admin.from('mission_milestones').select('id').eq('mission_id',row.id).single())).id:(await ok(admin.from('mission_milestones').insert({mission_id:row.id,title:'Author one original route',description:'Provide a link to your authored work.'}).select('id').single())).id;
  return{id:row.id,milestone};
 }
 const command=(actor,id,payload,requestId=randomUUID())=>actor.client.rpc('apply_kinnso_creator_mission_command',{p_mission_id:id,p_request_id:requestId,p_command:payload});
 const detail=(actor,id)=>ok(actor.client.rpc('get_kinnso_creator_mission',{p_mission_id:id}));
 async function cleanup(){await ok(admin.from('merchant_profiles').delete().eq('id',merchant));await f.cleanup();}
 return{f,creator,other,owner,merchant,mission,command,detail,cleanup};
}
const evidence=milestoneId=>({type:'submitEvidence',milestoneId,submissionId:null,expectedUpdatedAt:null,proofUrls:['https://example.test/original-route'],notes:'My original route, manually reviewed.'});

test('creator can discover, join, submit, revise and keep accepted work after closure without duplicate evidence or a fee',async()=>{
 const s=await setup();try{
  const m=await s.mission(),args={type:'join',applicationNote:'I authored the local route.'},requestId=randomUUID();
  const available=await ok(s.creator.client.rpc('list_kinnso_creator_missions'));assert.ok(available.items.some(x=>x.id===m.id));
  const joined=await ok(s.command(s.creator,m.id,args,requestId));assert.equal(joined.status,'active');assert.deepEqual(await ok(s.command(s.creator,m.id,args,requestId)),joined);
  assert.equal((await s.command(s.creator,m.id,{...args,applicationNote:'Changed'},requestId)).error?.message,'idempotency_conflict');
  assert.equal((await s.command(s.other,m.id,{type:'join'})).error,null);
  assert.equal((await s.command(s.owner,m.id,{type:'join'})).error?.message,'forbidden');
  const first=evidence(m.milestone),submissionRequest=randomUUID();
  const submitted=await ok(s.command(s.creator,m.id,first,submissionRequest));assert.deepEqual(await ok(s.command(s.creator,m.id,first,submissionRequest)),submitted);
  assert.equal((await s.command(s.creator,m.id,first)).error?.message,'revision_conflict');
  assert.equal((await s.detail(s.other,m.id)).submissions.length,0);
  await ok(admin.from('mission_milestone_submissions').update({status:'revision_requested',merchant_feedback:'Please add the visit date.'}).eq('id',submitted.id));
  await ok(admin.from('mission_review_events').insert({submission_id:submitted.id,actor_type:'merchant',actor_id:s.owner.id,action:'request_revision',reason_category:'other',reason_text:'Please add the visit date.'}));
  const current=await s.detail(s.creator,m.id),saved=current.submissions[0];assert.equal(saved.reviews[0].reason,'Please add the visit date.');
  assert.notEqual(saved.updatedAt,submitted.updatedAt);
  const revision={...first,submissionId:saved.id,expectedUpdatedAt:submitted.updatedAt,notes:'Visited in October.'};
  assert.equal((await s.command(s.creator,m.id,revision)).error?.message,'revision_conflict');
  await ok(admin.from('missions').update({status:'paused'}).eq('id',m.id));
  const third=await s.f.actor(true);assert.equal((await s.command(third,m.id,{type:'join'})).error?.message,'invalid_mission_unavailable');
  const revised=await ok(s.command(s.creator,m.id,{...revision,expectedUpdatedAt:saved.updatedAt}));assert.equal(revised.status,'submitted');
  await ok(admin.from('mission_milestone_submissions').update({status:'approved'}).eq('id',saved.id));
  assert.equal((await s.command(s.creator,m.id,{...revision,expectedUpdatedAt:revised.updatedAt})).error?.message,'revision_conflict');
  assert.equal((await ok(admin.from('mission_settlements').select('id').eq('mission_id',m.id))).length,0);
  assert.equal((await ok(s.creator.client.rpc('list_kinnso_creator_missions',{p_scope:'mine'}))).items[0].status,'paused');
 }finally{await s.cleanup();}
});

test('mission discovery and commands enforce targeted visibility, tier, current role and exact invitation consent',async()=>{
 const s=await setup();try{
  const targeted=await s.mission({visibility:'targeted'}),gated=await s.mission({min_tier:'elite'});
  assert.equal((await s.creator.client.rpc('get_kinnso_creator_mission',{p_mission_id:targeted.id})).error?.message,'mission_not_found');
  assert.equal((await s.command(s.creator,targeted.id,{type:'join'})).error?.message,'mission_not_found');
  assert.equal((await s.command(s.creator,gated.id,{type:'join'})).error?.message,'invalid_creator_tier');
  const invited=await ok(admin.from('mission_participants').insert({mission_id:targeted.id,creator_id:s.creator.id,status:'invited',source:'merchant_invite'}).select('id,updated_at').single());
  assert.equal((await s.detail(s.creator,targeted.id)).participant.status,'invited');
  assert.equal((await s.command(s.creator,targeted.id,evidence(targeted.milestone))).error?.message,'forbidden');
  const accept={type:'acceptInvite',expectedUpdatedAt:invited.updated_at},requestId=randomUUID();
  const accepted=await ok(s.command(s.creator,targeted.id,accept,requestId));assert.equal(accepted.status,'active');
  await ok(admin.from('creators').update({status:'suspended'}).eq('id',s.creator.id));
  assert.equal((await s.command(s.creator,targeted.id,accept,requestId)).error?.message,'creator_required');
  assert.equal((await s.creator.client.rpc('list_kinnso_creator_missions')).error?.message,'creator_required');
  assert.equal((await anonymous.rpc('list_kinnso_creator_missions')).error?.code,'42501');
 }finally{await s.cleanup();}
});

test('paid applications can be withdrawn and concurrent first submissions cannot overwrite another result',async()=>{
 const s=await setup();try{
  const paid=await s.mission({mission_type:'paid',paid_fee_amount:0,paid_fee_currency:'HKD'});
  const applied=await ok(s.command(s.creator,paid.id,{type:'join',applicationNote:'Review my portfolio.'}));assert.equal(applied.status,'applied');
  const cancelled=await ok(s.command(s.creator,paid.id,{type:'withdrawApplication',expectedUpdatedAt:applied.updatedAt}));assert.equal(cancelled.status,'cancelled');
  assert.equal((await s.command(s.creator,paid.id,{type:'acceptInvite',expectedUpdatedAt:cancelled.updatedAt})).error?.message,'revision_conflict');
  const m=await s.mission();const joins=await Promise.all([1,2].map(()=>s.command(s.creator,m.id,{type:'join'})));assert.equal(joins.filter(r=>!r.error).length,1);
  const writes=await Promise.all([1,2].map(()=>s.command(s.creator,m.id,evidence(m.milestone))));assert.equal(writes.filter(r=>!r.error).length,1);assert.equal((await s.detail(s.creator,m.id)).submissions.length,1);
  const submission=(await s.detail(s.creator,m.id)).submissions[0];
  assert.equal((await s.command(s.other,m.id,{...evidence(m.milestone),submissionId:submission.id,expectedUpdatedAt:submission.updatedAt})).error?.message,'forbidden');
  assert.ok((await s.command(s.creator,m.id,{...evidence(m.milestone),proofUrls:['javascript:alert(1)']})).error);
  assert.ok((await s.command(s.creator,m.id,{...evidence(m.milestone),merchant_feedback:'Tamper'})).error);
 }finally{await s.cleanup();}
});

test('authored coupon content requires merchant approval and old raw participant paths cannot self-approve',async()=>{
 const s=await setup();try{
  const m=await s.mission({kinnso_requires_application:true});
  assert.equal((await s.detail(s.creator,m.id)).requiresApplication,true);
  const raw=await s.creator.client.from('mission_participants').insert({mission_id:m.id,creator_id:s.creator.id,status:'active',source:'open_join'});assert.ok(raw.error);
  const applied=await ok(s.command(s.creator,m.id,{type:'join'}));assert.equal(applied.status,'applied');
  // A dual-role creator can satisfy the mature ops UPDATE policy. The trigger must
  // still forbid self-approval instead of relying solely on ordinary creator RLS.
  await ok(admin.from('kinnso_ops_members').insert({user_id:s.creator.id,display_name:'Synthetic dual-role creator',role:'moderator'}));
  assert.equal((await s.creator.client.from('mission_participants').update({status:'active'}).eq('id',applied.id)).error?.message,'forbidden');
  assert.equal((await s.creator.client.from('mission_participants').update({source:'merchant_invite',status:'invited'}).eq('id',applied.id)).error?.message,'forbidden');
  assert.equal((await s.command(s.creator,m.id,evidence(m.milestone))).error?.message,'forbidden');
  await ok(admin.from('mission_participants').update({status:'active'}).eq('id',applied.id));
  assert.equal((await ok(s.command(s.creator,m.id,evidence(m.milestone)))).status,'submitted');
  await ok(admin.from('kinnso_ops_members').delete().eq('user_id',s.creator.id));
 }finally{await s.cleanup();}
});

test('native application decisions and invitations notify only their creator once and never enqueue external delivery',async()=>{
 const s=await setup(),provider='synthetic-collaboration-'+randomUUID();let channelInstalled=false;try{
  const m=await s.mission({kinnso_requires_application:true}),joined=await ok(s.command(s.creator,m.id,{type:'join'}));
  const decision={type:'reviewApplication',id:joined.id,expectedUpdatedAt:joined.updatedAt,action:'approve',note:'Your original route fits this brief.',reason:'Synthetic isolated review'},requestId=randomUUID();
  const args={p_merchant_id:s.merchant,p_request_id:requestId,p_command:decision};
  await ok(s.owner.client.rpc('apply_kinnso_merchant_campaign_command',args));await ok(s.owner.client.rpc('apply_kinnso_merchant_campaign_command',args));
  const notifications=await ok(s.creator.client.from('notifications').select('id,notification_type,entity_id,payload').eq('entity_id',m.id));
  assert.equal(notifications.length,1);assert.equal(notifications[0].notification_type,'collaboration.application_approved');assert.equal(notifications[0].payload.mission_title,'Synthetic authored campaign');
  assert.deepEqual(await ok(s.other.client.from('notifications').select('id').eq('entity_id',m.id)),[]);
  // Updating an already-reviewed record is not another decision event.
  await ok(admin.from('mission_participants').update({application_note:'Updated authored note'}).eq('id',joined.id));
  assert.equal((await ok(s.creator.client.from('notifications').select('id').eq('entity_id',m.id))).length,1);
  const invited=await s.mission({kinnso_requires_application:true,visibility:'targeted'});
  await ok(admin.from('mission_participants').insert({mission_id:invited.id,creator_id:s.other.id,status:'invited',source:'merchant_invite'}));
  assert.equal((await ok(s.other.client.from('notifications').select('notification_type').eq('entity_id',invited.id)))[0].notification_type,'collaboration.invited');
  // The public inbox consumes these events. The local queue check below invokes no provider or send command.
  const inbox=await ok(s.creator.client.rpc('get_kinnso_inbox'));assert.ok(inbox.items.some(x=>x.id===notifications[0].id));
  assert.equal(sql('select count(*) from kinnso_internal.delivery_channels;').trim(),'0');
  sql(`insert into kinnso_internal.delivery_channels(channel,provider,template_version,approved)values('email','${provider}','fixture-v1',true);`);channelInstalled=true;
  for(const actor of [s.creator,s.other])await ok(actor.client.rpc('apply_kinnso_inbox_command',{p_request_id:randomUUID(),p_command:{type:'setPreference',channel:'email',enabled:true}}));
  assert.equal(await ok(admin.rpc('queue_kinnso_notification_delivery')),0,'Native collaboration events must remain in-app even with an approved channel and opted-in recipients');
  assert.equal(sql(`select count(*) from kinnso_internal.notification_outbox where recipient_id in ('${s.creator.id}','${s.other.id}');`).trim(),'0');
 }finally{if(channelInstalled)sql(`delete from kinnso_internal.delivery_channels where provider='${provider}';`);await s.cleanup();}
});

test('repeatable receipt requests replay once and cap enforcement also covers revision resubmission',async()=>{
 const s=await setup();try{
  const m=await s.mission({mission_type:'receipt_cashback',max_receipts_per_creator:1,paid_fee_amount:0,paid_fee_currency:'HKD'});
  const applied=await ok(s.command(s.creator,m.id,{type:'join'}));await ok(admin.from('mission_participants').update({status:'active'}).eq('id',applied.id));
  const requestId=randomUUID(),first=await ok(s.command(s.creator,m.id,evidence(m.milestone),requestId));assert.deepEqual(await ok(s.command(s.creator,m.id,evidence(m.milestone),requestId)),first);
  assert.ok((await s.command(s.creator,m.id,evidence(m.milestone))).error);
  await ok(admin.from('mission_milestone_submissions').update({status:'revision_requested'}).eq('id',first.id));
  const current=(await s.detail(s.creator,m.id)).submissions[0];await ok(s.command(s.creator,m.id,evidence(m.milestone)));
  assert.equal((await s.command(s.creator,m.id,{...evidence(m.milestone),submissionId:first.id,expectedUpdatedAt:current.updatedAt})).error?.message,'invalid_receipt_cap');
 }finally{await s.cleanup();}
});

test('creator earnings keep exact currency totals, exclude other creators and paginate historical rows',async()=>{
 const s=await setup();try{
  const expected={HKD:0,USD:0};
  for(let i=0;i<32;i++){
   const m=await s.mission(),participant=await ok(s.command(s.creator,m.id,{type:'join'})),currency=i%2?'USD':'HKD';expected[currency]++;
   await ok(admin.from('mission_settlements').insert({mission_id:m.id,mission_participant_id:participant.id,status:'pending',amount_currency:currency,paid_fee_amount:'0.10',creator_payout_status:'pending'}));
  }
  const foreign=await s.mission(),participant=await ok(s.command(s.other,foreign.id,{type:'join'}));
  await ok(admin.from('mission_settlements').insert({mission_id:foreign.id,mission_participant_id:participant.id,status:'pending',amount_currency:'HKD',paid_fee_amount:'999.00',creator_payout_status:'pending'}));
  const first=await ok(s.creator.client.rpc('get_kinnso_creator_earnings'));assert.equal(first.items.length,30);assert.ok(first.nextCursor);
  assert.deepEqual(first.totals.map(x=>[x.currency,x.pending]),[['HKD','1.60'],['USD','1.60']]);
  const second=await ok(s.creator.client.rpc('get_kinnso_creator_earnings',{p_after:first.nextCursor}));assert.equal(second.items.length,2);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,32);
  assert.ok(first.items.every(x=>typeof x.amount==='string'&&x.status==='pending'));
  const tracked=await ok(s.creator.client.rpc('get_kinnso_creator_earnings',{p_section:'tracked'}));assert.equal(tracked.items.length,0);assert.deepEqual(tracked.totals,first.totals);
  const batches=await ok(s.creator.client.rpc('get_kinnso_creator_earnings',{p_section:'payouts'}));assert.deepEqual(batches.items,[]);
 }finally{await s.cleanup();}
});
