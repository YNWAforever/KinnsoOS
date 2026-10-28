import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Fresh socket-only cluster, owned by this process. No configured service,
// .env, DB URL, Supabase CLI, Docker context or production credential is used.
let bin;
try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch { /* local prerequisite */ }
const available = bin && ['initdb', 'pg_ctl', 'psql'].every(name => existsSync(path.join(bin, name)));
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
const owner = id(1);
const other = id(2);
const migration = '20261029090000_aud_04_08_worker_launch_reservations.sql';

test('AUD-04/08 reservations on fresh isolated PostgreSQL', { skip: !available && 'PostgreSQL server binaries unavailable', timeout: 60000 }, async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'kinnso-aud-worker-quota-'));
  const data = path.join(root, 'data');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  const execute = (name, args, options = {}) => execFileSync(path.join(bin, name), args, { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, ...options });
  const args = ['-X', '-h', root, '-U', 'kinnso_quota_test_owner', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
  const sql = input => execute('psql', args, { input }).trim();
  const asyncSql = input => new Promise((resolve, reject) => {
    const child = spawn(path.join(bin, 'psql'), args, { env: { ...env, PGAPPNAME: 'kinnso-quota-racer' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error(error)));
    child.stdin.end(input);
  });
  // Hold the owner's lock until EVERY independent connection is waiting on it.
  // This forces the race, rather than hoping process scheduling overlaps.
  const race = async queries => {
    const gate = spawn(path.join(bin, 'psql'), args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const closed = new Promise((resolve, reject) => { gate.on('close', resolve); gate.on('error', reject); });
    await new Promise((resolve, reject) => {
      let output = '';
      gate.stdout.on('data', chunk => { output += chunk; if (output.includes('LOCKED')) resolve(); });
      gate.on('error', reject);
      gate.stdin.write(`begin; select id from public.creators where id='${owner}' for update; select 'LOCKED';\n`);
    });
    const pending = Promise.all(queries.map(asyncSql));
    try {
      const deadline = Date.now() + 8000;
      while (Number(sql("select count(*) from pg_stat_activity where application_name='kinnso-quota-racer' and wait_event_type='Lock';")) < queries.length) {
        assert.ok(Date.now() < deadline, 'all contenders must wait on owner serialization');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally {
      gate.stdin.end('commit;\n');
      await closed;
    }
    return pending;
  };
  const request = (kind, { job, sub, creator = owner, platform } = {}) => `set role service_role;
    select row_to_json(r) from public.reserve_worker_launch('${kind}', '${creator}', ${job ? "'" + job + "'" : 'null'}, ${sub ? "'" + sub + "'" : 'null'}, ${platform ? "'" + platform + "'" : 'null'}) r;`;
  const launch = (kind, options) => JSON.parse(sql(request(kind, options)));
  const reset = () => sql('truncate public.worker_launch_reservations, public.mission_verification_jobs, public.creator_scan_jobs cascade;');
  const spend = (kind, n) => sql(`insert into public.worker_launch_reservations(creator_id,kind,job_id)
    select '${owner}','${kind}',gen_random_uuid() from generate_series(1,${n});`);
  const count = () => Number(sql('select count(*) from public.worker_launch_reservations;'));
  const fail = (kind, job) => sql(`update public.${kind === 'scan' ? 'creator_scan_jobs' : 'mission_verification_jobs'} set status='failed' where id='${job}';`);
  let started = false;
  try {
    execute('initdb', ['-D', data, '-U', 'kinnso_quota_test_owner', '-A', 'trust', '--no-locale']);
    execute('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${root}' -c unix_socket_permissions=0700`, '-w', 'start']);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls; create role untrusted;
      grant usage on schema public to anon, authenticated, service_role, untrusted;
      alter default privileges in schema public grant all on tables to service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select null::uuid';`);
    for (const file of ['20260614000009_creator_tables.sql', '20260614000010_creator_triggers.sql', '20260614000015_creator_scan_jobs_single_active.sql']) sql(read('supabase/migrations/' + file));
    sql(`create table public.mission_participants(id uuid primary key, creator_id uuid references public.creators(id));
      create table public.mission_milestone_submissions(id uuid primary key, mission_participant_id uuid references public.mission_participants(id), proof_urls text[] not null default '{}');
      create table public.mission_social_snapshots(platform text check (platform in ('instagram','threads')));`);
    for (const file of ['20260619000002_mission_verification_jobs.sql', '20260619000004_allow_youtube_verification.sql']) sql(read('supabase/migrations/' + file));
    sql(`insert into auth.users values('${owner}'),('${other}');
      insert into public.creators(id) values('${owner}'),('${other}');
      insert into public.creator_social_handles(creator_id,platform,handle) values('${owner}','instagram','synthetic');
      insert into public.mission_participants values('${id(10)}','${owner}'),('${id(11)}','${other}');
      insert into public.mission_milestone_submissions(id,mission_participant_id,proof_urls)
        select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'${id(10)}',array['https://www.instagram.com/p/synthetic/'] from generate_series(100,160) n;
      insert into public.creator_scan_jobs(creator_id,status,created_at,started_at)
        values('${owner}','failed',now()-interval '25 hours',now()-interval '1 hour');`);
    const forward = read('supabase/migrations/' + migration);
    sql(`begin;
${forward}
commit;`);

    await t.test('backfills the most recent known launch, then denies browser ledger/RPC mutation', () => {
      assert.equal(count(), 1);
      for (const role of ['anon', 'authenticated', 'untrusted']) {
        assert.equal(sql(`select has_function_privilege('${role}','public.reserve_worker_launch(text,uuid,uuid,uuid,text)','execute');`), 'f');
        assert.throws(() => sql(`set role ${role}; select * from public.reserve_worker_launch('scan','${owner}');`));
        for (const statement of ['select * from public.worker_launch_reservations', "insert into public.worker_launch_reservations(creator_id,kind,job_id) values('" + owner + "','scan',gen_random_uuid())", 'update public.worker_launch_reservations set reserved_at=now()', 'delete from public.worker_launch_reservations']) assert.throws(() => sql(`set role ${role}; ${statement};`));
      }
      assert.throws(() => sql(`set role service_role; delete from public.worker_launch_reservations;`));
    });

    await t.test('initial scan + retries charge three runs on one row; failure/deletion does not refund', () => {
      reset();
      const job = launch('scan').job_id;
      assert.ok(job);
      for (let n = 0; n < 2; n++) { fail('scan', job); assert.equal(launch('scan', { job }).job_id, job); }
      fail('scan', job);
      assert.equal(launch('scan', { job }).reason, 'daily_quota_exceeded');
      assert.equal(count(), 3);
      assert.equal(sql('select count(*) from public.creator_scan_jobs;'), '1');
      sql('delete from public.creator_scan_jobs;');
      assert.equal(launch('scan').reason, 'daily_quota_exceeded');
      sql("update public.worker_launch_reservations set reserved_at=now()-interval '25 hours';");
      assert.ok(launch('scan').job_id, '24h expiry restores allowance');
    });

    await t.test('parallel initial scan versus retries share the last daily allowance', async () => {
      reset();
      const job = launch('scan').job_id;
      fail('scan', job); spend('scan', 1);
      const results = await race([request('scan'), request('scan', { job }), request('scan', { job })]);
      assert.equal(results.filter(r => r.job_id).length, 1);
      assert.equal(count(), 3);
    });

    await t.test('same-row parallel scan retries launch exactly once', async () => {
      reset(); const job = launch('scan').job_id; fail('scan', job);
      const results = await race(Array.from({ length: 5 }, () => request('scan', { job })));
      assert.equal(results.filter(r => r.job_id).length, 1);
      assert.ok(results.filter(r => r.reason).every(r => r.reason === 'job_not_retryable'));
      assert.equal(count(), 2);
    });

    await t.test('parallel distinct submissions respect one remaining owner concurrency slot', async () => {
      reset(); launch('verification', { sub: id(100) }); launch('verification', { sub: id(101) });
      const results = await race(Array.from({ length: 8 }, (_, n) => request('verification', { sub: id(102 + n) })));
      assert.equal(results.filter(r => r.job_id).length, 1);
      assert.ok(results.filter(r => r.reason).every(r => r.reason === 'too_many_active_jobs'));
      assert.equal(count(), 3);
      assert.equal(sql("select count(*) from public.mission_verification_jobs where status='queued';"), '3');
    });

    await t.test('parallel distinct submissions and retries share the last daily allowance', async () => {
      reset(); const job = launch('verification', { sub: id(100) }).job_id;
      fail('verification', job); spend('verification', 18);
      const results = await race([request('verification', { job }), ...Array.from({ length: 6 }, (_, n) => request('verification', { sub: id(101 + n) }))]);
      assert.equal(results.filter(r => r.job_id).length, 1);
      assert.equal(count(), 20);
      sql("update public.mission_verification_jobs set status='failed'; update public.worker_launch_reservations set reserved_at=now()-interval '25 hours';");
      assert.ok(launch('verification', { job }).job_id);
    });

    await t.test('parallel distinct retries respect remaining verification concurrency', async () => {
      reset();
      const a = launch('verification', { sub: id(100) }).job_id; fail('verification', a);
      const b = launch('verification', { sub: id(101) }).job_id; fail('verification', b);
      launch('verification', { sub: id(102) }); launch('verification', { sub: id(103) });
      const results = await race([request('verification', { job: a }), request('verification', { job: b })]);
      assert.equal(results.filter(r => r.job_id).length, 1);
      assert.equal(results.filter(r => r.reason === 'too_many_active_jobs').length, 1);
      assert.equal(count(), 5);
    });

    await t.test('per-submission uniqueness and same-row retry remain atomic without rejected charges', async () => {
      reset();
      const first = await race(Array.from({ length: 4 }, () => request('verification', { sub: id(100) })));
      assert.equal(first.filter(r => r.job_id).length, 1);
      assert.ok(first.filter(r => r.reason).every(r => r.reason === 'verification_already_in_progress'));
      const job = first.find(r => r.job_id).job_id;
      fail('verification', job);
      const retried = await race(Array.from({ length: 4 }, () => request('verification', { job })));
      assert.equal(retried.filter(r => r.job_id).length, 1);
      assert.ok(retried.filter(r => r.reason).every(r => r.reason === 'job_not_retryable'));
      assert.equal(count(), 2);
    });

    await t.test('owners and job kinds retain separate allowances within the shared model', () => {
      reset(); spend('scan', 3); spend('verification', 20);
      assert.equal(launch('scan').reason, 'daily_quota_exceeded');
      assert.equal(launch('verification', { sub: id(100) }).reason, 'daily_quota_exceeded');
      assert.equal(launch('verification', { sub: id(100), creator: other }).reason, 'submission_not_found');
      sql(`insert into public.mission_milestone_submissions values('${id(200)}','${id(11)}','{}');`);
      assert.ok(launch('verification', { sub: id(200), creator: other }).job_id);
      reset(); spend('scan', 3);
      assert.ok(launch('verification', { sub: id(100) }).job_id);
      assert.equal(launch('scan', { creator: other }).reason, 'no_social_handles');
    });

    await t.test('missing/foreign/terminal jobs never reserve quota', () => {
      reset(); const job = launch('scan').job_id;
      assert.equal(launch('scan', { job, creator: other }).reason, 'job_not_found');
      assert.equal(launch('verification', { job }).reason, 'job_not_found');
      assert.equal(launch('scan', { job: id(999) }).reason, 'job_not_found');
      sql(`update public.creator_scan_jobs set status='ready' where id='${job}';`);
      assert.equal(launch('scan', { job }).reason, 'job_not_retryable');
      assert.equal(count(), 1);
    });

    await t.test('stale scan and verification recovery retires unique-index blockers without refunding history', () => {
      reset(); const scan = launch('scan').job_id;
      sql(`alter table public.creator_scan_jobs disable trigger creator_scan_jobs_set_updated_at;
        update public.creator_scan_jobs set updated_at=now()-interval '16 minutes';
        alter table public.creator_scan_jobs enable trigger creator_scan_jobs_set_updated_at;`);
      assert.equal(launch('scan', { job: scan }).job_id, scan);
      const job = launch('verification', { sub: id(100) }).job_id;
      sql("update public.mission_verification_jobs set updated_at=now()-interval '16 minutes';");
      assert.ok(launch('verification', { sub: id(100) }).job_id);
      assert.equal(sql(`select status from public.mission_verification_jobs where id='${job}';`), 'failed');
      assert.equal(count(), 4);
    });

    await t.test('job or ledger errors and transaction rollback commit neither charge nor job/reset', () => {
      reset();
      assert.throws(() => launch('verification', { sub: id(100), platform: 'invalid' }));
      assert.equal(count(), 0);
      sql(`create function public.reject_test_reservation() returns trigger language plpgsql as $$ begin raise exception 'synthetic ledger failure'; end $$;
        create trigger reject_test_reservation before insert on public.worker_launch_reservations for each row execute function public.reject_test_reservation();`);
      assert.throws(() => launch('scan'));
      assert.equal(sql('select count(*) from public.creator_scan_jobs;'), '0');
      sql('drop trigger reject_test_reservation on public.worker_launch_reservations; drop function public.reject_test_reservation();');
      sql(`begin; ${request('scan')} rollback;`);
      assert.equal(count(), 0);
      const job = launch('scan').job_id; fail('scan', job);
      sql(`begin; ${request('scan', { job })} rollback;`);
      assert.equal(sql(`select status from public.creator_scan_jobs where id='${job}';`), 'failed');
      assert.equal(count(), 1);
    });

    await t.test('unsupported isolation fails closed before initial or retry mutations for either kind', () => {
      for (const isolation of ['repeatable read', 'serializable', 'read uncommitted']) {
        for (const kind of ['scan', 'verification']) {
          reset();
          const table = kind === 'scan' ? 'creator_scan_jobs' : 'mission_verification_jobs';
          const initial = kind === 'scan' ? {} : { sub: id(100) };
          const attempt = options => sql(`begin isolation level ${isolation}; ${request(kind, options)} commit;`);
          assert.throws(() => attempt(initial), /worker launch reservations require READ COMMITTED/);
          assert.equal(count(), 0);
          assert.equal(sql(`select count(*) from public.${table};`), '0');

          const job = launch(kind, initial).job_id;
          fail(kind, job);
          assert.throws(() => attempt({ job }), /worker launch reservations require READ COMMITTED/);
          assert.equal(count(), 1);
          assert.equal(sql(`select status from public.${table} where id='${job}';`), 'failed');
        }
      }
      reset();
    });

    await t.test('rollback disables reservations and preserves jobs/history; function-only reapply restores enforcement', () => {
      reset();
      const job = launch('scan').job_id;
      fail('scan', job);
      const before = count();
      const jobs = sql('select count(*) from public.creator_scan_jobs;');
      sql(`begin;
${read('supabase/rollbacks/' + migration)}
commit;`);
      assert.throws(() => launch('scan'));
      assert.equal(count(), before);
      assert.equal(sql('select count(*) from public.creator_scan_jobs;'), jobs);
      sql(forward.slice(forward.indexOf('create function public.reserve_worker_launch')));
      assert.ok(launch('scan').job_id);
      assert.equal(count(), before + 1);
      assert.throws(() => sql(`begin isolation level repeatable read; ${request('verification', { sub: id(100) })} commit;`), /worker launch reservations require READ COMMITTED/);
      assert.equal(count(), before + 1);
    });
  } finally {
    if (started) execute('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
