import{test}from'node:test';import assert from'node:assert/strict';import{randomUUID}from'node:crypto';import{execFileSync}from'node:child_process';
import{fixture,admin}from'./local-fixtures.mjs';import{verifyTestTarget}from'../../scripts/verify-test-target.mjs';
const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const target=verifyTestTarget();function sql(input){const container=JSON.parse(execFileSync('docker',['inspect',target.dbContainer],{encoding:'utf8'}))[0];assert.equal(container.Config.Labels['com.supabase.cli.project'],target.projectRef);return execFileSync('docker',['exec','-i',target.dbContainer,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8'});}
test('inbox ownership, replay, linked support ownership and revocation preserve the mature notification contract',async()=>{
 const f=await fixture();let opsId;try{
  const a=await f.actor(true),b=await f.actor(true),operator=await f.actor();opsId=operator.id;await ok(admin.from('kinnso_ops_members').insert({user_id:opsId,display_name:'Synthetic support operator',role:'admin'}));
  const id=randomUUID();await ok(admin.from('notifications').insert({id,creator_id:a.id,notification_type:'submission.revision_requested',entity_type:'mission',entity_id:randomUUID(),payload:{mission_title:'Authored event',secret:'must not project'}}));
  const mine=await ok(a.client.rpc('get_kinnso_inbox'));assert.equal(mine.unreadCount,1);assert.equal(mine.items[0].payload.secret,undefined);assert.equal((await ok(b.client.rpc('get_kinnso_inbox'))).items.length,0);
  assert.equal((await b.client.rpc('apply_kinnso_inbox_command',{p_request_id:randomUUID(),p_command:{type:'markRead',id}})).error?.message,'notification_not_found');
  const read={p_request_id:randomUUID(),p_command:{type:'markRead',id}};await ok(a.client.rpc('apply_kinnso_inbox_command',read));await ok(a.client.rpc('apply_kinnso_inbox_command',read));assert.equal((await ok(a.client.rpc('get_kinnso_inbox'))).unreadCount,0);
  await ok(admin.from('creators').update({status:'suspended'}).eq('id',a.id));assert.equal((await a.client.rpc('apply_kinnso_inbox_command',read)).error?.message,'notification_not_found');await ok(admin.from('creators').update({status:'active'}).eq('id',a.id));
  const create={p_request_id:randomUUID(),p_command:{type:'create',id:randomUUID(),subject:'A real support case',message:'Please review this explicit fixture',linkedEventId:id}};
  assert.equal((await b.client.rpc('apply_kinnso_support_command',create)).error?.message,'forbidden');const created=await ok(a.client.rpc('apply_kinnso_support_command',create));assert.deepEqual(await ok(a.client.rpc('apply_kinnso_support_command',create)),created);
  assert.equal((await ok(b.client.rpc('get_kinnso_support'))).items.length,0);assert.equal((await b.client.rpc('get_kinnso_support',{p_ops:true})).error?.message,'forbidden');
  // Other concurrent fixtures may precede this case in the global Ops keyset.
  let after=null,queuedCase;
  do{const queue=await ok(operator.client.rpc('get_kinnso_support',{p_ops:true,p_after:after}));queuedCase=queue.items.find(item=>item.id===created.id);after=queue.nextCursor;}while(after&&!queuedCase);
  assert.ok(queuedCase,'The owned support case must be reachable in the Ops keyset');assert.equal(queuedCase.linkedEventId,id);assert.equal(queuedCase.messages[0].message,create.p_command.message);
  const review={p_request_id:randomUUID(),p_command:{type:'review',id:created.id,expectedRevision:1,ownerId:opsId,status:'waiting_customer',reason:'Synthetic internal decision audit',message:'Please provide the date of the activity.'}};
  assert.equal((await operator.client.rpc('apply_kinnso_support_command',{...review,p_command:{...review.p_command,message:null}})).error?.message,'invalid_response');await ok(operator.client.rpc('apply_kinnso_support_command',review));await ok(operator.client.rpc('apply_kinnso_support_command',review));
  const customerCase=(await ok(a.client.rpc('get_kinnso_support'))).items[0];assert.equal(customerCase.messages.at(-1).message,review.p_command.message);assert.equal(JSON.stringify(customerCase).includes(review.p_command.reason),false);
  assert.equal((await ok(a.client.rpc('get_kinnso_inbox'))).items.filter(x=>x.type==='support.updated').length,1);
  assert.equal((await operator.client.rpc('apply_kinnso_support_command',{...review,p_request_id:randomUUID()})).error?.message,'revision_conflict');
  await ok(a.client.rpc('apply_kinnso_support_command',{p_request_id:randomUUID(),p_command:{type:'reply',id:created.id,expectedRevision:2,message:'Requested details supplied'}}));
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('user_id',opsId));assert.equal((await operator.client.rpc('apply_kinnso_support_command',review)).error?.message,'forbidden');
  assert.equal((await operator.client.rpc('get_kinnso_support_messages',{p_case_id:created.id,p_ops:true})).error?.message,'forbidden');
  for(const table of ['support_cases','support_messages','support_audit','notification_outbox'])assert.ok((await a.client.schema('kinnso_internal').from(table).select('*')).error);
 }finally{if(opsId)await ok(admin.from('kinnso_ops_members').delete().eq('user_id',opsId));await f.cleanup();}
});
test('support history has bounded keyset continuation and concurrent distinct requests respect the actor quota',async()=>{
 const f=await fixture();try{
  const a=await f.actor(),b=await f.actor(),caseId=randomUUID();
  await ok(a.client.rpc('apply_kinnso_support_command',{p_request_id:randomUUID(),p_command:{type:'create',id:caseId,subject:'Bounded history',message:'First message'}}));
  for(let revision=1;revision<=24;revision++)await ok(a.client.rpc('apply_kinnso_support_command',{p_request_id:randomUUID(),p_command:{type:'reply',id:caseId,expectedRevision:revision,message:'History message '+revision}}));
  const preview=(await ok(a.client.rpc('get_kinnso_support'))).items[0];assert.equal(preview.messages.length,20);assert.ok(preview.messagesNextCursor);
  const older=await ok(a.client.rpc('get_kinnso_support_messages',{p_case_id:caseId,p_cursor:preview.messagesNextCursor}));assert.equal(older.items.length,5);assert.equal(older.nextCursor,null);assert.equal(new Set([...older.items,...preview.messages].map(x=>x.id)).size,25);assert.equal(older.items[0].message,'First message');
  assert.equal((await b.client.rpc('get_kinnso_support_messages',{p_case_id:caseId,p_cursor:preview.messagesNextCursor})).error?.message,'support_not_found');
  // Eight sequential creates bring this actor to nine; two simultaneous requests
  // must compete for one remaining slot, irrespective of their request IDs.
  for(let i=0;i<8;i++)await ok(a.client.rpc('apply_kinnso_support_command',{p_request_id:randomUUID(),p_command:{type:'create',id:randomUUID(),subject:'Quota fixture',message:'Synthetic quota fixture'}}));
  const concurrent=await Promise.all([1,2].map(()=>a.client.rpc('apply_kinnso_support_command',{p_request_id:randomUUID(),p_command:{type:'create',id:randomUUID(),subject:'Last quota slot',message:'Concurrent fixture'}})));
  assert.equal(concurrent.filter(x=>!x.error).length,1);assert.equal(concurrent.find(x=>x.error)?.error.message,'invalid_quota');assert.equal((await ok(a.client.rpc('get_kinnso_support'))).items.length,10);
 }finally{await f.cleanup();}
});
test('external delivery is post-commit, disabled by default, deduplicated, leased and dead-lettered without repeating business actions',async()=>{
 const f=await fixture();let id,opsId;try{
  assert.equal(sql('select count(*) from kinnso_internal.delivery_channels;').trim(),'0','fresh isolated channel fixture required');
  const a=await f.actor(true);id=randomUUID();await ok(admin.from('notifications').insert({id,creator_id:a.id,notification_type:'submission.approved',entity_type:'mission',entity_id:randomUUID(),payload:{mission_title:'Synthetic delivery'}}));
  assert.equal(await ok(admin.rpc('queue_kinnso_notification_delivery')),0);assert.equal((await ok(a.client.rpc('get_kinnso_inbox'))).items.length,1);
  assert.equal((await a.client.rpc('queue_kinnso_notification_delivery')).error?.code,'42501');
  await ok(a.client.rpc('apply_kinnso_inbox_command',{p_request_id:randomUUID(),p_command:{type:'setPreference',channel:'email',enabled:true}}));
  sql("insert into kinnso_internal.delivery_channels(channel,provider,template_version,approved)values('email','synthetic-sandbox','fixture-v1',true);");
  assert.equal(await ok(admin.rpc('queue_kinnso_notification_delivery')),1);assert.equal(await ok(admin.rpc('queue_kinnso_notification_delivery')),0);
  for(let i=1;i<=5;i++){
   if(i>1)sql(`update kinnso_internal.notification_outbox set next_attempt_at=now()where event_id='${id}';`);
   const claim=await ok(admin.rpc('claim_kinnso_notification_delivery'));assert.equal(claim.eventId,id);assert.equal(claim.attempts,i);assert.equal(await ok(admin.rpc('claim_kinnso_notification_delivery')),null);
   const authorize={p_id:claim.id,p_lease_token:claim.leaseToken,p_provider:claim.provider,p_template_version:claim.templateVersion};
   assert.equal((await a.client.rpc('authorize_kinnso_notification_send',authorize)).error?.code,'42501');assert.equal((await ok(admin.rpc('authorize_kinnso_notification_send',authorize))).authorized,true);assert.equal((await ok(admin.rpc('authorize_kinnso_notification_send',authorize))).state,'stale');
   const completion={p_id:claim.id,p_lease_token:claim.leaseToken,p_delivered:false,p_receipt:null};const finished=await ok(admin.rpc('finish_kinnso_notification_delivery',completion));assert.equal(finished.state,i===5?'dead_letter':'retry');assert.deepEqual(await ok(admin.rpc('finish_kinnso_notification_delivery',completion)),finished);
   assert.equal((await admin.rpc('finish_kinnso_notification_delivery',{...completion,p_delivered:true,p_receipt:'changed'})).error?.message,'idempotency_conflict');
  }
  assert.equal(await ok(admin.rpc('claim_kinnso_notification_delivery')),null);assert.equal((await ok(a.client.rpc('get_kinnso_inbox'))).items.length,1);
  assert.equal((await a.client.rpc('get_kinnso_delivery_failures')).error?.message,'forbidden');
  const operator=await f.actor();opsId=operator.id;await ok(admin.from('kinnso_ops_members').insert({user_id:opsId,display_name:'Synthetic delivery operator',role:'admin'}));
  const failures=await ok(operator.client.rpc('get_kinnso_delivery_failures'));assert.equal(failures.items.length,1);const dead=failures.items[0];assert.equal(dead.eventId,id);assert.equal(dead.leaseToken,undefined);assert.equal(dead.providerReceipt,undefined);
  const retry={p_request_id:randomUUID(),p_id:dead.id,p_expected_revision:dead.revision,p_reason:'Provider incident resolved in synthetic fixture'};
  assert.equal((await a.client.rpc('retry_kinnso_notification_delivery',retry)).error?.message,'forbidden');assert.equal((await operator.client.rpc('retry_kinnso_notification_delivery',{...retry,p_expected_revision:dead.revision-1})).error?.message,'revision_conflict');
  const retried=await ok(operator.client.rpc('retry_kinnso_notification_delivery',retry));assert.deepEqual(await ok(operator.client.rpc('retry_kinnso_notification_delivery',retry)),retried);
  assert.equal((await operator.client.rpc('retry_kinnso_notification_delivery',{...retry,p_reason:'A different retry reason'})).error?.message,'idempotency_conflict');
  assert.equal(sql(`select count(*) from kinnso_internal.delivery_retry_audit where delivery_id='${dead.id}';`).trim(),'1');
  assert.throws(()=>sql(`update kinnso_internal.delivery_retry_audit set reason='Attempted audit rewrite' where delivery_id='${dead.id}';`),/immutable_audit/);
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('user_id',opsId));assert.equal((await operator.client.rpc('retry_kinnso_notification_delivery',retry)).error?.message,'forbidden');assert.equal((await operator.client.rpc('get_kinnso_delivery_failures')).error?.message,'forbidden');
  const claim=await ok(admin.rpc('claim_kinnso_notification_delivery'));assert.equal(claim.id,dead.id);assert.equal(claim.eventId,id);assert.equal(claim.attempts,1);
  await ok(admin.rpc('authorize_kinnso_notification_send',{p_id:claim.id,p_lease_token:claim.leaseToken,p_provider:claim.provider,p_template_version:claim.templateVersion}));
  const success={p_id:claim.id,p_lease_token:claim.leaseToken,p_delivered:true,p_receipt:'synthetic-completion'};const delivered=await ok(admin.rpc('finish_kinnso_notification_delivery',success));assert.equal(delivered.state,'delivered');assert.deepEqual(await ok(admin.rpc('finish_kinnso_notification_delivery',success)),delivered);
  assert.equal(await ok(admin.rpc('queue_kinnso_notification_delivery')),0);assert.equal((await ok(a.client.rpc('get_kinnso_inbox'))).items.length,1);
 }finally{if(id)await ok(admin.from('notifications').delete().eq('id',id));if(opsId)await ok(admin.from('kinnso_ops_members').delete().eq('user_id',opsId));sql("delete from kinnso_internal.delivery_channels where provider='synthetic-sandbox';");await f.cleanup();}
});
test('pre-send authorization suppresses claims after preference, creator or channel revocation',async()=>{
 const f=await fixture();const eventIds=[];try{
  assert.equal(sql('select count(*)from kinnso_internal.delivery_channels;').trim(),'0');
  sql("insert into kinnso_internal.delivery_channels(channel,provider,template_version,approved)values('email','synthetic-sandbox','fixture-v1',true);");
  for(const revoked of ['preference','creator','channel']){
   const a=await f.actor(true),id=randomUUID();eventIds.push(id);await ok(admin.from('notifications').insert({id,creator_id:a.id,notification_type:'submission.approved',entity_type:'mission',entity_id:randomUUID(),payload:{}}));
   await ok(a.client.rpc('apply_kinnso_inbox_command',{p_request_id:randomUUID(),p_command:{type:'setPreference',channel:'email',enabled:true}}));await ok(admin.rpc('queue_kinnso_notification_delivery'));const claim=await ok(admin.rpc('claim_kinnso_notification_delivery'));assert.equal(claim.eventId,id);
   if(revoked==='preference')await ok(a.client.rpc('apply_kinnso_inbox_command',{p_request_id:randomUUID(),p_command:{type:'setPreference',channel:'email',enabled:false}}));
   if(revoked==='creator')await ok(admin.from('creators').update({status:'suspended'}).eq('id',a.id));
   if(revoked==='channel')sql("update kinnso_internal.delivery_channels set approved=false where channel='email';");
   const authorization=await ok(admin.rpc('authorize_kinnso_notification_send',{p_id:claim.id,p_lease_token:claim.leaseToken,p_provider:claim.provider,p_template_version:claim.templateVersion}));assert.deepEqual(authorization,{authorized:false,state:'suppressed'});
   assert.equal((await admin.rpc('finish_kinnso_notification_delivery',{p_id:claim.id,p_lease_token:claim.leaseToken,p_delivered:true,p_receipt:'must-not-send'})).error?.message,'invalid_lease');
  }
 }finally{if(eventIds.length)await ok(admin.from('notifications').delete().in('id',eventIds));sql("delete from kinnso_internal.delivery_channels where provider='synthetic-sandbox';");await f.cleanup();}
});
