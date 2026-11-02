// Source-contract checks only. These tests do NOT apply SQL or prove RLS execution.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async name=>readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8').catch(()=>readFile(new URL('./contracts/'+name,import.meta.url),'utf8').catch(()=>''));
const metadata=await read('20261031090000_add_studio_metadata.sql');
const guard=await read('20261031090100_guard_studio_guide_writes.sql');
test('metadata source has explicit private grants, authoritative actors and replay checks',()=>{
 for(const marker of ['studio_threads','studio_sources','studio_artifact_versions','studio_evidence_links','studio_requests','enable row level security','kinnso_internal.actor()','idempotency_conflict','revision_conflict','get_kinnso_studio_request','studio_refs_current'])assert.ok(metadata.includes(marker),marker);
 assert.match(metadata,/revoke all on table[\s\S]*from public,anon,authenticated,service_role/);
 assert.ok(!metadata.includes('grant all'));
});
test('guide guard source protects direct updates and lower publication while preserving legacy writers',()=>{
 for(const marker of ['studio_guide_bindings','studio_write_permits','assert_studio_guide_write','legacy_save_kinnso_guide_draft','legacy_publish_guide_version','before update','before insert','studio_prepare_guide','for share','txid_current()'])assert.ok(guard.includes(marker),marker);
 assert.ok(!guard.includes('current_setting('),'no client-forgeable GUC permit');
 assert.ok(!guard.includes('disable row level security'));
});
test('review source prevents identity resurrection and preserves pinned versions plus bookmark maintenance',()=>{
 assert.ok(guard.includes('studio_guide_tombstones'));
 assert.ok(guard.includes('before insert or delete on public.guides'));
 assert.ok(guard.includes('after insert on public.guides'));
 assert.ok(guard.includes("'studio-guide-identity:'||old.id"));
 assert.ok(guard.includes("'studio-guide-identity:'||new.id"));
 assert.ok(guard.includes("to_jsonb(new)-array['saves_count','updated_at','tsv']"));
 assert.ok(!guard.includes('studio_prepare_guide.guide_id'));
 assert.ok(guard.includes('revision=v_artifact_revision'));
 assert.ok(!guard.includes('a.revision<>binding.artifact_revision'));
});
