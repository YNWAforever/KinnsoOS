// Only the explicitly named owned local rehearsal database is writable here.
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildMigrationTransaction} from './migration-release.mjs';
const root=new URL('../',import.meta.url),dir=new URL('.local-private/suspension-release-package/',root);
const container='supabase_db_kinnsoos-rehearsal-13909a52f16b';
const info=spawnSync('docker',['inspect',container],{encoding:'utf8'});
assert.equal(info.status,0);const inspected=JSON.parse(info.stdout)[0];
assert.equal(inspected.Config.Labels['com.supabase.cli.project'],'kinnsoos-rehearsal-13909a52f16b');
const run=sql=>spawnSync('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,encoding:'utf8',timeout:30000});
const ok=sql=>{const r=run(sql);assert.equal(r.status,0,r.stderr);return r.stdout.trim()};
const live=JSON.parse(readFileSync(new URL('live-catalog.json',dir),'utf8'));
assert.deepEqual(live.functions.map(f=>f.name),['can_delete_empty_mission','mission_review_event_append']);
const signatures=['app_private.can_delete_empty_mission(uuid)','public.mission_review_event_append(uuid,text,text)'];
for(const [i,f] of live.functions.entries()){
 assert.equal(f.owner,'postgres');
 assert.ok(f.definition.startsWith('CREATE OR REPLACE FUNCTION '+f.schema+'.'+f.name+'('));
 ok(f.definition+';');
 ok(`revoke all on function ${signatures[i]} from public,anon,authenticated,service_role; grant execute on function ${signatures[i]} to authenticated;`+(i===1?`grant execute on function ${signatures[i]} to service_role;`:''));
}
for(const p of live.policies){
 assert.match(p.policyname,/^missions_(owner_insert|owner_update|owner_delete_without_dependents|visible_select)$/);
 assert.deepEqual(p.roles,['authenticated']);assert.equal(p.permissive,'PERMISSIVE');
 ok(`drop policy if exists "${p.policyname}" on public.missions; create policy "${p.policyname}" on public.missions for ${p.cmd} to authenticated`+(p.qual?` using (${p.qual})`:'')+(p.with_check?` with check (${p.with_check})`:'')+';');
}
const query=`select md5(jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner)) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='app_private' and p.proname='can_delete_empty_mission') or (n.nspname='public' and p.proname='mission_review_event_append')), 'policies',(select jsonb_agg(to_jsonb(x) order by policyname) from pg_policies x where schemaname='public' and tablename='missions'))::text)`;
const baseline=ok('set search_path=pg_catalog; '+query);
const expected=ok("select md5('"+JSON.stringify(live).replaceAll("'","''")+"'::jsonb::text)");
assert.equal(baseline,expected,'local baseline does not match observed production metadata');
const payload=readFileSync(new URL('payload.sql',dir),'utf8');
const candidate={sql:payload,sha256:createHash('sha256').update(payload).digest('hex')};
const committed=ok(`begin; set local search_path=pg_catalog; ${payload}\n${query}; rollback;`);
const failure=run(buildMigrationTransaction(candidate,{catalogQuery:query,baseline,committed:'00000000000000000000000000000000',acknowledgment:'KINNSO_COMMIT_ACK_FAILURE'}));
assert.notEqual(failure.status,0);assert.match(failure.stderr,/MIGRATION_POSTCHECK_FAILED/);
assert.equal(ok('set search_path=pg_catalog; '+query),baseline);
const envelope=buildMigrationTransaction(candidate,{catalogQuery:query,baseline,committed,acknowledgment:'KINNSO_COMMIT_ACK_SUSPENSION_20261105'});
ok(envelope);assert.equal(ok('set search_path=pg_catalog; '+query),committed);
const replay=run(envelope);assert.notEqual(replay.status,0);assert.match(replay.stderr,/MIGRATION_BASELINE_CHANGED/);
writeFileSync(new URL('production-bound-envelope.sql',dir),envelope);
writeFileSync(new URL('catalog-query.sql',dir),'set search_path=pg_catalog; '+query+';');
const receipt={project:'scryfkefedzuetfdtrvl',baseline,committed,payloadSha256:candidate.sha256,envelopeSha256:createHash('sha256').update(envelope).digest('hex'),baselineMatchesLiveMetadata:true,localRollback:'PASS',localCommit:'PASS',localPostcheck:'PASS',localReplayDenied:'PASS',productionChanged:false,scope:'two function definitions/owners/ACLs and all missions policies',approval:'NOT_GRANTED',backupRestore:'WAIVED_BY_USER'};
writeFileSync(new URL('envelope-rehearsal.json',dir),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
