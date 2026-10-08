import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fixture,admin,anonymous} from './local-fixtures.mjs';

const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const denied=async p=>{const r=await p;assert.ok(r.error);return r.error;};
const token=()=>randomBytes(32).toString('hex');
const sql=q=>execFileSync('docker',['exec','supabase_db_kinnsoos-b1-20261002','psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
async function setup(){
 const f=await fixture();const owner=await f.actor(),recipient=await f.actor(),outsider=await f.actor(),replacement=await f.actor();
 const merchant=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic invitation company',contact_email:'synthetic@example.test'}).select('id').single())).id;
 const branch=randomUUID();await ok(owner.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:merchant,p_request_id:randomUUID(),p_command:{type:'createBranch',id:branch,name:'Synthetic assigned branch'}}));
 const email=(await recipient.client.auth.getUser()).data.user.email;
 const command=(payload,key=randomUUID(),actor=owner,id=merchant)=>actor.client.rpc('apply_kinnso_merchant_invitation',{p_merchant_id:id,p_request_id:key,p_command:payload});
 const create=(raw=token(),extra={})=>({type:'create',id:randomUUID(),token:raw,email:email.toUpperCase(),label:'Synthetic recipient',role:'clerk',branchIds:[branch],reason:'Synthetic owner reviewed scope',...extra});
 const preview=(raw,actor=recipient)=>actor.client.rpc('preview_kinnso_merchant_invitation',{p_token:raw});
 const accept=(raw,key=randomUUID(),actor=recipient)=>actor.client.rpc('accept_kinnso_merchant_invitation',{p_token:raw,p_request_id:key});
 const list=(after=null,actor=owner,id=merchant)=>actor.client.rpc('list_kinnso_merchant_invitations',{p_merchant_id:id,p_after:after});
 return{f,owner,recipient,outsider,replacement,merchant,branch,email,command,create,preview,accept,list,cleanup:async()=>{await ok(admin.from('merchant_profiles').delete().eq('id',merchant));await f.cleanup();}};
}

test('merchant invitation owner scope, strict commands, private receipts and company keyset',async()=>{
 const x=await setup();try{
  const raw=token(),c=x.create(raw),key=randomUUID();const first=await ok(x.command(c,key));assert.equal(first.id,c.id);assert.equal(first.status,'pending');assert.ok(Date.parse(first.expiresAt)>Date.now());assert.deepEqual(await ok(x.command(c,key)),first);
  assert.equal((await denied(x.command({...c,label:'Changed'},key))).message,'idempotency_conflict');
  assert.equal((await denied(x.command(x.create(),randomUUID(),x.outsider))).message,'forbidden');
  for(const extra of [{role:'owner'},{branchIds:[randomUUID()]},{branchIds:[x.branch,x.branch]},{reason:''},{email:'not-an-email'},{token:'small'},{unexpected:true}])await denied(x.command(x.create(token(),extra)));
  await denied(anonymous.rpc('list_kinnso_merchant_invitations',{p_merchant_id:x.merchant}));await denied(anonymous.rpc('preview_kinnso_merchant_invitation',{p_token:raw}));await denied(anonymous.rpc('accept_kinnso_merchant_invitation',{p_token:raw,p_request_id:randomUUID()}));await denied(x.list(null,x.outsider));await denied(x.list(randomUUID()));
  const rows=await ok(x.list());assert.equal(rows.invitations.length,1);assert.equal(rows.invitations[0].label,c.label);assert.equal(rows.invitations[0].status,'pending');
  const stored=sql(`select jsonb_build_object('receipts',(select jsonb_agg(result) from kinnso_internal.workspace_requests where actor_id='${x.owner.id}'),'audits',(select jsonb_agg(to_jsonb(a)) from kinnso_internal.merchant_audit a where merchant_id='${x.merchant}'),'invite',(select to_jsonb(i) from kinnso_internal.merchant_invitations i where id='${c.id}'));`);
  for(const value of [JSON.stringify(first),JSON.stringify(rows),stored]){assert.equal(value.toLowerCase().includes(x.email.toLowerCase()),false);assert.equal(value.includes(raw),false);}
  assert.equal(sql("select has_table_privilege('authenticated','kinnso_internal.merchant_invitations','SELECT') or has_table_privilege('anon','kinnso_internal.merchant_invitations','SELECT');"),'f');
 }finally{await x.cleanup();}
});

