import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Own a fresh, socket-only PostgreSQL cluster. Never consume configured DB URLs,
// credentials, Supabase workdirs or existing database services.
let bin;
try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch { /* optional local server tools */ }
const available = bin && ['initdb', 'pg_ctl', 'psql'].every(name => existsSync(path.join(bin, name)));
test('AUD-02 grants, server quota, expiry and rollback on a fresh isolated PostgreSQL cluster', { skip: !available && 'PostgreSQL server binaries unavailable' }, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kinnso-aud-rate-limit-'));
  const data = path.join(root, 'data');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  const execute = (name, args, options = {}) => execFileSync(path.join(bin, name), args, { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, ...options });
  const sql = input => execute('psql', ['-X', '-h', root, '-U', 'kinnso_aud_test_owner', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], { input });
  const read = filename => readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
  const forward = read('supabase/migrations/20261028090000_aud_02_server_only_rate_limits.sql');
  const rollback = read('supabase/rollbacks/20261028090000_aud_02_server_only_rate_limits.sql');
  let started = false;
  try {
    execute('initdb', ['-D', data, '-U', 'kinnso_aud_test_owner', '-A', 'trust', '--no-locale']);
    execute('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${root}' -c unix_socket_permissions=0700`, '-w', 'start']);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls; create role untrusted;
      grant usage on schema public to anon, authenticated, service_role, untrusted;
      alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant execute on functions to service_role;`);
    for (const [file, table, end] of [
      ['20260704120000_r3a2_stripe_webhook_confirmation_and_rate_limit.sql', 'checkout_rate_limits', 'create or replace function public.confirm_booking_from_webhook'],
      ['20260705120000_r4_agent_rate_limit_and_rating_rpc.sql', 'agent_rate_limits', 'create or replace function public.rate_agent_message'],
    ]) {
      const historical = read('supabase/migrations/' + file);
      const startIndex = historical.indexOf('create table public.' + table);
      const endIndex = historical.indexOf(end);
      assert.ok(startIndex >= 0 && endIndex > startIndex);
      sql(historical.slice(startIndex, endIndex));
    }
    // RED evidence from the exact historical functions: an anon caller resets a
    // denied bucket by selecting a negative window, before the fix is applied.
    assert.equal(sql(`set role anon;
      select public.check_and_increment_agent_rate_limit('historical',1,3600);
      select public.check_and_increment_agent_rate_limit('historical',1,3600);
      select public.check_and_increment_agent_rate_limit('historical',1,-1);`).trim(), 't\nf\nt');
    sql(forward);
    for (const kind of ['agent', 'checkout']) {
      const fn = `public.check_and_increment_${kind}_rate_limit`;
      for (const role of ['anon', 'authenticated', 'untrusted']) {
        assert.equal(sql(`select has_function_privilege('${role}','${fn}(text,integer,integer)','EXECUTE');`).trim(), 'f');
        sql(`set role ${role}; do $$ begin
          begin perform ${fn}('historical',999999,-1); raise exception 'mutation unexpectedly allowed';
          exception when insufficient_privilege then null; end;
          begin insert into public.${kind}_rate_limits(ip) values('victim'); raise exception 'insert unexpectedly allowed';
          exception when insufficient_privilege then null; end;
          begin update public.${kind}_rate_limits set request_count=0; raise exception 'update unexpectedly allowed';
          exception when insufficient_privilege then null; end;
          begin delete from public.${kind}_rate_limits; raise exception 'delete unexpectedly allowed';
          exception when insufficient_privilege then null; end;
        end $$;`);
      }
      const maximum = kind === 'agent' ? 20 : 5;
      const seconds = kind === 'agent' ? 3600 : 600;
      const allowed = sql(`set role service_role; select ${fn}('server',${maximum},${seconds}) from generate_series(1,${maximum + 1});`).trim().split('\n');
      assert.deepEqual(allowed, [...Array(maximum).fill('t'), 'f']);
      sql(`update public.${kind}_rate_limits set window_start=now()-interval '2 hours' where ip='server';`);
      assert.equal(sql(`set role service_role; select ${fn}('server',${maximum},${seconds});`).trim(), 't');
    }
    // Forward/rollback changes only grants, preserving the existing bucket state.
    assert.equal(sql("select request_count from public.agent_rate_limits where ip='historical';").trim(), '1');
    sql(rollback);
    for (const kind of ['agent', 'checkout']) {
      for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(sql(`select has_function_privilege('${role}','public.check_and_increment_${kind}_rate_limit(text,integer,integer)','EXECUTE');`).trim(), 't');
    }
    sql(forward);
    sql(forward);
    assert.equal(sql("select request_count from public.agent_rate_limits where ip='historical';").trim(), '1');
  } finally {
    if (started) execute('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  }
});
