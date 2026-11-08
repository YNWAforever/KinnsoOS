import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrationUrl} from './packaged-source.mjs';

const migration=migrationUrl('20261107020000_kinnso_ops_content_audit.sql',import.meta.url);

test('content administration mutations are definer RPCs with fresh operations-role checks',async()=>{
 const sql=await readFile(migration,'utf8');
 for(const name of ['admin_create_community_session','admin_set_community_session_status','admin_create_partner_perk','admin_set_partner_perk_active','admin_create_testimonial','admin_set_testimonial_status']){
  const start=sql.search(new RegExp(`create or replace function public\\.${name}`,'i'));
  assert.notEqual(start,-1,name);
  const next=sql.slice(start+1).search(/\ncreate or replace function public\./i);
  const body=sql.slice(start,next<0?undefined:start+1+next);
  assert.match(body,/security definer\s+set search_path = ''/i,name);
  assert.match(body,/public\.is_active_ops_role\('moderator'\)/i,name);
 }
});

test('content mutations audit creation and state changes in the same transaction',async()=>{
 const sql=await readFile(migration,'utf8');
 for(const action of ['session.create','perk.create','testimonial.create']){
  assert.match(sql,new RegExp(`ops_audit_log_append\\([\\s\\S]*?'${action.replaceAll('.','\\.')}'`),action);
 }
 for(const expression of ["'session.status.' || p_status","'perk.active.' || p_active::text","'testimonial.status.' || p_status"]){
  assert.ok(sql.includes(expression),expression);
 }
 assert.match(sql,/revoke all on function public\.admin_create_community_session\([\s\S]*?from public, anon, authenticated/i);
 assert.match(sql,/grant execute on function public\.admin_set_testimonial_status\([\s\S]*?to authenticated/i);
 assert.match(sql,/notify pgrst, 'reload schema'/i);
});

test('content mutations lock state rows and reconcile exact request-id retries',async()=>{
 const sql=await readFile(migration,'utf8');
 assert.match(sql,/where s\.id = p_id\s+for update/i);
 assert.match(sql,/where p\.id = p_id\s+for update/i);
 assert.match(sql,/where t\.id = p_id\s+for update/i);
 assert.equal((sql.match(/on conflict \(id\) do nothing/gi)??[]).length,3);
 assert.equal((sql.match(/'request_id_reused'/gi)??[]).length,3);
});

test('operations direct-write policies cannot bypass audited content RPCs',async()=>{
 const sql=await readFile(migration,'utf8');
 for(const policy of ['community_sessions_ops_all','partner_perks_ops_all','testimonials_ops_all'])assert.match(sql,new RegExp(`drop policy if exists ${policy}`,'i'),policy);
 for(const policy of ['community_sessions_ops_read','partner_perks_ops_read','testimonials_ops_read'])assert.match(sql,new RegExp(`create policy ${policy}[\\s\\S]*?for select to authenticated`,'i'),policy);
 assert.match(sql,/revoke insert, update, delete on public\.partner_perks from authenticated/i);
 assert.match(sql,/revoke insert, update, delete on public\.testimonials from authenticated/i);
});
