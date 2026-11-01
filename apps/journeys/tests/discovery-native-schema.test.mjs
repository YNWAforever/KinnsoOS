import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
const read=name=>{const u=new URL('../../../supabase/migrations/'+name,import.meta.url),pack=new URL('./contracts/'+name,import.meta.url);return existsSync(u)?readFileSync(u,'utf8'):existsSync(pack)?readFileSync(pack,'utf8'):'';};
const metadata=read('20261101090000_discovery_metadata.sql'),grants=read('20261101090100_discovery_source_grants.sql');
test('unapplied native metadata is protected, RPC bounded, retention explicit',()=>{
 for(const name of ['discovery_preferences','trip_intents','merchant_links','offer_imports','offer_publications','offer_publication_versions','match_runs','match_choices']){
  assert.match(metadata,new RegExp('create table public\\.'+name+'\\b'));assert.match(metadata,new RegExp('alter table public\\.'+name+' enable row level security'));
 }
 for(const name of ['apply_kinnso_discovery_command','get_kinnso_discovery_request','read_kinnso_discovery'])assert.match(metadata,new RegExp('function public\\.'+name+'\\('));
 assert.match(metadata,/pg_advisory_xact_lock/);assert.match(metadata,/discovery_tombstones/);assert.match(metadata,/interval '30 days'/);assert.match(metadata,/interval '90 days'/);
 assert.match(metadata,/from public,anon,authenticated,service_role/);assert.match(metadata,/set search_path=''/);assert.doesNotMatch(metadata,/cron\.schedule|grant all|disable row level security/i);
});
test('licensed ingestion remains closed; bindings include day headings and root metadata',()=>{
 assert.match(grants,/create table public\.studio_source_grants/);assert.match(grants,/create table kinnso_internal\.discovery_derivative_bindings/);
 assert.match(grants,/'trip_day'/);assert.match(grants,/root_metadata/);assert.match(grants,/discovery_licensed_ingestion_unavailable/);
 assert.match(grants,/for share/);assert.match(grants,/for update/);assert.doesNotMatch(grants,/grant .*service_role/i);
});
test('N review SQL candidate uses kind-scoped tombstones and explicit true gate',()=>{
 assert.match(metadata,/resource_kind text not null/);assert.match(metadata,/resource_kind='intent'/);
 assert.match(metadata,/private_writes from kinnso_internal\.discovery_gate where singleton\) is distinct from true/);
 assert.match(metadata,/discovery-owner:/);
 assert.match(grants,/p_version is null/);assert.match(grants,/g\.purpose is distinct from p_purpose/);
});
test('N review import draft can exist before immutable content preparation',()=>{
 assert.match(metadata,/content_version=0 and status='draft' and content_hash is null and preview_digest is null/);
});
