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

const mailConfig = 'project_id = "kinnso-v3"\n[api]\nport = 54421\n[inbucket]\nenabled = false\nport = 54424\n[auth]\nsite_url = "http://127.0.0.1:3000"\n[auth.rate_limit]\nemail_sent = 2\n[auth.email]\nenable_confirmations = false\n';
test('a separate fresh CI mailbox profile requires confirmation without changing the original profile', () => {
 const original = localConfiguration(mailConfig);
 const captured = localConfiguration(mailConfig, { mailbox: true });
 assert.match(captured, /\[inbucket\]\nenabled = true\nport = 58424/);
 assert.match(captured, /\[auth.email\]\nenable_confirmations = true/);
 assert.match(captured, /\[auth.rate_limit\]\nemail_sent = 100/);
 assert.match(original, /\[inbucket\]\nenabled = false/);
 assert.match(original, /enable_confirmations = false/);
 assert.throws(() => localConfiguration(mailConfig + '[auth.email.smtp]\nenabled = true\nhost = "external.example"\n', { mailbox: true }));
});
test('the mailbox environment requires the exact local Mailpit origin and emits no external provider settings', () => {
 for (const origin of [undefined, 'https://production.example', 'http://127.0.0.1:54324', 'http://127.0.0.1:58424/']) {
  assert.throws(() => localTestEnvironment({ ...status(), MAILPIT_URL: origin }, 'kinnsoos-b1-20261002', { mailbox: true }));
 }
 const env = localTestEnvironment({ ...status(), MAILPIT_URL: 'http://127.0.0.1:58424' }, 'kinnsoos-b1-20261002', { mailbox: true });
 assert.equal(env.KINNSO_TEST_MAILBOX_ORIGIN, 'http://127.0.0.1:58424');
 assert.equal(env.KINNSO_TEST_EMAIL_CONFIRMATION, 'required');
 assert.equal(localTestEnvironment(status(), 'kinnsoos-b1-20261002').KINNSO_TEST_MAILBOX_ORIGIN, undefined);
});