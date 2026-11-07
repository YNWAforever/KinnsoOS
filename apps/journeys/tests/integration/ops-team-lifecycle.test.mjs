import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {cleanOpsInviteFixtures} from './ops-invite-fixtures.mjs';
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

  const mutate=(args,client=owner.client)=>client.rpc('mutate_kinnso_ops_team',args);
  const command=(action,fields={})=>({p_request_id:randomUUID(),p_action:action,...fields});
  const inviteEmail=invitee.email;
  const inviteCommand=command('invite',{p_email:inviteEmail,p_role:'admin'});
  const [first,second]=await Promise.all([ok(mutate(inviteCommand)),ok(mutate({...inviteCommand,p_email:' '+inviteEmail.toUpperCase()+' '}))]);
  const firstToken=first.token;
  assert.match(firstToken,/^[a-f0-9]{64}$/);
  assert.deepEqual(second,first);
  const pending=await ok(admin.from('kinnso_ops_invites').select('id,email,role,status').eq('email',inviteEmail).eq('status','pending'));
  assert.equal(pending.length,1);assert.equal(pending[0].role,'admin');
  const audit=async(entity,action)=>(await ok(admin.from('ops_audit_log').select('id').eq('actor_ops_member_id',ownerMember).eq('entity_id',entity).eq('action',action))).length;
  assert.equal(await audit(pending[0].id,'invite.create'),1);
  const deletions=await Promise.all([owner.client,admin].map(client=>
   client.from('kinnso_ops_invites').delete().eq('id',pending[0].id)));
  for(const result of deletions)assert.equal(result.error?.code,'42501','API DELETE must fail explicitly');
  assert.equal((await ok(mutate(inviteCommand))).token===firstToken,true);
  const conflict=await mutate({...inviteCommand,p_role:'owner'});
  assert.match(conflict.error?.message??'',/REQUEST_ID_REUSED/);
  const forbidden=await mutate(inviteCommand,member.client);
  assert.match(forbidden.error?.message??'',/forbidden/);

  const roleCommand=command('setRole',{p_target:targetMember,p_role:'moderator',p_reason:'Synthetic role change'});
  assert.deepEqual(await ok(mutate(roleCommand)),{id:targetMember,role:'moderator'});
  await ok(mutate(command('setRole',{p_target:targetMember,p_role:'admin',p_reason:'Later role change'})));
  assert.deepEqual(await ok(mutate(roleCommand)),{id:targetMember,role:'moderator'});
  assert.equal((await ok(admin.from('kinnso_ops_members').select('role').eq('id',targetMember).single())).role,'admin');
  assert.equal(await audit(targetMember,'role.set'),2);

  const suspend=command('suspend',{p_target:targetMember,p_reason:'Synthetic suspension'});
  const reactivate=command('reactivate',{p_target:targetMember,p_reason:'Synthetic reactivation'});
  assert.deepEqual(await ok(mutate(suspend)),{id:targetMember,status:'suspended'});
  assert.deepEqual(await ok(mutate(reactivate)),{id:targetMember,status:'active'});
  assert.deepEqual(await ok(mutate(suspend)),{id:targetMember,status:'suspended'});
  assert.deepEqual(await ok(mutate(reactivate)),{id:targetMember,status:'active'});
  assert.equal((await ok(admin.from('kinnso_ops_members').select('status').eq('id',targetMember).single())).status,'active');
  assert.equal(await audit(targetMember,'status.suspended'),1);
  assert.equal(await audit(targetMember,'status.active'),1);

  const mismatch=await wrong.client.rpc('admin_accept_ops_invite',{p_token:firstToken});assert.equal(mismatch.error?.message.includes('email_mismatch'),true);
  await ok(invitee.client.rpc('admin_accept_ops_invite',{p_token:firstToken}));
  const acceptedMember=await ok(admin.from('kinnso_ops_members').select('id,role,status').eq('user_id',invitee.id).single());createdMembers.push(acceptedMember.id);assert.deepEqual({role:acceptedMember.role,status:acceptedMember.status},{role:'admin',status:'active'});
  await ok(invitee.client.rpc('admin_accept_ops_invite',{p_token:firstToken}));
  assert.equal((await ok(admin.from('ops_audit_log').select('id').eq('actor_ops_member_id',acceptedMember.id).eq('action','invite.accept'))).length,1);

  assert.equal((await ok(mutate(inviteCommand))).token===firstToken,true,'accepted invite still has its original receipt');
  assert.match((await mutate({...inviteCommand,p_role:'owner'})).error?.message??'',/REQUEST_ID_REUSED/);

  const revokeEmail=`revoke-${run}@example.test`;emails.push(revokeEmail);
  await ok(owner.client.rpc('admin_invite_ops_member',{p_email:revokeEmail,p_role:'analyst'}));
  const revokeInvite=(await ok(admin.from('kinnso_ops_invites').select('id').eq('email',revokeEmail).single())).id;
  const revoke=command('revoke',{p_target:revokeInvite});
  const revokedResult={id:revokeInvite,status:'revoked'};
  assert.deepEqual(await ok(mutate(revoke)),revokedResult);
  // Revoked history is protected too.
  assert.equal((await admin.from('kinnso_ops_invites').delete().eq('id',revokeInvite)).error?.code,'42501');
  assert.deepEqual(await ok(mutate(revoke)),revokedResult);
  assert.equal(await audit(revokeInvite,'invite.revoke'),1);
 }finally{
  cleanOpsInviteFixtures(emails);
  const memberRows=createdUsers.length?await admin.from('kinnso_ops_members').select('id').in('user_id',createdUsers):{data:[]};
  const allMemberIds=[...new Set([...createdMembers,...((memberRows.data??[]).map(row=>row.id))])];
  if(allMemberIds.length)await admin.from('ops_audit_log').delete().in('actor_ops_member_id',allMemberIds);
  if(createdUsers.length)await admin.from('kinnso_ops_members').delete().in('user_id',createdUsers);
  for(const id of createdUsers)await admin.auth.admin.deleteUser(id);
 }
});

