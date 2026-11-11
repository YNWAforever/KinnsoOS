// Ops payments dashboard route: list/detail/webhook read models plus the existing
// enable toggle and audited refund. The Supabase RPCs are stubbed so the tests cover
// the authorization gates, request validation and error mapping without a database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const ops = '00000000-0000-4000-8000-000000000001';
const payment = '00000000-0000-4000-8000-00000000000c';
const booking = '00000000-0000-4000-8000-00000000000b';
async function handler(path) {
  const r = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['next/server', 'next/headers'], plugins: [{ name: 'stub-supabase', setup(b) {
    b.onResolve({ filter: /supabase\/server$/ }, () => ({ path: 'fixture', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: 'export async function serverClient(){return globalThis.__opsPaymentsClient}' }));
  } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', r.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const route = await handler('../app/api/ops/payments/route.ts');
const status = { enabled: false, pricedGuides: 2, requiresPayment: 1, processing: 0, paid: 1, refunded: 0, expired: 0, providerEvents: 3, overdueCheckouts: 0 };
const list = { items: [{ paymentId: payment, bookingRequestId: booking, status: 'paid', amountMinor: 75050, currency: 'HKD', provider: 'fake', guideTitle: 'Harbour walk', startsOn: '2026-11-20', endsOn: '2026-11-21', partySize: 2, travelerUserId: ops, createdAt: '2026-11-12T00:00:00Z', deadlineAt: '2026-11-19T00:00:00Z', processingAt: null, paidAt: '2026-11-12T00:10:00Z', refundedAt: null, providerEventCount: 1, lastEventKind: 'payment.paid', lastIgnoredReason: null, lastEventAt: '2026-11-12T00:10:00Z' }], hasMore: false };
const webhookEvents = { items: [{ eventId: 'evt_1', kind: 'payment.paid', eventType: 'checkout.session.completed', provider: 'fake', ignored: null, late: null, amountTotal: '75050', currency: 'HKD', paymentId: payment, bookingRequestId: booking, paymentStatus: 'paid', createdAt: '2026-11-12T00:10:00Z' }], counts: { processed: 1, amount_mismatch: 2 }, total: 3 };
const detail = { payment: { paymentId: payment, status: 'paid', amountMinor: 75050, currency: 'HKD', provider: 'fake' }, booking: { bookingRequestId: booking, guideTitle: 'Harbour walk', status: 'paid' }, events: [{ kind: 'payment.paid', providerEventId: 'evt_1', createdAt: '2026-11-12T00:10:00Z' }] };
const refundContext = { paymentId: payment, bookingRequestId: booking, status: 'paid', provider: 'fake', providerPaymentIntentId: 'pi_fake_1', amountMinor: 75050, currency: 'HKD', paidAt: '2026-11-12T00:10:00Z', refundedAt: null };
function setup(t, { anonymous = false, roles = ['traveller', 'ops'], enabled = 'trips,ops', errorFor = {}, context = refundContext } = {}) {
  const env = {
    KINNSO_SUPABASE_URL: 'https://test.supabase.co',
    KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://test.supabase.co',
    KINNSO_LEGACY_AUTH_ORIGIN: 'https://test.supabase.co',
    KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    KINNSO_SITE_URL: 'https://journeys.example',
    KINNSO_ENABLED_CAPABILITIES: enabled,
    KINNSO_PAYMENTS_PROVIDER: 'fake',
    KINNSO_PAYMENTS_WEBHOOK_SECRET: 'whsec_test',
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const calls = [];
  globalThis.__opsPaymentsClient = {
    auth: { getUser: async () => (anonymous ? { data: { user: null }, error: { status: 401 } } : { data: { user: { id: ops } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'kinnso_actor') return anonymous ? { data: null, error: { message: 'unauthenticated' } } : { data: { id: ops, roles }, error: null };
      if (errorFor[name]) return { data: null, error: { message: errorFor[name] } };
      if (name === 'kinnso_ops_payments_status') return { data: status, error: null };
      if (name === 'kinnso_ops_payments_list') return { data: list, error: null };
      if (name === 'kinnso_ops_webhook_events') return { data: webhookEvents, error: null };
      if (name === 'kinnso_ops_payment_detail') return { data: detail, error: null };
      if (name === 'kinnso_ops_set_payments_enabled') return { data: { enabled: args?.p_enabled }, error: null };
      if (name === 'kinnso_ops_refund_context') return { data: context, error: null };
      if (name === 'kinnso_ops_refund_payment') return { data: { id: args?.p_payment_id, status: 'refunded' }, error: null };
      if (name === 'kinnso_ops_record_refund') return { data: { id: args?.p_payment_id, status: 'refunded', providerRefundId: args?.p_provider_refund_id, refundedAmountMinor: 75050 }, error: null };
      return { data: null, error: { message: 'unexpected_rpc:' + name } };
    },
  };
  t.after(() => {
    delete globalThis.__opsPaymentsClient;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  return calls;
}
const headers = () => ({ Host: 'journeys.example', Origin: 'https://journeys.example', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' });
const get = (query = '') => new Request(`https://journeys.example/api/ops/payments${query}`, { method: 'GET', headers: { Host: 'journeys.example' }, cache: 'no-store' });
const put = (body = { enabled: true }) => new Request('https://journeys.example/api/ops/payments', { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
const post = (body = { paymentId: payment, reason: 'Duplicate charge refund' }) => new Request('https://journeys.example/api/ops/payments', { method: 'POST', headers: headers(), body: JSON.stringify(body) });

test('the dashboard payload carries money states, recent payments and the provider ledger', async (t) => {
  const calls = setup(t);
  const response = await route.GET(get());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.enabled, false);
  assert.equal(payload.data.paid, 1);
  assert.equal(payload.data.providerEvents, 3);
  assert.equal(payload.data.provider, 'fake');
  assert.equal(payload.data.providerConfigured, true);
  assert.equal(payload.data.webhookConfigured, true);
  assert.equal(payload.data.payments.items[0].amountMinor, 75050);
  assert.equal(payload.data.webhookEvents.counts.amount_mismatch, 2);
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor', 'kinnso_ops_payments_status', 'kinnso_ops_payments_list', 'kinnso_ops_webhook_events']);
  assert.deepEqual(calls[2].args, { p_limit: 100 });
  assert.deepEqual(calls[3].args, { p_limit: 50 });
});

test('one payment can be read with its audit trail', async (t) => {
  const calls = setup(t);
  const response = await route.GET(get(`?paymentId=${payment}`));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.events[0].kind, 'payment.paid');
  assert.equal(calls.filter((call) => call.name === 'kinnso_ops_payment_detail').length, 1);
  assert.deepEqual(calls.find((call) => call.name === 'kinnso_ops_payment_detail').args, { p_payment_id: payment });
});

test('a malformed payment id is rejected before any read', async (t) => {
  const calls = setup(t);
  const response = await route.GET(get('?paymentId=not-a-uuid'));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID');
  assert.equal(calls.filter((call) => call.name === 'kinnso_ops_payment_detail').length, 0);
});

test('non-ops members and signed-out callers are refused', async (t) => {
  setup(t, { roles: ['traveller'] });
  const forbidden = await route.GET(get());
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).code, 'FORBIDDEN');

  setup(t, { anonymous: true });
  const anonymousResponse = await route.GET(get());
  assert.equal(anonymousResponse.status, 401);
  assert.equal((await anonymousResponse.json()).code, 'AUTH_REQUIRED');
});

test('the ops capability must be connected', async (t) => {
  setup(t, { enabled: 'trips' });
  const response = await route.GET(get());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'UNAVAILABLE');
});

test('a failed read model is reported as unavailable', async (t) => {
  setup(t, { errorFor: { kinnso_ops_webhook_events: 'connection reset' } });
  const response = await route.GET(get());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'UNAVAILABLE');
});

test('the enable toggle validates input and records the change', async (t) => {
  const calls = setup(t);
  const bad = await route.PUT(put({ enabled: 'yes' }));
  assert.equal(bad.status, 400);
  assert.equal(calls.filter((call) => call.name === 'kinnso_ops_set_payments_enabled').length, 0);

  const response = await route.PUT(put({ enabled: true }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { enabled: true });
  assert.deepEqual(calls.find((call) => call.name === 'kinnso_ops_set_payments_enabled').args, { p_enabled: true });
});

test('a refund needs a payment id and reason before any provider or database work', async (t) => {
  const calls = setup(t);
  for (const body of [{ paymentId: payment }, { reason: 'Missing id' }, {}, null]) {
    const response = await route.POST(new Request('https://journeys.example/api/ops/payments', { method: 'POST', headers: headers(), body: JSON.stringify(body) }));
    assert.equal(response.status, 400);
  }
  assert.equal(calls.filter((call) => call.name === 'kinnso_ops_refund_context').length, 0);
  assert.equal(calls.filter((call) => call.name === 'kinnso_ops_record_refund').length, 0);
});

test('a refund asks the provider first and records the provider refund id', async (t) => {
  const calls = setup(t);
  const expectedRefundId = 're_fake_' + payment.replace(/[^0-9a-f]/gi, '').slice(0, 40);
  const response = await route.POST(post());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.status, 'refunded');
  assert.equal(payload.data.providerRefundId, expectedRefundId);
  assert.equal(payload.data.providerRefundStatus, 'succeeded');
  assert.deepEqual(calls.filter((call) => call.name === 'kinnso_ops_refund_context').map((call) => call.args), [{ p_payment_id: payment }]);
  assert.deepEqual(calls.find((call) => call.name === 'kinnso_ops_record_refund').args, {
    p_payment_id: payment,
    p_provider_refund_id: expectedRefundId,
    p_reason: 'Duplicate charge refund',
    p_amount_minor: 75050,
  });
});

test('a provider mismatch is refused before any refund is recorded', async (t) => {
  const calls = setup(t, { context: { ...refundContext, provider: 'stripe' } });
  const response = await route.POST(post());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'CONFLICT');
  assert.equal(calls.filter((call) => call.name === 'kinnso_ops_record_refund').length, 0);
});

test('an unconfigured provider refuses refunds', async (t) => {
  const calls = setup(t);
  const previous = process.env.KINNSO_PAYMENTS_PROVIDER;
  process.env.KINNSO_PAYMENTS_PROVIDER = 'none';
  t.after(() => { if (previous === undefined) delete process.env.KINNSO_PAYMENTS_PROVIDER; else process.env.KINNSO_PAYMENTS_PROVIDER = previous; });
  const response = await route.POST(post());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'UNAVAILABLE');
  assert.equal(calls.filter((call) => call.name === 'kinnso_ops_record_refund').length, 0);
});

test('refund failures map to actionable status codes', async (t) => {
  for (const [message, expected] of [['invalid_reason', 400], ['payment_not_found', 404], ['payment_not_refundable', 409], ['forbidden', 403], ['weird_failure', 503]]) {
    setup(t, { errorFor: { kinnso_ops_record_refund: message } });
    const response = await route.POST(post());
    assert.equal(response.status, expected, message);
    const payload = await response.json();
    assert.equal(payload.ok, false);
  }
});

test('refund and toggle writes require an ops member and same-origin headers', async (t) => {
  setup(t, { roles: ['traveller'] });
  assert.equal((await route.POST(post())).status, 403);
  assert.equal((await route.PUT(put())).status, 403);

  setup(t);
  const crossOrigin = new Request('https://journeys.example/api/ops/payments', { method: 'POST', headers: { Host: 'journeys.example', Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId: payment, reason: 'Duplicate charge refund' }) });
  assert.equal((await route.POST(crossOrigin)).status, 403);
});