test('verified intended recipient previews without writes and accepts once; replay never restores offboarded access',async()=>{
 const x=await setup();try{
  const raw=token(),c=x.create(raw);await ok(x.command(c));
  await ok(admin.auth.admin.updateUserById(x.outsider.id,{user_metadata:{email:x.email,email_verified:true}}));await ok(x.outsider.client.auth.refreshSession());assert.equal((await denied(x.preview(raw,x.outsider))).message,'forbidden');
  const preview=await ok(x.preview(raw));assert.equal(preview.role,'clerk');assert.deepEqual(preview.branchIds,[x.branch]);assert.equal(preview.branches[0].name,'Synthetic assigned branch');assert.equal(sql(`select count(*) from kinnso_internal.merchant_members where merchant_id='${x.merchant}';`),'0');
  const key=randomUUID();const [one,two]=await Promise.all([x.accept(raw,key),x.accept(raw,key)]);assert.deepEqual(await ok(Promise.resolve(one)),await ok(Promise.resolve(two)));assert.equal(one.data.merchantId,x.merchant);
  const workspace=await ok(x.recipient.client.rpc('get_kinnso_merchant_workspace',{p_merchant_id:x.merchant}));assert.equal(workspace.role,'clerk');assert.deepEqual(workspace.branches.map(b=>b.id),[x.branch]);
  assert.equal(sql(`select count(*) from kinnso_internal.merchant_audit where merchant_id='${x.merchant}' and action='acceptInvitation';`),'1');assert.equal((await denied(x.accept(raw))).message,'forbidden');
  await ok(x.owner.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:x.merchant,p_request_id:randomUUID(),p_command:{type:'setMember',userId:x.recipient.id,role:'clerk',branchIds:[x.branch],active:false}}));
  assert.equal((await denied(x.accept(raw,key))).message,'forbidden');assert.equal((await denied(x.recipient.client.rpc('get_kinnso_merchant_workspace',{p_merchant_id:x.merchant}))).message,'forbidden');assert.equal(sql(`select active from kinnso_internal.merchant_members where merchant_id='${x.merchant}' and user_id='${x.recipient.id}';`),'f');
 }finally{await x.cleanup();}
});

test('invitation expiry, revocation, archived branches and unverified email deny without membership writes',async()=>{
 const x=await setup();try{
  const revoked=token(),expired=token(),archived=token(),unverified=token();const r=x.create(revoked),e=x.create(expired),a=x.create(archived),u=x.create(unverified);
  for(const c of [r,e,a,u])await ok(x.command(c));const revoke={type:'revoke',id:r.id,reason:'Synthetic cancellation'},key=randomUUID();assert.deepEqual(await ok(x.command(revoke,key)),await ok(x.command(revoke,key)));assert.equal((await denied(x.accept(revoked))).message,'forbidden');
  sql(`update kinnso_internal.merchant_invitations set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='${e.id}';`);assert.equal((await denied(x.preview(expired))).message,'forbidden');assert.equal((await denied(x.accept(expired))).message,'forbidden');
  sql(`update auth.users set email_confirmed_at=null where id='${x.recipient.id}';`);assert.equal((await denied(x.preview(unverified))).message,'forbidden');sql(`update auth.users set email_confirmed_at=now(),email='synthetic-changed-${randomUUID()}@example.test' where id='${x.recipient.id}';`);assert.equal((await denied(x.preview(unverified))).message,'forbidden');sql(`update auth.users set email='${x.email}' where id='${x.recipient.id}';`);
  sql(`update kinnso_internal.merchant_branches set active=false where id='${x.branch}';`);assert.equal((await denied(x.accept(archived))).message,'invalid_branch');assert.equal(sql(`select count(*) from kinnso_internal.merchant_members where merchant_id='${x.merchant}';`),'0');
 }finally{await x.cleanup();}
});

test('owner transfer and canonical session loss invalidate outstanding invitations and owner receipts',async()=>{
 const x=await setup();try{
  const raw=token(),c=x.create(raw),key=randomUUID();await ok(x.command(c,key));await ok(admin.from('merchant_profiles').update({user_id:x.replacement.id}).eq('id',x.merchant));
  assert.equal((await denied(x.command(c,key))).message,'forbidden');assert.equal((await denied(x.accept(raw))).message,'forbidden');
  assert.equal((await ok(x.list(null,x.replacement))).invitations.find(row=>row.id===c.id).status,'invalidated');
  const replacementRaw=token();await ok(x.command(x.create(replacementRaw),randomUUID(),x.replacement));sql(`delete from auth.sessions where user_id='${x.recipient.id}';`);assert.equal((await denied(x.accept(replacementRaw))).message,'unauthenticated');
 }finally{await x.cleanup();}
});

