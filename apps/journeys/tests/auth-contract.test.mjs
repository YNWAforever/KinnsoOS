import { test } from 'node:test';
import assert from 'node:assert/strict';
const auth = await import('../lib/auth/return-path.ts').catch(() => ({}));
test('safe return preserves a local task and rejects foreign or encoded navigation', () => {
  assert.equal(typeof auth.safeReturnPath, 'function');
  assert.equal(auth.safeReturnPath('/en/trips/123?intent=save', 'en'), '/en/trips/123?intent=save');
  for (const value of ['https://evil.test/', '//evil.test/', '/\\evil.test',
    '/en/%2f%2fevil.test', '/en/../auth/callback', '/en/sign-in', '/en/%0aHeader:x']) {
    assert.equal(auth.safeReturnPath(value, 'en'), '/en/trips', value);
  }
});
const guard = await import('../scripts/verify-test-target.mjs').catch(() => ({}));
test('integration target fails closed before any database writes', () => {
  assert.equal(typeof guard.verifyTestTarget, 'function');
  assert.throws(() => guard.verifyTestTarget({}));
  const env = { KINNSO_TEST_TARGET: 'local', KINNSO_TEST_PROJECT: 'kinnsoos-b1-20261002',
    SUPABASE_URL: 'http://127.0.0.1:58421',
    KINNSO_TEST_API_ORIGIN: 'http://127.0.0.1:58421', KINNSO_TEST_DB_CONTAINER: 'supabase_db_kinnsoos-b1-20261002' };
  assert.equal(guard.verifyTestTarget(env).apiOrigin, env.KINNSO_TEST_API_ORIGIN);
  for (const change of [{ KINNSO_TEST_TARGET: 'production' },
    { KINNSO_TEST_API_ORIGIN: 'https://unknown.supabase.co' },
    { KINNSO_TEST_PROJECT: 'kinnso-v3' }, { KINNSO_TEST_DB_CONTAINER: 'supabase_db_kinnso-v3' }]) {
    assert.throws(() => guard.verifyTestTarget({ ...env, ...change }));
  }
});
