import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localConfiguration, localTestEnvironment } from '../scripts/prepare-connected-ci.mjs';
const jwt = role => `test.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.test`;
const status = () => ({ API_URL: 'http://127.0.0.1:58421', ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role') });
test('CI configuration uses the isolated owned target and disables application seeds', () => {
 const config = localConfiguration('project_id = "kinnso-v3"\n[api]\nport = 54421\n[db]\nport = 54422\nshadow_port = 54420\n[db.seed]\nenabled = true\nsql_paths = ["./seed.sql"]\n[auth]\nsite_url = "http://127.0.0.1:3000"\n');
 assert.match(config, /project_id = "kinnsoos-b1-20261002"/); assert.match(config, /port = 58421/); assert.match(config, /shadow_port = 58420/); assert.match(config, /\[db.seed\]\nenabled = false/);
 assert.throws(() => localConfiguration('project_id = "unknown"\n[api]\nport = 54421\n'));
});
test('CI refuses a remote status URL, mismatched ownership or privileged publishable input before writing environment files', () => {
 for (const value of [{ ...status(), API_URL: 'https://production.supabase.co' }, { ...status(), ANON_KEY: jwt('service_role') }, { ...status(), SERVICE_ROLE_KEY: jwt('anon') }]) assert.throws(() => localTestEnvironment(value, 'kinnsoos-b1-20261002'));
 assert.throws(() => localTestEnvironment(status(), 'unrelated-local-project'));
 const env = localTestEnvironment(status(), 'kinnsoos-b1-20261002'); assert.equal(env.KINNSO_SUPABASE_URL, 'http://127.0.0.1:58421'); assert.equal(env.KINNSO_SUPABASE_PUBLISHABLE_KEY, status().ANON_KEY); assert.equal(env.KINNSO_TEST_TARGET, 'local'); assert.equal(env.KINNSO_SITE_URL, 'http://127.0.0.1:3495'); assert.match(env.KINNSO_ENABLED_CAPABILITIES, /creator/);
});