test('competing invitation acceptances cannot overwrite existing membership or reactivate an inactive member',async()=>{
 const x=await setup();try{
  const a=token(),b=token();await ok(x.command(x.create(a)));await ok(x.command(x.create(b,{role:'finance'})));const results=await Promise.all([x.accept(a),x.accept(b)]);assert.equal(results.filter(r=>!r.error).length,1);assert.equal(results.filter(r=>r.error?.message==='revision_conflict').length,1);
  assert.equal(sql(`select count(*) from kinnso_internal.merchant_members where merchant_id='${x.merchant}';`),'1');assert.equal(sql(`select count(*) from kinnso_internal.merchant_audit where merchant_id='${x.merchant}' and action='acceptInvitation';`),'1');
  const pending=results[0].error?a:b;await ok(x.owner.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:x.merchant,p_request_id:randomUUID(),p_command:{type:'setMember',userId:x.recipient.id,role:'clerk',branchIds:[x.branch],active:false}}));assert.equal((await denied(x.accept(pending))).message,'revision_conflict');
 }finally{await x.cleanup();}
});

test('ownership or suspension reversals never revive an invalidated invitation; unrelated profile edits preserve it',async()=>{
 const x=await setup();try{
  const raw=token(),c=x.create(raw);await ok(x.command(c));await ok(admin.from('merchant_profiles').update({company_name:'Synthetic renamed company'}).eq('id',x.merchant));await ok(x.preview(raw));
  await ok(admin.from('merchant_profiles').update({user_id:x.replacement.id}).eq('id',x.merchant));await ok(admin.from('merchant_profiles').update({user_id:x.owner.id}).eq('id',x.merchant));assert.equal((await denied(x.accept(raw))).message,'forbidden');
  const second=token(),s=x.create(second);await ok(x.command(s));await ok(admin.from('merchant_profiles').update({status:'suspended'}).eq('id',x.merchant));await ok(admin.from('merchant_profiles').update({status:'active'}).eq('id',x.merchant));assert.equal((await denied(x.preview(second))).message,'forbidden');assert.equal((await ok(x.list())).invitations.find(row=>row.id===s.id).status,'invalidated');
 }finally{await x.cleanup();}
});

test('owner invitation keyset returns53 related records exactly once with truthful statuses',async()=>{
 const x=await setup();try{
  const ids=[];for(let i=0;i<53;i++){const c=x.create(token(),{email:`synthetic-${randomUUID()}@example.test`,label:`Synthetic member ${i}`});ids.push(c.id);await ok(x.command(c));}
  const first=await ok(x.list());assert.equal(first.invitations.length,50);assert.ok(first.nextCursor);const second=await ok(x.list(first.nextCursor));assert.equal(second.invitations.length,3);assert.equal(second.nextCursor,null);assert.deepEqual([...first.invitations,...second.invitations].map(x=>x.id).sort(),ids.sort());
 }finally{await x.cleanup();}
});

test('pending invitation quota is atomic, revocation releases capacity and foreign-company cursors stay private',async()=>{
 const x=await setup();let other;try{
  other=(await ok(admin.from('merchant_profiles').insert({user_id:x.outsider.id,company_name:'Synthetic foreign invitation company',contact_email:'synthetic@example.test'}).select('id').single())).id;
  const foreign=x.create(token(),{branchIds:[]});await ok(x.command(foreign,randomUUID(),x.outsider,other));assert.equal((await denied(x.list(foreign.id))).message,'invalid_cursor');assert.equal((await denied(x.list(null,x.owner,other))).message,'forbidden');
  const ids=[];for(let i=0;i<99;i++){const c=x.create();ids.push(c.id);await ok(x.command(c));}const last=[x.create(),x.create()];const race=await Promise.all(last.map(c=>x.command(c)));assert.equal(race.filter(r=>!r.error).length,1);assert.equal(race.filter(r=>r.error?.message==='quota_exceeded').length,1);
  await ok(x.command({type:'revoke',id:ids[0],reason:'Synthetic quota cancellation'}));await ok(x.command(x.create()));assert.equal(sql(`select count(*) from kinnso_internal.merchant_invitations where merchant_id='${x.merchant}' and revoked_at is null and accepted_at is null;`),'100');
 }finally{if(other)await ok(admin.from('merchant_profiles').delete().eq('id',other));await x.cleanup();}
});
