import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { requireWorkerSupabaseTarget, requireSyntheticMysqlTarget } from '../scripts/worker-test-target.mjs';
import { runtimeFixture, targetEnv } from '../apps/journeys/tests/helpers/target-runtime.mjs';

const secret = 'synthetic-test-secret-never-used-outside-this-fixture';
const jwt = (role, key = secret) => {
  const message = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'), Buffer.from(JSON.stringify({ role })).toString('base64url')].join('.');
  return message + '.' + createHmac('sha256', key).update(message).digest('base64url');
};
function fixture(project) {
  const docker = runtimeFixture(project);
  docker.containers[3].Config.Env.push('GOTRUE_JWT_SECRET=' + secret);
  docker.containers[2].Config.Env.push('PGRST_JWT_SECRET=' + JSON.stringify({ keys: [{ kty: 'oct', k: Buffer.from(secret).toString('base64url') }] }));
  const env = { ...targetEnv(project), KINNSO_RUN_WORKER_DB_TESTS: '1', KINNSO_WORKER_TEST_DATA: 'synthetic', SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') };
  return { docker, env };
}

test('attests the actual isolated route and signing keys before returning client inputs', () => {
  const { docker, env } = fixture();
  const result = requireWorkerSupabaseTarget(env, docker.run);
  assert.equal(result.url, env.SUPABASE_URL);
  assert.equal(result.serviceRoleKey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(result.identity.authId, docker.containers[3].Id);
});

test('accepts canonical CI only with CI=true and its attested port/container', () => {
  const { docker, env } = fixture('kinnso-v3');
  for (const key of ['SUPABASE_URL', 'KINNSO_TEST_API_ORIGIN']) env[key] = 'http://127.0.0.1:54421';
  docker.containers[1].NetworkSettings.Ports['8000/tcp'][0].HostPort = '54421';
  assert.throws(() => requireWorkerSupabaseTarget(env, docker.run), /BLOCKED/);
  assert.equal(requireWorkerSupabaseTarget({ ...env, CI: 'true' }, docker.run).projectRef, 'kinnso-v3');
});

test('credentials alone, cloud/mismatched origins and missing synthetic attestation fail without Docker', () => {
  const { env } = fixture();
  for (const change of [
    { KINNSO_RUN_WORKER_DB_TESTS: undefined }, { KINNSO_WORKER_TEST_DATA: undefined },
    { KINNSO_TEST_TARGET: 'cloud' }, { SUPABASE_URL: 'https://unapproved.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://unapproved.supabase.co' },
    { KINNSO_TEST_PROJECT: 'unknown' }, { SUPABASE_ANON_KEY: undefined }, { SUPABASE_SERVICE_ROLE_KEY: undefined },
  ]) {
    let calls = 0;
    assert.throws(() => requireWorkerSupabaseTarget({ ...env, ...change }, () => { calls++; throw Error('unexpected Docker'); }), /BLOCKED/);
    assert.equal(calls, 0);
  }
});

test('cloud-signed, swapped-role, unsigned credentials fail on an otherwise attested target', () => {
  const { docker, env } = fixture();
  for (const change of [
    { SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', 'different-cloud-signing-secret') },
    { SUPABASE_ANON_KEY: jwt('anon', 'different-cloud-signing-secret') },
    { SUPABASE_SERVICE_ROLE_KEY: jwt('anon') }, { SUPABASE_ANON_KEY: jwt('service_role') },
    { SUPABASE_SERVICE_ROLE_KEY: 'header.payload.' },
  ]) assert.throws(() => requireWorkerSupabaseTarget({ ...env, ...change }, docker.run), /BLOCKED/);
  docker.containers[2].Config.Env[1] = 'PGRST_JWT_SECRET=different-rest-secret';
  assert.throws(() => requireWorkerSupabaseTarget(env, docker.run), /BLOCKED/);
});

test('unavailable or changed Docker identity fails closed without exposing stderr or secrets', () => {
  const { docker, env } = fixture();
  assert.throws(() => requireWorkerSupabaseTarget(env, () => { throw Error(secret); }), value => !value.message.includes(secret) && /BLOCKED/.test(value.message));
  docker.containers[2].Config.Env[0] = 'PGRST_DB_URI=postgresql://role:secret@cloud.invalid:5432/postgres';
  assert.throws(() => requireWorkerSupabaseTarget(env, docker.run), /BLOCKED/);
});

test('reader accepts only the ephemeral, labeled, loopback synthetic MySQL fixture with matching credentials', () => {
  const { env, docker } = fixture();
  const target = requireWorkerSupabaseTarget(env, docker.run);
  const name = 'kinnso_worker_mysql_' + target.projectRef;
  const mysqlEnv = { ...env, LEGACY_DB_HOST: '127.0.0.1', LEGACY_DB_PORT: '58432', LEGACY_DB_DATABASE: 'kinnso_sync_test', LEGACY_DB_USERNAME: 'kinnso_test', LEGACY_DB_PASSWORD: 'synthetic-password', LEGACY_DB_SSL: 'disable' };
  const mysql = { Id: 'f'.repeat(64), Name: '/' + name, State: { Running: true }, HostConfig: { NetworkMode: 'bridge' },
    Config: { Labels: { 'com.kinnso.test-data': 'synthetic', 'com.kinnso.test-project': target.projectRef }, Env: ['MYSQL_DATABASE=kinnso_sync_test', 'MYSQL_USER=kinnso_test', 'MYSQL_PASSWORD=synthetic-password'] },
    NetworkSettings: { Ports: { '3306/tcp': [{ HostIp: '127.0.0.1', HostPort: '58432' }] } }, Mounts: [{ Type: 'tmpfs' }] };
  const run = (_command, args) => args[0] === 'inspect' ? JSON.stringify([mysql]) : mysql.Id + ' ' + name;
  assert.equal(requireSyntheticMysqlTarget(mysqlEnv, target, run).database, 'kinnso_sync_test');
  for (const change of [{ LEGACY_DB_HOST: 'cloud.invalid' }, { LEGACY_DB_PASSWORD: 'wrong' }, { LEGACY_DB_PORT: '3306' }, { LEGACY_DB_DATABASE: 'production' }]) {
    assert.throws(() => requireSyntheticMysqlTarget({ ...mysqlEnv, ...change }, target, run), /BLOCKED/);
  }
  mysql.Mounts = [{ Type: 'bind' }];
  assert.throws(() => requireSyntheticMysqlTarget(mysqlEnv, target, run), /BLOCKED/);
});
