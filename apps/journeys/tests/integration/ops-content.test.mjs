import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {fixture,admin} from './local-fixtures.mjs';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

const uuidValue=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function purgeContentFixtures(ids){
 const values=[...new Set(ids)].filter(id=>uuidValue.test(id));
 if(!values.length)return;
 const list=values.map(id=>`'${id}'`).join(',');
 const {dbContainer}=verifyTestTarget();
 execFileSync('docker',['exec',dbContainer,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',
  `delete from public.ops_audit_log where entity_id in (${list}) or actor_ops_member_id in (${list});
   delete from public.community_sessions where id in (${list}) or host_creator_id in (${list});
   delete from public.partner_perks where id in (${list});
   delete from public.testimonials where id in (${list});
   delete from public.kinnso_ops_members where id in (${list});`],
 {stdio:'ignore',timeout:15000,windowsHide:true});
}

const ok=async promise=>{const result=await promise;assert.equal(result.error,null,JSON.stringify(result.error));return result.data;};

function verifyReceiptUpgrade(host, operator, other) {
 const root=new URL('../../../../supabase/migrations/',import.meta.url);
 const legacy=readFileSync(new URL('20261107020000_kinnso_ops_content_audit.sql',root),'utf8');
 const functions=['admin_create_partner_perk','admin_create_community_session'].map(name=>{
  const start=legacy.indexOf('create or replace function public.'+name+'(');
  return legacy.slice(start,legacy.indexOf('revoke all on function',start));
 }).join('\n');
 const receipt=readFileSync(new URL('20261108131500_ops_perk_create_receipts.sql',root),'utf8');
 const upgrade=new URL('20261108133000_ops_content_receipt_upgrade.sql',root);
 const perk=randomUUID(),session=randomUUID();
 const claims=async actor=>{
  const {session}=await ok(actor.client.auth.getSession());
  const payload=Buffer.from(session.access_token.split('.')[1],'base64url').toString();
  return "select set_config('request.jwt.claims', '"+payload.replaceAll("'","''")+"', true);";
 };
 return Promise.all([claims(operator),claims(other)]).then(([owner,foreign])=>{
  const perkCall=(title='Legacy perk')=>"public.admin_create_partner_perk('"+perk+"','Partner','"+title+"','Summary','travel','10%',null,'code','LEGACY',0,false)";
  const sessionCall=(title='Legacy session')=>"public.admin_create_community_session('"+session+"','"+host.id+"','"+title+"','Description','destination_briefing','2026-12-20T10:00:00Z',45,'https://www.youtube.com/watch?v=KinnsoSynthetic1')";
  const conflict=(call,message)=>"begin perform "+call+"; raise exception 'expected conflict'; exception when unique_violation then if sqlerrm <> '"+message+"' then raise; end if; end;";
  const script=`begin;
${functions}
${owner}
set local role authenticated;
select ${perkCall()}, ${sessionCall()};
select public.admin_set_partner_perk_active('${perk}',true);
select public.admin_set_community_session_status('${session}','live');
reset role;
do $$ begin
 if exists (select from kinnso_internal.requests where request_id in ('${perk}','${session}'))
 then raise exception 'legacy fixture unexpectedly has a receipt'; end if;
end $$;
${receipt}
${readFileSync(upgrade,'utf8')}
${foreign}
set local role authenticated;
do $$ begin
 ${conflict(perkCall(),'perk_conflict')}
 ${conflict(sessionCall(),'session_conflict')}
end $$;
${owner}
do $$ begin
 ${conflict(perkCall('Changed'),'perk_conflict')}
 ${conflict(sessionCall('Changed'),'session_conflict')}
 if ${perkCall()} is distinct from jsonb_build_object('id','${perk}'::uuid,'active',false) then raise exception 'wrong original perk result'; end if;
 if ${sessionCall()} is distinct from jsonb_build_object('id','${session}'::uuid,'status','scheduled') then raise exception 'wrong original session result'; end if;
 ${conflict(perkCall('Changed'),'request_id_reused')}
 ${conflict(sessionCall('Changed'),'request_id_reused')}
end $$;
reset role;
do $$ begin
 if (select count(*) from kinnso_internal.requests where actor_id='${operator.id}' and request_id in ('${perk}','${session}')) <> 2
 or (select count(*) from public.ops_audit_log where entity_id in ('${perk}','${session}') and action in ('perk.create','session.create')) <> 2
 or (select count(*) from public.partner_perks where id='${perk}' and active) <> 1
 or (select count(*) from public.community_sessions where id='${session}' and status='live') <> 1
 then raise exception 'upgrade mutated history or missed receipts'; end if;
end $$;
rollback;`;
  const {dbContainer}=verifyTestTarget();
  execFileSync('docker',['exec','-i',dbContainer,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],
   {input:script,stdio:['pipe','ignore','pipe'],timeout:30000,windowsHide:true});
 });
}

