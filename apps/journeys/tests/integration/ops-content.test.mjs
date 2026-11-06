import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,admin} from './local-fixtures.mjs';

const ok=async promise=>{const result=await promise;assert.equal(result.error,null,JSON.stringify(result.error));return result.data;};

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
  const perks=await Promise.all([operator.client.rpc('admin_create_partner_perk',perkArgs),operator.client.rpc('admin_create_partner_perk',perkArgs)]);
  assert.ok(perks.every(result=>!result.error),JSON.stringify(perks));assert.deepEqual(perks[0].data,perks[1].data);entityIds.push(perkId);

  const testimonialId=randomUUID(),testimonialArgs={p_request_id:testimonialId,p_quote:`Synthetic testimonial ${runId}`,p_author_name:'Synthetic Author',p_author_role:'creator',p_content_locale:'en',p_sort_order:2};
  const testimonials=await Promise.all([operator.client.rpc('admin_create_testimonial',testimonialArgs),operator.client.rpc('admin_create_testimonial',testimonialArgs)]);
  assert.ok(testimonials.every(result=>!result.error),JSON.stringify(testimonials));assert.deepEqual(testimonials[0].data,testimonials[1].data);entityIds.push(testimonialId);

  for(const call of [
   [operator.client.rpc('admin_set_community_session_status',{p_id:sessionId,p_status:'live'}),operator.client.rpc('admin_set_community_session_status',{p_id:sessionId,p_status:'live'})],
   [operator.client.rpc('admin_set_partner_perk_active',{p_id:perkId,p_active:true}),operator.client.rpc('admin_set_partner_perk_active',{p_id:perkId,p_active:true})],
   [operator.client.rpc('admin_set_testimonial_status',{p_id:testimonialId,p_status:'published'}),operator.client.rpc('admin_set_testimonial_status',{p_id:testimonialId,p_status:'published'})],
  ]){const results=await Promise.all(call);assert.ok(results.every(result=>!result.error),JSON.stringify(results));assert.deepEqual(results[0].data,results[1].data);}

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
 }finally{
  if(entityIds.length){
   await admin.from('ops_audit_log').delete().in('entity_id',entityIds);
   await admin.from('community_sessions').delete().in('id',entityIds);
   await admin.from('partner_perks').delete().in('id',entityIds);
   await admin.from('testimonials').delete().in('id',entityIds);
  }
  if(memberIds.length){await admin.from('ops_audit_log').delete().in('actor_ops_member_id',memberIds);await admin.from('kinnso_ops_members').delete().in('id',memberIds);}
  await f.cleanup();
 }
});
