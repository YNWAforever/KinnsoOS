// Isolated policy regression, not full Supabase/migration-chain acceptance.
// Requires Docker and the locally available postgres:17 image. No ports,
// host mounts, network, production credentials, or existing containers used.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { buildMigrationTransaction } from '../scripts/migration-release.mjs'
import assert from 'node:assert/strict'

const name = `kinnso-merchant-policy-${Date.now()}`
const root = new URL('../', import.meta.url)
const original = readFileSync(new URL('supabase/migrations/20260617173938_mission_rls.sql', root), 'utf8')
const policies = original.slice(original.indexOf('create policy "missions_owner_insert"'), original.indexOf('create policy "mission_participants_visible_select"'))
const migration = readFileSync(new URL('supabase/migrations/20261104195741_active_merchant_mission_writes.sql', root), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 30000 })
const sql = text => docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], text)
const ok = text => {
  const result = sql(text)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
const as = (actor, statement) => `set role authenticated; set request.jwt.claim.sub = '${id(actor)}'; ${statement}`
const insert = (merchant, source = 'merchant', ops = 'null') => `insert into public.missions (merchant_profile_id, mission_source, created_by_ops_member_id) values (${merchant ? `'${id(merchant)}'` : 'null'}, '${source}', ${ops});`
let checks = 0
const allow = (label, actor, statement) => { ok(as(actor, statement)); checks++; console.log(`PASS ${label}`) }
const deny = (label, actor, statement) => {
  const result = sql(as(actor, statement))
  assert.notEqual(result.status, 0, label)
  assert.match(result.stderr, /row-level security/, result.stderr)
  checks++; console.log(`PASS ${label}`)
}
const changed = (label, actor, row, expected) => {
  const count = ok(as(actor, `with changed as (update public.missions set title = 'reviewed' where id = '${id(row)}' returning id) select count(*) from changed;`))
  assert.equal(count, String(expected), label)
  checks++; console.log(`PASS ${label}`)
}

const started = docker(['run', '-d', '--name', name, '--network', 'none', '--memory', '256m', '--cpus', '1', '--label', 'kinnso.test=merchant-policy', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17'])
assert.equal(started.status, 0, started.stderr)
try {
  let ready = false
  for (let attempt = 0; attempt < 25; attempt++) {
    if (docker(['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  assert.ok(ready, 'isolated PostgreSQL did not start')
  ok(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.merchant_profiles (id uuid primary key, user_id uuid, status text);
    create table public.kinnso_ops_members (id uuid primary key, user_id uuid, status text);
    create table public.missions (id uuid primary key default gen_random_uuid(), merchant_profile_id uuid, mission_source text, created_by_ops_member_id uuid, title text);
    insert into public.merchant_profiles values ('${id(11)}','${id(1)}','active'), ('${id(12)}','${id(2)}','suspended'), ('${id(13)}','${id(3)}','pending');
    insert into public.kinnso_ops_members values ('${id(14)}','${id(4)}','active'), ('${id(15)}','${id(5)}','suspended');
    insert into public.missions (id,merchant_profile_id,mission_source) values ('${id(21)}','${id(11)}','merchant'), ('${id(22)}','${id(12)}','merchant');
    alter table public.merchant_profiles enable row level security;
    alter table public.kinnso_ops_members enable row level security;
    alter table public.missions enable row level security;
    create policy self_read on public.merchant_profiles for select to authenticated using(user_id = auth.uid());
    create policy self_read on public.kinnso_ops_members for select to authenticated using(user_id = auth.uid());
    -- Widen only fixture reads to isolate write authorization in this test.
    create policy fixture_read on public.missions for select to authenticated using(true);
    grant select on public.merchant_profiles, public.kinnso_ops_members to authenticated;
    grant select, insert, update on public.missions to authenticated;
    ${policies}
  `)
  allow('baseline reproduces suspended merchant insert', 2, insert(12))
  changed('baseline reproduces suspended merchant update', 2, 22, 1)
  ok(`
    create role anon;
    create schema app_private;
    create table mission_participants(id uuid, mission_id uuid);
    create table mission_settlements(mission_id uuid);
    create table affiliate_partner_links(mission_id uuid);
    create table affiliate_network_events(mission_id uuid);
    create table mission_social_snapshots(mission_id uuid);
    create table mission_milestone_submissions(id uuid, mission_participant_id uuid);
    create table mission_review_events(submission_id uuid, actor_type text, actor_id uuid, action text, reason_category text, reason_text text);
    insert into mission_participants values ('${id(31)}','${id(22)}');
    insert into mission_milestone_submissions values ('${id(41)}','${id(31)}');
    insert into missions(id,merchant_profile_id,mission_source) values ('${id(23)}','${id(12)}','merchant');
  `)
  const deletionSource = readFileSync(new URL('supabase/migrations/20260617212607_mission_rollback_helper.sql', root), 'utf8')
  ok(deletionSource.slice(deletionSource.indexOf('create or replace function')))
  ok('grant delete on missions to authenticated;')
  const reviewSource = readFileSync(new URL('supabase/migrations/20260819090150_r11_0_mission_review_event_merchant_append.sql', root), 'utf8')
  ok(reviewSource.slice(reviewSource.indexOf('create or replace function')))
  assert.equal(ok(as(2, `select app_private.can_delete_empty_mission('${id(23)}');`)), 't')
  allow('baseline suspended owner can append review history', 2, `select mission_review_event_append('${id(41)}','approve',null);`)
  // Rehearse the catalog-bound envelope, including rollback on a failed final
  // check. This fixture catalog is NOT a production authorization fingerprint.
  const catalogQuery = `select md5(jsonb_build_object('functions', (select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='app_private' and p.proname='can_delete_empty_mission') or (n.nspname='public' and p.proname='mission_review_event_append')), 'policies',(select jsonb_agg(to_jsonb(x) order by policyname) from pg_policies x where schemaname='public' and tablename='missions'))::text)`
  const baseline = ok('set search_path=pg_catalog; '+catalogQuery)
  const payload = migration.replace(/^begin;\r?$/m, '').replace(/commit;\s*$/, '')
  const committed = ok(`begin; set local search_path=pg_catalog; ${payload}\n${catalogQuery}; rollback;`)
  const candidate = {sql:payload,sha256:createHash('sha256').update(payload).digest('hex')}
  assert.equal(ok('set search_path=pg_catalog; '+catalogQuery), baseline)
  const wrong = '00000000000000000000000000000000'
  const failed = sql(buildMigrationTransaction(candidate,{catalogQuery,baseline,committed:wrong,acknowledgment:'KINNSO_COMMIT_ACK_FIXTURE_FAILURE'}))
  assert.notEqual(failed.status,0)
  assert.match(failed.stderr,/MIGRATION_POSTCHECK_FAILED/)
  assert.equal(ok('set search_path=pg_catalog; '+catalogQuery),baseline)
  checks++; console.log('PASS failed envelope postcheck rolls back every change')
  const envelope = buildMigrationTransaction(candidate,{catalogQuery,baseline,committed,acknowledgment:'KINNSO_COMMIT_ACK_FIXTURE_SUCCESS'})
  ok(envelope)
  assert.equal(ok('set search_path=pg_catalog; '+catalogQuery),committed)
  checks++; console.log('PASS guarded envelope commit and independent catalog verification')
  const replay=sql(envelope)
  assert.notEqual(replay.status,0)
  assert.match(replay.stderr,/MIGRATION_BASELINE_CHANGED/)
  checks++; console.log('PASS completed envelope cannot be replayed')
  const evidence=new URL(`.local-private/envelope-${name}/`,root)
  mkdirSync(evidence,{recursive:true})
  writeFileSync(new URL('fixture-envelope.sql',evidence),envelope)
  writeFileSync(new URL('result.json',evidence),JSON.stringify({scope:'ISOLATED_FIXTURE_ONLY',baseline,committed,payloadSha256:candidate.sha256,envelopeSha256:createHash('sha256').update(envelope).digest('hex'),rollback:'PASS',commit:'PASS',postcheck:'PASS',replayDenied:'PASS',productionChanged:false},null,2))
  assert.equal(ok(as(2, `with removed as (delete from missions where id='${id(23)}' returning id) select count(*) from removed;`)), '0')
  checks++; console.log('PASS suspended owner cannot delete campaign')
  const deniedReview = sql(as(2, `select mission_review_event_append('${id(41)}','approve',null);`))
  assert.notEqual(deniedReview.status, 0)
  assert.match(deniedReview.stderr, /forbidden/)
  checks++; console.log('PASS suspended owner cannot append review history')
  deny('suspended merchant insert denied', 2, insert(12))
  deny('pending merchant insert denied', 3, insert(13))
  changed('suspended merchant update denied', 2, 22, 0)
  allow('active owner insert allowed', 1, insert(11))
  changed('active owner update allowed', 1, 21, 1)
  deny('foreign merchant insert denied', 1, insert(12))
  changed('foreign merchant update denied', 1, 22, 0)
  changed('active operations can update suspended merchant campaign', 4, 22, 1)
  changed('inactive operations update denied', 5, 22, 0)
  allow('active operations travelpayouts insert allowed', 4, insert(null, 'travelpayouts', `'${id(14)}'`))
  deny('inactive operations travelpayouts insert denied', 5, insert(null, 'travelpayouts', `'${id(15)}'`))
  deny('merchant cannot transfer campaign to foreign merchant', 1, `update public.missions set merchant_profile_id = '${id(12)}' where id = '${id(21)}';`)
  ok(`update public.merchant_profiles set status = 'suspended' where id = '${id(11)}';`)
  changed('subsequent write sees newly committed suspension', 1, 21, 0)
  ok(`update public.merchant_profiles set status = 'active' where id in ('${id(11)}','${id(12)}');`)
  deny('active company A cannot insert for active company B', 1, insert(12))
  deny('active company B cannot insert for active company A', 2, insert(11))
  changed('active company A cannot update company B', 1, 22, 0)
  changed('active company B cannot update company A', 2, 21, 0)
  allow('company B retains its own write access', 2, insert(12))
  ok(`update public.kinnso_ops_members set status = 'suspended' where id = '${id(14)}';`)
  changed('previously authorized operations actor loses write access', 4, 22, 0)

  allow('active owner retains review history writes', 2, `select mission_review_event_append('${id(41)}','approve',null);`)
  const foreignReview = sql(as(1, `select mission_review_event_append('${id(41)}','approve',null);`))
  assert.notEqual(foreignReview.status, 0)
  assert.match(foreignReview.stderr, /forbidden/)
  checks++; console.log('PASS foreign merchant cannot append review history')
  assert.equal(ok(as(2, `with removed as (delete from missions where id='${id(23)}' returning id) select count(*) from removed;`)), '1')
  checks++; console.log('PASS active owner can delete empty campaign')
  assert.equal(ok(as(2, `with removed as (delete from missions where id='${id(22)}' returning id) select count(*) from removed;`)), '0')
  checks++; console.log('PASS campaign with participants cannot be deleted')

  // Keep an authenticated transaction open while another connection suspends
  // the merchant. Synchronize on psql output, not an arbitrary sleep.
  await new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let output = '', errors = '', resumed = false
    const timeout = setTimeout(() => { child.kill(); reject(new Error('concurrency test timeout')) }, 20000)
    child.stderr.on('data', data => { errors += data })
    child.stdout.on('data', data => {
      output += data
      if (!resumed && output.includes('READY')) {
        resumed = true
        try {
          ok(`update merchant_profiles set status='suspended' where id='${id(12)}';`)
          child.stdin.end(`select mission_review_event_append('${id(41)}','approve',null); commit;\n`)
        } catch (error) { child.kill(); reject(error) }
      }
    })
    child.on('error', error => { clearTimeout(timeout); reject(error) })
    child.on('close', code => {
      clearTimeout(timeout)
      try {
        assert.ok(resumed)
        assert.notEqual(code, 0)
        assert.match(errors, /forbidden/)
        checks++; console.log('PASS open read-committed transaction sees concurrent suspension before review write')
        resolve()
      } catch (error) { reject(error) }
    })
    child.stdin.write(as(2, "begin isolation level read committed; select count(*) from merchant_profiles; select 'READY';\n"))
  })

  for (const [label, statement] of [
    ['review', `select mission_review_event_append('${id(41)}','approve',null);`],
    ['deletion authorization', `select app_private.can_delete_empty_mission('${id(22)}');`],
  ]) {
    ok(`update merchant_profiles set status='active' where id='${id(12)}';`)
    await new Promise((resolve, reject) => {
      const actor = spawn('docker', ['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'])
      let output = '', started = false
      const timer = setTimeout(() => { actor.kill(); reject(new Error('in-flight race timeout')) }, 20000)
      actor.on('error', reject)
      actor.stdout.on('data', async data => {
        output += data
        if (started || !output.includes('LOCK_READY')) return
        started = true
        const suspension = spawn('docker', ['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'])
        const finished = new Promise((done, fail) => { suspension.on('error', fail); suspension.on('close', code => code === 0 ? done() : fail(new Error('suspension failed'))) })
        suspension.stdin.end(`set application_name='suspension-race'; update merchant_profiles set status='suspended' where id='${id(12)}';`)
        try {
          let blocked = false
          for (let attempt=0; attempt<20; attempt++) {
            blocked = ok("select exists(select 1 from pg_stat_activity where application_name='suspension-race' and wait_event_type='Lock');") === 't'
            if (blocked) break
            await new Promise(done => setTimeout(done, 100))
          }
          assert.ok(blocked, `${label}: suspension must wait for the authorized in-flight transaction`)
          actor.stdin.end('commit;\n')
          await finished
          assert.equal(ok(`select status from merchant_profiles where id='${id(12)}';`), 'suspended')
          checks++; console.log(`PASS in-flight ${label} serializes before suspension commit`)
          clearTimeout(timer); resolve()
        } catch (error) { actor.stdin.end('rollback;\n'); await finished.catch(() => {}); clearTimeout(timer); reject(error) }
      })
      actor.stdin.write(as(2, `begin; ${statement} select 'LOCK_READY';\n`))
    })
  }

  // Restore the policy fixture into a separate database, preserving role and
  // RLS ownership behavior. This is not a full application recovery drill.
  const dump = docker(['exec', name, 'pg_dump', '-U', 'postgres', '--no-owner', 'postgres'])
  assert.equal(dump.status, 0, dump.stderr)
  ok('create database restored_policy_fixture;')
  const restored = docker(['exec', '-i', name, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'restored_policy_fixture'], dump.stdout)
  assert.equal(restored.status, 0, restored.stderr)
  const restoredWrite = docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'restored_policy_fixture'], as(1, insert(12)))
  assert.notEqual(restoredWrite.status, 0)
  assert.match(restoredWrite.stderr, /row-level security/)
  checks++; console.log('PASS restored fixture retains cross-company write denial')
  console.log(`${checks} checks passed. Full migration chain, concurrent suspension, and hosted API acceptance remain separate.`)
} finally {
  const stopped = docker(['stop', name])
  console.log(`Retained test container ${name}; stopped=${stopped.status === 0}.`)
}
