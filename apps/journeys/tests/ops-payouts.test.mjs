// Monthly creator payout accrual: the ops read/record route. The database rules
// (rounding from stored commission, one payout per creator-month, refund exclusion) are
// exercised by local acceptance; these tests cover auth, validation and error mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const ops = '00000000-0000-4000-8000-000000000001';
const creator = '00000000-0000-4000-8000-000000000002';
const site = 'https://journeys.example';
async function handler() {
  const r = await build({ entryPoints: [fileURLToPath(new URL('../app/api/ops/payouts/route.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['next/server', 'next/headers'], plugins: [{ name: 'stub-supabase', setup(b) {
    b.onResolve({ filter: /supabase\/server$/ }, () => ({ path: 'fixture', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: 'export async function serverClient(){return globalThis.__payoutClient}' }));
  } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', r.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const route = await handler();
function env(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
}
function setup(t, { anonymous = false, roles = ['traveller', 'ops'], errorFor = null } = {}) {
  env(t, { KINNSO_SUPABASE_URL: site, KINNSO_APPROVED_SUPABASE_ORIGIN: site, KINNSO_LEGACY_AUTH_ORIGIN: site, KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', KINNSO_SITE_URL: site, KINNSO_ENABLED_CAPABILITIES: 'trips,ops' });
  const calls = [];
  globalThis.__payoutClient = {
    auth: { getUser: async () => (anonymous ? { data: { user: null }, error: { status: 401 } } : { data: { user: { id: ops } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'kinnso_actor') return anonymous ? { data: null, error: { message: 'unauthenticated' } } : { data: { id: ops, roles }, error: null };
      if (errorFor) return { data: null, error: { message: errorFor } };
      if (name === 'kinnso_ops_payout_accrual') return { data: { month: '2026-11', periodStart: '2026-11-01', periodEnd: '2026-11-30', creators: [], totals: { grossMinor: 0, commissionMinor: 0, netMinor: 0, paymentCount: 0 } }, error: null };
      if (name === 'kinnso_ops_record_payout') return { data: { payoutId: 'payout-1', creatorId: creator, netMinor: 63792 }, error: null };
      return { data: null, error: { message: 'unexpected_rpc:' + name } };
    },
  };
  t.after(() => { delete globalThis.__payoutClient; });
  return calls;
}
const getRequest = (month = '2026-11', origin = site) => new Request(`${site}/api/ops/payouts?month=${month}`, { headers: { Host: 'journeys.example', Origin: origin } });
const postRequest = (body, origin = site) => new Request(`${site}/api/ops/payouts`, { method: 'POST', headers: { Host: 'journeys.example', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('payout accrual requires an operations session', async (t) => {
  setup(t, { anonymous: true });
  assert.equal((await route.GET(getRequest())).status, 401);
  setup(t, { roles: ['traveller'] });
  assert.equal((await route.GET(getRequest())).status, 403);
});

test('payout accrual rejects an invalid month before calling the database', async (t) => {
  const calls = setup(t);
  const response = await route.GET(getRequest('2026-13'));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID');
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor']);
});

test('an operator sees the monthly accrual for the requested month', async (t) => {
  const calls = setup(t);
  const response = await route.GET(getRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.month, '2026-11');
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor', 'kinnso_ops_payout_accrual']);
  assert.deepEqual(calls[1].args, { p_month: '2026-11-01' });
});

test('an RPC denial maps to forbidden and other failures to unavailable', async (t) => {
  setup(t, { errorFor: 'forbidden' });
  const forbidden = await route.GET(getRequest());
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).code, 'FORBIDDEN');
  setup(t, { errorFor: 'connection reset' });
  const unavailable = await route.GET(getRequest());
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'UNAVAILABLE');
});

test('an operator records a payout with its bank reference', async (t) => {
  const calls = setup(t);
  const response = await route.POST(postRequest({ month: '2026-11', creatorId: creator, reference: 'BANK-REF-1' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.payoutId, 'payout-1');
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor', 'kinnso_ops_record_payout']);
  assert.deepEqual(calls[1].args, { p_month: '2026-11-01', p_creator_id: creator, p_reference: 'BANK-REF-1', p_note: null });
});

test('payout recording validates its input and stays same-origin', async (t) => {
  const calls = setup(t);
  assert.equal((await route.POST(postRequest({ month: '2026-11', creatorId: creator, reference: 'x' }))).status, 400);
  assert.equal((await route.POST(postRequest({ creatorId: creator, reference: 'BANK-REF-1' }))).status, 400);
  assert.equal((await route.POST(postRequest({ month: '2026-11', creatorId: 'not-a-uuid', reference: 'BANK-REF-1' }))).status, 400);
  assert.equal((await route.POST(postRequest({ month: '2026-11', creatorId: creator, reference: 'BANK-REF-1' }, 'https://evil.example'))).status, 403);
  assert.equal(calls.some((call) => call.name === 'kinnso_ops_record_payout'), false);
});

test('monthly payout conflicts are reported distinctly', async (t) => {
  for (const message of ['payout_already_recorded', 'no_earnings', 'mixed_currency']) {
    setup(t, { errorFor: message });
    const response = await route.POST(postRequest({ month: '2026-11', creatorId: creator, reference: 'BANK-REF-1' }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'CONFLICT');
  }
  setup(t, { errorFor: 'connection reset' });
  const unavailable = await route.POST(postRequest({ month: '2026-11', creatorId: creator, reference: 'BANK-REF-1' }));
  assert.equal(unavailable.status, 503);
});
