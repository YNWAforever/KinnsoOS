// Payment-window expiry sweep: the scheduler route and the ops manual sweep. The
// database rule itself is exercised by local acceptance; these tests cover the
// credentials, origin binding, authorization and error mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const ops = '00000000-0000-4000-8000-000000000001';
const site = 'https://journeys.example';
const cronSecret = 'test-cron-secret-0123456789abcdefghij';
async function cronHandler() {
  const r = await build({ entryPoints: [fileURLToPath(new URL('../app/api/cron/payment-expiry/route.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['next/server', 'next/headers'], plugins: [{ name: 'stub-expiry', setup(b) {
    b.onResolve({ filter: /payments\/expiry$/ }, () => ({ path: 'fixture', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: 'export async function sweepExpiredPayments(){return globalThis.__sweep()} export async function sendPaymentReminders(){return globalThis.__remind()}' }));
  } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', r.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
async function opsHandler() {
  const r = await build({ entryPoints: [fileURLToPath(new URL('../app/api/ops/payments/sweep/route.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['next/server', 'next/headers'], plugins: [{ name: 'stub-supabase', setup(b) {
    b.onResolve({ filter: /supabase\/server$/ }, () => ({ path: 'fixture', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: 'export async function serverClient(){return globalThis.__sweepOpsClient}' }));
  } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', r.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const cron = await cronHandler();
const opsRoute = await opsHandler();
function env(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
}
const cronRequest = (token = `Bearer ${cronSecret}`, origin = site) => new Request(`${site}/api/cron/payment-expiry`, { headers: { Host: 'journeys.example', Authorization: token, Origin: origin } });

test('the scheduler route is a no-op without a scheduler credential', async (t) => {
  env(t, { KINNSO_SITE_URL: site, CRON_SECRET: undefined });
  let called = 0;
  globalThis.__sweep = async () => { called += 1; return { configured: true, expired: 1 }; };
  globalThis.__remind = async () => { called += 1; return { configured: true, reminded: 1 }; };
  t.after(() => { delete globalThis.__sweep; delete globalThis.__remind; });
  const response = await cron.GET(cronRequest());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.skipped, 'cron-secret-not-configured');
  assert.equal(payload.data.expired, 0);
  assert.equal(payload.data.reminded, 0);
  assert.equal(called, 0);
});

test('the scheduler route refuses a wrong credential and a foreign origin', async (t) => {
  env(t, { KINNSO_SITE_URL: site, CRON_SECRET: cronSecret });
  let called = 0;
  globalThis.__sweep = async () => { called += 1; return { configured: true, expired: 1 }; };
  globalThis.__remind = async () => { called += 1; return { configured: true, reminded: 1 }; };
  t.after(() => { delete globalThis.__sweep; delete globalThis.__remind; });
  const missing = await cron.GET(cronRequest(''));
  assert.equal(missing.status, 401);
  const wrong = await cron.GET(cronRequest('Bearer not-the-secret'));
  assert.equal(wrong.status, 401);
  const foreign = await cron.GET(new Request('https://evil.example/api/cron/payment-expiry', { headers: { Host: 'evil.example', Authorization: `Bearer ${cronSecret}` } }));
  assert.equal(foreign.status, 403);
  assert.equal(called, 0);
});

test('the scheduler route sweeps and reminds with the credential and reports both counts', async (t) => {
  env(t, { KINNSO_SITE_URL: site, CRON_SECRET: cronSecret });
  const calls = [];
  globalThis.__sweep = async () => { calls.push('sweep'); return { configured: true, expired: 3 }; };
  globalThis.__remind = async () => { calls.push('remind'); return { configured: true, reminded: 2 }; };
  t.after(() => { delete globalThis.__sweep; delete globalThis.__remind; });
  const response = await cron.GET(cronRequest());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { configured: true, expired: 3, reminded: 2 });
  assert.deepEqual(calls, ['sweep', 'remind']);
});

test('a failing sweep is reported as unavailable', async (t) => {
  env(t, { KINNSO_SITE_URL: site, CRON_SECRET: cronSecret });
  globalThis.__sweep = async () => { throw new Error('database down'); };
  globalThis.__remind = async () => ({ configured: true, reminded: 0 });
  t.after(() => { delete globalThis.__sweep; delete globalThis.__remind; });
  const response = await cron.GET(cronRequest());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'UNAVAILABLE');
});

test('a failing reminder is reported as unavailable', async (t) => {
  env(t, { KINNSO_SITE_URL: site, CRON_SECRET: cronSecret });
  globalThis.__sweep = async () => ({ configured: true, expired: 0 });
  globalThis.__remind = async () => { throw new Error('database down'); };
  t.after(() => { delete globalThis.__sweep; delete globalThis.__remind; });
  const response = await cron.GET(cronRequest());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'UNAVAILABLE');
});

function opsSetup(t, { anonymous = false, roles = ['traveller', 'ops'], errorFor = null, enabled = 'trips,ops' } = {}) {
  env(t, { KINNSO_SUPABASE_URL: site, KINNSO_APPROVED_SUPABASE_ORIGIN: site, KINNSO_LEGACY_AUTH_ORIGIN: site, KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', KINNSO_SITE_URL: site, KINNSO_ENABLED_CAPABILITIES: enabled });
  const calls = [];
  globalThis.__sweepOpsClient = {
    auth: { getUser: async () => (anonymous ? { data: { user: null }, error: { status: 401 } } : { data: { user: { id: ops } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'kinnso_actor') return anonymous ? { data: null, error: { message: 'unauthenticated' } } : { data: { id: ops, roles }, error: null };
      if (errorFor) return { data: null, error: { message: errorFor } };
      if (name === 'kinnso_payment_sweep_expired') return { data: { expired: 2, sweptAt: '2026-11-12T00:00:00Z' }, error: null };
      if (name === 'kinnso_payment_send_reminders') return { data: { reminded: 1, sentAt: '2026-11-12T00:00:00Z' }, error: null };
      return { data: null, error: { message: 'unexpected_rpc:' + name } };
    },
  };
  t.after(() => { delete globalThis.__sweepOpsClient; });
  return calls;
}
const opsRequest = (origin = site) => new Request(`${site}/api/ops/payments/sweep`, { method: 'POST', headers: { Host: 'journeys.example', Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });

test('an operator can run the lifecycle manually and both counts are returned', async (t) => {
  const calls = opsSetup(t);
  const response = await opsRoute.POST(opsRequest());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { expired: 2, reminded: 1 });
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor', 'kinnso_payment_sweep_expired', 'kinnso_payment_send_reminders']);
});

test('the manual sweep is ops-only and same-origin', async (t) => {
  opsSetup(t, { roles: ['traveller'] });
  assert.equal((await opsRoute.POST(opsRequest())).status, 403);

  opsSetup(t, { anonymous: true });
  assert.equal((await opsRoute.POST(opsRequest())).status, 401);

  opsSetup(t);
  assert.equal((await opsRoute.POST(opsRequest('https://evil.example'))).status, 403);
});

test('manual sweep failures map to 503 unless the RPC denies the caller', async (t) => {
  opsSetup(t, { errorFor: 'connection reset' });
  const unavailable = await opsRoute.POST(opsRequest());
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'UNAVAILABLE');

  opsSetup(t, { errorFor: 'forbidden' });
  const forbidden = await opsRoute.POST(opsRequest());
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).code, 'FORBIDDEN');
});
