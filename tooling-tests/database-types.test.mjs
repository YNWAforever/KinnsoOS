import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGenerationTarget, addNullableDefaults } from '../scripts/gen-kinnso-local-types.mjs';

const local = {
  KINNSO_TEST_TARGET: 'local', KINNSO_TEST_PROJECT: 'kinnsoos-b1-20261002',
  SUPABASE_URL: 'http://127.0.0.1:58421',
  SUPABASE_DB_CONTAINER: 'supabase_db_kinnsoos-b1-20261002',
  KINNSO_LOCAL_STACK_DIR: 'C:/verified/local-stack',
};

test('type generation resolves the approved isolated stack without a sibling-checkout dependency', () => {
  assert.deepEqual(resolveGenerationTarget(local, 'C:/checkout'), {
    project: local.KINNSO_TEST_PROJECT, container: local.SUPABASE_DB_CONTAINER,
    url: local.SUPABASE_URL, workdir: local.KINNSO_LOCAL_STACK_DIR,
  });
});

test('CI type generation uses only the checkout-owned local stack', () => {
  const env = { CI: 'true', KINNSO_TEST_TARGET: 'local', KINNSO_TEST_PROJECT: 'kinnso-v3',
    SUPABASE_URL: 'http://127.0.0.1:54421', SUPABASE_DB_CONTAINER: 'supabase_db_kinnso-v3' };
  assert.equal(resolveGenerationTarget(env, 'C:/checkout').workdir, 'C:/checkout');
  assert.throws(() => resolveGenerationTarget({ ...env, CI: 'false' }, 'C:/checkout'), /BLOCKED/);
});

test('type generation refuses cloud URLs, target mismatches and an implicit local workdir', () => {
  for (const override of [ { SUPABASE_URL: 'https://cloud.supabase.co' },
    { KINNSO_TEST_TARGET: 'production' }, { KINNSO_TEST_PROJECT: 'other' },
    { SUPABASE_DB_CONTAINER: 'supabase_db_other' }, { KINNSO_LOCAL_STACK_DIR: undefined } ]) {
    assert.throws(() => resolveGenerationTarget({ ...local, ...override }, 'C:/checkout'), /BLOCKED/);
  }
});

test('generation retains nullable RPC defaults without weakening unrelated arguments', () => {
  const input = '      update_trip: {\n        Args: { p_note?: string; p_id: string }\n      }\n';
  const result = addNullableDefaults(input, [{ name: 'update_trip', args: 'p_note text DEFAULT NULL, p_id uuid' }]);
  assert.match(result, /p_note\?: string \| null/);
  assert.match(result, /p_id: string/);
  assert.equal(addNullableDefaults(result, [{ name: 'update_trip', args: 'p_note text DEFAULT NULL' }]), result);
});
