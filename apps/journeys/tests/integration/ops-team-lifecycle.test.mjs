import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');
verifyTestTarget();
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const ok=async promise=>{const result=await promise;assert.equal(result.error,null);return result.data;};

test('operations invites and audits are retry-safe on the isolated target',async()=>{
 const run=randomUUID(),createdUsers=[],createdMembers=[],emails=[];
 try{
  const make=async prefix=>{const email=`ops-${prefix}-${run}@example.test`,password=randomBytes(18).toString('base64url');const made=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));createdUsers.push(made.user.id);emails.push(email);const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,options);await ok(client.auth.signInWithPassword({email,password}));return{id:made.user.id,email,client};};
  const owner=await make('owner'),member=await make('member'),invitee=await make('invitee'),wrong=await make('wrong'),revoked=await make('revoked');
  const ownerMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:owner.id,display_name:'Synthetic lifecycle owner',role:'owner',status:'active'}).select('id').single())).id;
  const targetMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:member.id,display_name:'Synthetic lifecycle analyst',role:'analyst',status:'active'}).select('id').single())).id;
  createdMembers.push(ownerMember,targetMember);
  const alreadyMember=await owner.client.rpc('admin_invite_ops_member',{p_email:member.email,p_role:'analyst'});assert.equal(alreadyMember.error?.message.includes('already_ops_member'),true);

  const inviteEmail=invitee.email;
  const firstToken=await ok(owner.client.rpc('admin_invite_ops_member',{p_email:inviteEmail,p_role:'admin'}));
  const secondToken=await ok(owner.client.rpc('admin_invite_ops_member',{p_email:inviteEmail,p_role:'admin'}));
  assert.equal(secondToken,firstToken);
  const pending=(await ok(admin.from('kinnso_ops_invites').select('id,email,role,status').eq('email',inviteEmail).eq('status','pending')));assert.equal(pending.length,1);assert.equal(pending[0].role,'admin');

  await ok(owner.client.rpc('admin_set_ops_member_role',{p_member_id:targetMember,p_role:'moderator',p_reason:'Synthetic retry-safe role change'}));
  await ok(owner.client.rpc('admin_set_ops_member_role',{p_member_id:targetMember,p_role:'moderator',p_reason:'Synthetic retry-safe role change'}));
  assert.equal((await ok(admin.from('ops_audit_log').select('id').eq('actor_ops_member_id',ownerMember).eq('entity_id',targetMember).eq('action','role.set'))).length,1);

  await ok(owner.client.rpc('admin_suspend_ops_member',{p_member_id:targetMember,p_reason:'Synthetic retry-safe suspension'}));
  await ok(owner.client.rpc('admin_suspend_ops_member',{p_member_id:targetMember,p_reason:'Synthetic retry-safe suspension'}));
  await ok(owner.client.rpc('admin_reactivate_ops_member',{p_member_id:targetMember,p_reason:'Synthetic retry-safe reactivation'}));
  await ok(owner.client.rpc('admin_reactivate_ops_member',{p_member_id:targetMember,p_reason:'Synthetic retry-safe reactivation'}));
  assert.equal((await ok(admin.from('ops_audit_log').select('id').eq('actor_ops_member_id',ownerMember).eq('entity_id',targetMember).eq('action','status.suspended'))).length,1);
  assert.equal((await ok(admin.from('ops_audit_log').select('id').eq('actor_ops_member_id',ownerMember).eq('entity_id',targetMember).eq('action','status.active'))).length,1);

  const mismatch=await wrong.client.rpc('admin_accept_ops_invite',{p_token:firstToken});assert.equal(mismatch.error?.message.includes('email_mismatch'),true);
  await ok(invitee.client.rpc('admin_accept_ops_invite',{p_token:firstToken}));
  const acceptedMember=await ok(admin.from('kinnso_ops_members').select('id,role,status').eq('user_id',invitee.id).single());createdMembers.push(acceptedMember.id);assert.deepEqual({role:acceptedMember.role,status:acceptedMember.status},{role:'admin',status:'active'});
  const replay=await invitee.client.rpc('admin_accept_ops_invite',{p_token:firstToken});assert.equal(replay.error?.message.includes('invite_accepted'),true);

  const revokeEmail=`revoke-${run}@example.test`;emails.push(revokeEmail);
  await ok(owner.client.rpc('admin_invite_ops_member',{p_email:revokeEmail,p_role:'analyst'}));
  const revokeInvite=(await ok(admin.from('kinnso_ops_invites').select('id').eq('email',revokeEmail).single())).id;
  await ok(owner.client.rpc('admin_revoke_ops_invite',{p_invite_id:revokeInvite}));
  await ok(owner.client.rpc('admin_revoke_ops_invite',{p_invite_id:revokeInvite}));
  assert.equal((await ok(admin.from('ops_audit_log').select('id').eq('actor_ops_member_id',ownerMember).eq('entity_id',revokeInvite).eq('action','invite.revoke'))).length,1);
 }finally{
  for(const email of emails)await admin.from('kinnso_ops_invites').delete().eq('email',email);
  if(createdMembers.length)await admin.from('ops_audit_log').delete().in('actor_ops_member_id',createdMembers);
  if(createdUsers.length)await admin.from('kinnso_ops_members').delete().in('user_id',createdUsers);
  for(const id of createdUsers)await admin.auth.admin.deleteUser(id);
 }
});