test('operations database rejects legacy suspension, token/audit access and stale sessions',async()=>{
 const run=randomUUID(),createdUsers=[],createdMembers=[],emails=[];
 try{
  const make=async prefix=>{const email=`security-${prefix}-${run}@example.test`,password=randomBytes(18).toString('base64url');const made=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));createdUsers.push(made.user.id);const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,options);await ok(client.auth.signInWithPassword({email,password}));return{id:made.user.id,email,client};};
  const owner=await make('owner'),analyst=await make('analyst'),unverified=await make('unverified');
  emails.push(owner.email,analyst.email,unverified.email);
  const ownerMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:owner.id,display_name:'Security owner',role:'owner',status:'active'}).select('id').single())).id;
  const analystMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:analyst.id,display_name:'Security analyst',role:'analyst',status:'active'}).select('id').single())).id;
  createdMembers.push(ownerMember,analystMember);

  const forged=await analyst.client.rpc('ops_audit_log_append',{p_entity_type:'ops_member',p_entity_id:ownerMember,p_action:'forged.event',p_reason:'Synthetic unauthorized audit'});
  assert.ok(forged.error,'direct audit insertion must be denied');
  const tokenRead=await analyst.client.from('kinnso_ops_invites').select('token').limit(1);
  assert.ok(tokenRead.error,'invite secrets must not have a Data API column grant');
  const legacy=await owner.client.rpc('admin_set_user_status',{p_kind:'ops',p_id:analystMember,p_status:'suspended'});
  assert.match(legacy.error?.message??'',/use_ops_lifecycle_rpc/, 'legacy status writes must not mutate operations membership');
  const unverifiedToken=await ok(owner.client.rpc('admin_invite_ops_member',{p_email:unverified.email,p_role:'analyst'}));
  execFileSync('docker',['exec',process.env.KINNSO_TEST_DB_CONTAINER,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',`update auth.users set email_confirmed_at = null where id = '${unverified.id}'`],{stdio:'ignore',timeout:15000,windowsHide:true});
  const unverifiedAccept=await unverified.client.rpc('admin_accept_ops_invite',{p_token:unverifiedToken});
  assert.match(unverifiedAccept.error?.message??'',/email_unverified/,'acceptance requires a current confirmed email');

  const session=await analyst.client.auth.getSession();assert.ok(session.data.session?.access_token);
  await ok(admin.auth.admin.signOut(session.data.session.access_token,'local'));
  const stale=await analyst.client.rpc('admin_list_ops_members');
  assert.ok(stale.error,'a revoked Auth session must be rejected even when its JWT has not expired');
 }finally{
  cleanOpsInviteFixtures(emails);
  const memberRows=createdUsers.length?await admin.from('kinnso_ops_members').select('id').in('user_id',createdUsers):{data:[]};
  const allMemberIds=[...new Set([...createdMembers,...((memberRows.data??[]).map(row=>row.id))])];
  if(allMemberIds.length)await admin.from('ops_audit_log').delete().in('actor_ops_member_id',allMemberIds);
  if(createdUsers.length)await admin.from('kinnso_ops_members').delete().in('user_id',createdUsers);
  for(const id of createdUsers)await admin.auth.admin.deleteUser(id);
 }
});