test('audited content RPCs are idempotent, concurrency-safe and not bypassable by direct operations writes',async()=>{
 const f=await fixture(),memberIds=[],entityIds=[];
 try{
  const host=await f.actor(true),operator=await f.actor(),analyst=await f.actor(),runId=randomUUID();
  for(const [actor,role] of [[operator,'admin'],[analyst,'analyst']]){
   memberIds.push((await ok(admin.from('kinnso_ops_members').insert({user_id:actor.id,display_name:`Synthetic content ${role} ${runId}`,role,status:'active'}).select('id').single())).id);
  }

  const sessionId=randomUUID(),sessionArgs={p_request_id:sessionId,p_host_creator_id:host.id,p_title:`Synthetic session ${runId}`,p_description:'Synthetic isolated content RPC.',p_type:'destination_briefing',p_starts_at:'2026-12-20T10:00:00.000Z',p_duration_minutes:45,p_embed_url:'https://www.youtube.com/watch?v=KinnsoSynthetic1',p_replay_url:null,p_destination_tags:['Tokyo','Cafés']};
  const sessions=await Promise.all([operator.client.rpc('admin_create_community_session',sessionArgs),operator.client.rpc('admin_create_community_session',sessionArgs)]);
  assert.ok(sessions.every(result=>!result.error),JSON.stringify(sessions));assert.deepEqual(sessions[0].data,sessions[1].data);entityIds.push(sessionId);

  const perkId=randomUUID(),perkArgs={p_request_id:perkId,p_partner_name:'Synthetic Partner',p_title:`Synthetic perk ${runId}`,p_summary:'Synthetic isolated perk.',p_category:'travel',p_discount_label:'10%',p_min_tier:'rising',p_redemption_type:'code',p_redemption_value:'SYNTHETIC-RPC',p_sort_order:1,p_active:false};
  entityIds.push(perkId);
  const {session:authSession}=await ok(operator.client.auth.getSession());
  assert.ok(authSession?.access_token);
  const secondConnection=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{
   auth:{persistSession:false},global:{headers:{Authorization:'Bearer '+authSession.access_token}},
  });
  const perks=await Promise.all([operator.client.rpc('admin_create_partner_perk',perkArgs),secondConnection.rpc('admin_create_partner_perk',{...perkArgs,p_title:' '+perkArgs.p_title+' '})]);
  assert.ok(perks.every(result=>!result.error),JSON.stringify(perks));assert.deepEqual(perks[0].data,perks[1].data);assert.deepEqual(perks[0].data,{id:perkId,active:false});

  const testimonialId=randomUUID(),testimonialArgs={p_request_id:testimonialId,p_quote:`Synthetic testimonial ${runId}`,p_author_name:'Synthetic Author',p_author_role:'creator',p_content_locale:'en',p_sort_order:2};
  const testimonials=await Promise.all([operator.client.rpc('admin_create_testimonial',testimonialArgs),operator.client.rpc('admin_create_testimonial',testimonialArgs)]);
  assert.ok(testimonials.every(result=>!result.error),JSON.stringify(testimonials));assert.deepEqual(testimonials[0].data,testimonials[1].data);entityIds.push(testimonialId);

  for(const call of [
   [operator.client.rpc('admin_set_community_session_status',{p_id:sessionId,p_status:'live'}),operator.client.rpc('admin_set_community_session_status',{p_id:sessionId,p_status:'live'})],
   [operator.client.rpc('admin_set_partner_perk_active',{p_id:perkId,p_active:true}),operator.client.rpc('admin_set_partner_perk_active',{p_id:perkId,p_active:true})],
   [operator.client.rpc('admin_set_testimonial_status',{p_id:testimonialId,p_status:'published'}),operator.client.rpc('admin_set_testimonial_status',{p_id:testimonialId,p_status:'published'})],
  ]){const results=await Promise.all(call);assert.ok(results.every(result=>!result.error),JSON.stringify(results));assert.deepEqual(results[0].data,results[1].data);}

  assert.deepEqual(await ok(secondConnection.rpc('admin_create_partner_perk',perkArgs)),{id:perkId,active:false});
  const changed=await secondConnection.rpc('admin_create_partner_perk',{...perkArgs,p_title:'Changed title'});
  assert.equal(changed.error?.message,'request_id_reused');
  assert.equal((await ok(admin.from('partner_perks').select('id,active').eq('id',perkId))).length,1);

  const audit=await ok(admin.from('ops_audit_log').select('entity_id,action').in('entity_id',entityIds));
  assert.deepEqual(audit.filter(row=>row.entity_id===sessionId).map(row=>row.action).sort(),['session.create','session.status.live']);
  assert.deepEqual(audit.filter(row=>row.entity_id===perkId).map(row=>row.action).sort(),['perk.active.true','perk.create']);
  assert.deepEqual(audit.filter(row=>row.entity_id===testimonialId).map(row=>row.action).sort(),['testimonial.create','testimonial.status.published']);

  assert.equal((await analyst.client.rpc('admin_set_community_session_status',{p_id:sessionId,p_status:'ended'})).error?.message,'forbidden');
  assert.equal((await analyst.client.rpc('admin_set_partner_perk_active',{p_id:perkId,p_active:false})).error?.message,'forbidden');
  assert.equal((await analyst.client.rpc('admin_set_testimonial_status',{p_id:testimonialId,p_status:'draft'})).error?.message,'forbidden');

  const directSessionId=randomUUID();entityIds.push(directSessionId);
  const directSession=await operator.client.from('community_sessions').insert({id:directSessionId,slug:'synthetic-direct-bypass',host_creator_id:host.id,title:'Synthetic direct bypass',description:'Must fail',type:'destination_briefing',starts_at:'2026-12-21T10:00:00.000Z',duration_minutes:30,status:'scheduled'});
  assert.ok(directSession.error,'operations direct session writes must be denied');
  const directPerk=await operator.client.from('partner_perks').update({active:false}).eq('id',perkId);
  assert.ok(directPerk.error,'operations direct perk writes must be denied');
  const directTestimonial=await operator.client.from('testimonials').update({status:'draft'}).eq('id',testimonialId);
  assert.ok(directTestimonial.error,'operations direct testimonial writes must be denied');

  await ok(admin.from('kinnso_ops_members').update({role:'moderator'}).eq('user_id',analyst.id));
  await verifyReceiptUpgrade(host,operator,analyst);
  const foreignReplay=await analyst.client.rpc('admin_create_partner_perk',perkArgs);
  assert.equal(foreignReplay.error?.message,'perk_conflict');
  assert.equal((await ok(admin.from('ops_audit_log').select('id').eq('entity_id',perkId).eq('action','perk.create'))).length,1);
 }finally{
  purgeContentFixtures([...entityIds,...memberIds,...f.actorIds()]);
  await f.cleanup();
 }
});
