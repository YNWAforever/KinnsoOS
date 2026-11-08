import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {migrationUrl,packagedSource} from './packaged-source.mjs';

async function migration(){
 if(packagedSource(import.meta.url))return readFile(migrationUrl('20261106135230_harden_ops_team_security.sql',import.meta.url),'utf8');
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 const names=(await readdir(dir)).filter(name=>name.endsWith('_harden_ops_team_security.sql'));
 assert.equal(names.length,1,'one reviewed operations security migration must exist');
 return readFile(new URL(names[0],dir),'utf8');
}

test('operations security migration closes direct-write, token and stale-session bypasses',async()=>{
 const sql=await migration();
 assert.match(sql,/create or replace function public\.is_active_ops\(\)[\s\S]*kinnso_internal\.actor\(\)/i);
 assert.match(sql,/create or replace function public\.is_active_ops_role\([\s\S]*kinnso_internal\.actor\(\)/i);
 assert.match(sql,/if p_kind = 'ops' then\s+raise exception 'use_ops_lifecycle_rpc'/i);
 assert.match(sql,/revoke all on function public\.ops_audit_log_append\(text, uuid, text, text, jsonb\)\s+from public, anon, authenticated/i);
 assert.match(sql,/revoke all on public\.kinnso_ops_invites from public, anon, authenticated/i);
 assert.match(sql,/grant select \(id, email, role, status, invited_by, created_at, expires_at,\s+accepted_at, accepted_user_id\)\s+on public\.kinnso_ops_invites to authenticated/i);
 assert.doesNotMatch(sql,/grant select on public\.kinnso_ops_invites to authenticated/i);
});

test('invite acceptance is locked, verified, audited and safe to retry',async()=>{
 const sql=await migration();
 assert.match(sql,/where i\.token = p_token\s+for update/i);
 assert.match(sql,/where u\.id = v_uid\s+and u\.email_confirmed_at is not null/i);
 assert.match(sql,/v_invite\.status = 'accepted' and v_invite\.accepted_user_id = v_uid then\s+return/i);
 assert.match(sql,/where id = v_invite\.id\s+and status = 'pending'\s+and expires_at > now\(\)/i);
 assert.match(sql,/'invite\.accept'/i);
 assert.match(sql,/where lower\(i\.email\) = v_email\s+and i\.status = 'pending'\s+and i\.expires_at <= now\(\)/i);
});

test('all owner-changing transitions share one transaction lock',async()=>{
 const sql=await migration();
 const lock=/pg_advisory_xact_lock\([\s\S]*hashtextextended\('kinnso_ops_owner_invariant', 0\)/i;
 for(const fn of ['admin_set_ops_member_role','admin_suspend_ops_member']){
  const start=sql.search(new RegExp(`create or replace function public\\.${fn}`,'i'));
  assert.notEqual(start,-1,fn);
  const body=sql.slice(start);
  assert.match(body,lock,fn);
  assert.match(body,/for update/i,fn);
 }
});