test('concurrent owner and invite transitions preserve final-owner and acceptance invariants',async()=>{
 const run=randomUUID(),createdUsers=[],createdMembers=[],emails=[];
 const make=async prefix=>{const email=`concurrent-${prefix}-${run}@example.test`,password=randomBytes(18).toString('base64url');const made=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));createdUsers.push(made.user.id);emails.push(email);const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,options);await ok(client.auth.signInWithPassword({email,password}));return{id:made.user.id,email,client};};
 try{
  const ownerA=await make('owner-a'),ownerB=await make('owner-b'),invitee=await make('invitee'),expired=await make('expired');
  const ownerAMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:ownerA.id,display_name:'Concurrent owner A',role:'owner',status:'active'}).select('id').single())).id;
  const ownerBMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:ownerB.id,display_name:'Concurrent owner B',role:'owner',status:'active'}).select('id').single())).id;
  createdMembers.push(ownerAMember,ownerBMember);

  const roleRace=await Promise.all([
   ownerA.client.rpc('admin_set_ops_member_role',{p_member_id:ownerBMember,p_role:'admin',p_reason:'Concurrent owner transition A'}),
   ownerB.client.rpc('admin_set_ops_member_role',{p_member_id:ownerAMember,p_role:'admin',p_reason:'Concurrent owner transition B'}),
  ]);
  assert.equal(roleRace.filter(result=>!result.error).length,1);
  assert.equal(roleRace.filter(result=>result.error).length,1);
  const activeOwners=await ok(admin.from('kinnso_ops_members').select('id').eq('role','owner').eq('status','active').in('id',[ownerAMember,ownerBMember]));
  assert.equal(activeOwners.length,1,'one owner-changing transaction must be rejected');
  const activeOwner=activeOwners[0].id===ownerAMember?ownerA:ownerB;

  const token=await ok(activeOwner.client.rpc('admin_invite_ops_member',{p_email:invitee.email,p_role:'analyst'}));
  const invite=(await ok(admin.from('kinnso_ops_invites').select('id').eq('email',invitee.email).single())).id;
  const acceptRevoke=await Promise.all([
   invitee.client.rpc('admin_accept_ops_invite',{p_token:token}),
   activeOwner.client.rpc('admin_revoke_ops_invite',{p_invite_id:invite}),
  ]);
  assert.equal(acceptRevoke.filter(result=>!result.error).length,1);
  assert.equal(acceptRevoke.filter(result=>result.error).length,1);
  const finalInvite=await ok(admin.from('kinnso_ops_invites').select('status').eq('id',invite).single());
  const invitedMember=await ok(admin.from('kinnso_ops_members').select('id').eq('user_id',invitee.id));
  assert.equal(invitedMember.length,finalInvite.status==='accepted'?1:0,'acceptance and revocation must not both commit');
  if(invitedMember[0])createdMembers.push(invitedMember[0].id);

  const firstExpiredToken=await ok(activeOwner.client.rpc('admin_invite_ops_member',{p_email:expired.email,p_role:'analyst'}));
  assert.match(firstExpiredToken,/^[a-f0-9]{64}$/);
  await ok(admin.from('kinnso_ops_invites').update({expires_at:new Date(Date.now()-60_000).toISOString()}).eq('email',expired.email).eq('status','pending'));
  const replacement=await ok(activeOwner.client.rpc('admin_invite_ops_member',{p_email:expired.email,p_role:'analyst'}));
  assert.notEqual(replacement,firstExpiredToken);
  const expiredRows=await ok(admin.from('kinnso_ops_invites').select('status,token').eq('email',expired.email).order('created_at'));
  assert.deepEqual(expiredRows.map(row=>row.status),['expired','pending']);
  assert.equal(expiredRows[1].token,replacement);
 }finally{
  cleanOpsInviteFixtures(emails);
  if(createdMembers.length)await admin.from('ops_audit_log').delete().in('actor_ops_member_id',createdMembers);
  if(createdUsers.length)await admin.from('kinnso_ops_members').delete().in('user_id',createdUsers);
  for(const id of createdUsers)await admin.auth.admin.deleteUser(id);
 }
});
