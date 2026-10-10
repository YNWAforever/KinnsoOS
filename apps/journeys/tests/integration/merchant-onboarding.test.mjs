import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {admin,anonymous,fixture} from './local-fixtures.mjs';
const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const input={companyName:'Synthetic collaboration cafe',contactName:'Synthetic Owner',contactEmail:'owner@example.test',websiteUrl:'https://example.test/',pitch:'Synthetic merchant application contract'};
test('merchant application is pending, private, replayable and moderated; profile stays owner-only with CAS across old writers',async()=>{
 const f=await fixture();let merchantId,opsId;const applications=[];
 try{
  const owner=await f.actor(),outsider=await f.actor(),ops=await f.actor();opsId=(await ok(admin.from('kinnso_ops_members').insert({user_id:ops.id,display_name:'Synthetic intake moderator',role:'moderator'}).select('id').single())).id;
  const args={p_request_id:randomUUID(),p_input:input};
  const [first,replay]=await Promise.all([ok(owner.client.rpc('submit_kinnso_merchant_application',args)),ok(owner.client.rpc('submit_kinnso_merchant_application',args))]);applications.push(first.id);assert.deepEqual(first,replay);assert.equal(first.status,'pending');
  const duplicate=await ok(owner.client.rpc('submit_kinnso_merchant_application',{...args,p_request_id:randomUUID(),p_input:{...input,companyName:'Must not overwrite'}}));assert.equal(duplicate.id,first.id);
  assert.equal((await owner.client.rpc('submit_kinnso_merchant_application',{...args,p_input:{...input,pitch:'changed intent'}})).error?.message,'idempotency_conflict');
  const own=await ok(owner.client.rpc('get_kinnso_merchant_onboarding'));assert.equal(own.applications[0].companyName,input.companyName);assert.equal(own.merchant,null);assert.equal((await ok(outsider.client.rpc('get_kinnso_merchant_onboarding'))).applications.length,0);
  assert.ok((await anonymous.rpc('get_kinnso_merchant_onboarding')).error);assert.equal((await owner.client.rpc('admin_approve_merchant_application',{p_id:first.id,p_reason:'Self approval must fail'})).error?.message,'forbidden');
  for(const extra of [{status:'approved'},{userId:outsider.id},{tier:'enterprise'}])assert.ok((await owner.client.rpc('submit_kinnso_merchant_application',{p_request_id:randomUUID(),p_input:{...input,...extra}})).error);
  for(const invalid of [{companyName:'\n'},{companyName:'bad\u0001name'},{websiteUrl:'https://[]'},{websiteUrl:'https://example.test:bad'},{websiteUrl:'https://[a]'},{websiteUrl:'https://example.test:99999'}])assert.ok((await owner.client.rpc('submit_kinnso_merchant_application',{p_request_id:randomUUID(),p_input:{...input,...invalid}})).error);
  await ok(ops.client.rpc('admin_reject_merchant_application',{p_id:first.id,p_reason:'Synthetic rejection then resubmission'}));
  const next=await ok(owner.client.rpc('submit_kinnso_merchant_application',{p_request_id:randomUUID(),p_input:input}));applications.push(next.id);assert.notEqual(next.id,first.id);
  merchantId=await ok(ops.client.rpc('admin_approve_merchant_application',{p_id:next.id,p_reason:'Synthetic moderated acceptance'}));
  const profile=await ok(owner.client.rpc('get_kinnso_merchant_profile',{p_merchant_id:merchantId}));assert.equal(profile.companyName,input.companyName);
  assert.equal((await outsider.client.rpc('get_kinnso_merchant_profile',{p_merchant_id:merchantId})).error?.message,'forbidden');
  const details={companyName:'Synthetic renamed company',contactName:input.contactName,contactEmail:input.contactEmail,websiteUrl:input.websiteUrl,tagline:'Local routes',city:'Hong Kong',logoUrl:''};
  const save={p_merchant_id:merchantId,p_request_id:randomUUID(),p_expected_updated_at:profile.updatedAt,p_input:details};
  const result=await ok(owner.client.rpc('save_kinnso_merchant_profile',save));assert.equal(result.companyName,details.companyName);assert.notEqual(result.updatedAt,profile.updatedAt);assert.deepEqual(await ok(owner.client.rpc('save_kinnso_merchant_profile',save)),result);
  assert.equal((await owner.client.rpc('save_kinnso_merchant_profile',{...save,p_request_id:randomUUID()})).error?.message,'revision_conflict');
  assert.equal((await outsider.client.rpc('save_kinnso_merchant_profile',{...save,p_request_id:randomUUID(),p_expected_updated_at:result.updatedAt})).error?.message,'forbidden');
  await ok(owner.client.from('merchant_profiles').update({company_name:'Synthetic older app edit'}).eq('id',merchantId));
  assert.equal((await owner.client.rpc('save_kinnso_merchant_profile',{...save,p_request_id:randomUUID(),p_expected_updated_at:result.updatedAt})).error?.message,'revision_conflict');
  for(const extra of [{status:'active'},{userId:outsider.id},{slug:'takeover'}])assert.ok((await owner.client.rpc('save_kinnso_merchant_profile',{...save,p_request_id:randomUUID(),p_input:{...details,...extra}})).error);
  await ok(admin.from('merchant_profiles').update({status:'suspended'}).eq('id',merchantId));assert.equal((await owner.client.rpc('get_kinnso_merchant_profile',{p_merchant_id:merchantId})).error?.message,'forbidden');assert.equal((await owner.client.rpc('save_kinnso_merchant_profile',save)).error?.message,'forbidden');
 }finally{
  if(applications.length)await ok(admin.from('merchant_applications').delete().in('id',applications));if(merchantId)await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));if(opsId){await ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id',opsId));await ok(admin.from('kinnso_ops_members').delete().eq('id',opsId));}await f.cleanup();
 }
});
