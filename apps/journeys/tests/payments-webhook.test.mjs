import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { parseWebhookEvent, verifyWebhookSignature } from '../lib/payments/webhook.ts';

const require = createRequire(import.meta.url);
const SECRET = 'whsec_test_123';
const payment = '00000000-0000-4000-8000-00000000002c';

async function handler(path) {
  const r = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'supabase-client', setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'fixture', namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: 'export function createClient(){return globalThis.__webhookClient}' }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', r.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const webhook = await handler('../app/api/payments/webhook/route.ts');

function sign(body, secret = SECRET, at = Math.floor(Date.now() / 1000)) {
  const timestamp = String(at);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function setup(t, { secret = SECRET, provider = 'fake', serviceKey = 'service-key', rpc } = {}) {
  const env = {
    KINNSO_SUPABASE_URL: 'https://test.supabase.co',
    KINNSO_SUPABASE_SECRET_KEY: serviceKey,
    KINNSO_SITE_URL: 'https://journeys.example',
    KINNSO_PAYMENTS_PROVIDER: provider,
    KINNSO_PAYMENTS_WEBHOOK_SECRET: secret,
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const calls = [];
  globalThis.__webhookClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return rpc ? rpc(name, args) : { data: { received: true, replayed: false }, error: null };
    },
  };
  t.after(() => {
    delete globalThis.__webhookClient;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  return calls;
}

const event = (overrides = {}) => JSON.stringify({
  id: 'evt_test_paid_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      client_reference_id: payment,
      payment_intent: 'pi_test_1',
      amount_total: 75050,
      currency: 'hkd',
      payment_status: 'paid',
      ...overrides,
    },
  },
});
const post = (body, { signature, headers = {} } = {}) => new Request('https://journeys.example/api/payments/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature ?? sign(body), ...headers },
  body,
});

test('a correctly signed body is accepted, including multiple candidate signatures', () => {
  const body = event();
  const timestamp = Math.floor(Date.now() / 1000);
  const valid = createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
  assert.deepEqual(verifyWebhookSignature(body, `t=${timestamp},v1=${'0'.repeat(64)},v1=${valid}`, SECRET), { ok: true });
});

test('tampering with the body, using another secret or a missing header is rejected', () => {
  const body = event();
  assert.deepEqual(verifyWebhookSignature(body + ' ', sign(body), SECRET), { ok: false, reason: 'mismatch' });
  assert.deepEqual(verifyWebhookSignature(body, sign(body, 'whsec_other'), SECRET), { ok: false, reason: 'mismatch' });
  assert.deepEqual(verifyWebhookSignature(body, null, SECRET), { ok: false, reason: 'missing' });
});

test('a stale timestamp or a malformed header is rejected even with a matching signature', () => {
  const body = event();
  const stale = Math.floor(Date.now() / 1000) - 600;
  assert.deepEqual(verifyWebhookSignature(body, sign(body, SECRET, stale), SECRET), { ok: false, reason: 'stale' });
  assert.deepEqual(verifyWebhookSignature(body, 'garbage', SECRET), { ok: false, reason: 'malformed' });
});

test('the event reduction bounds fields and links a payment from the session or metadata', () => {
  const parsed = parseWebhookEvent(event());
  assert.equal(parsed.id, 'evt_test_paid_1');
  assert.equal(parsed.type, 'checkout.session.completed');
  assert.equal(parsed.paymentId, payment);
  assert.deepEqual(parsed.payload, {
    sessionId: 'cs_test_1', paymentIntentId: 'pi_test_1', amountTotal: 75050,
    currency: 'hkd', mode: null, paymentStatus: 'paid',
  });
  assert.equal(parseWebhookEvent(event({ client_reference_id: null, metadata: { payment_id: payment } })).paymentId, payment);
  assert.equal(parseWebhookEvent(event({ client_reference_id: 'not-a-uuid', metadata: {} })).paymentId, null);
  assert.equal(parseWebhookEvent('{not json'), null);
  assert.equal(parseWebhookEvent(JSON.stringify({ id: 'x' })), null);
});

test('a valid paid event is forwarded to the service-only ingestion RPC', async (t) => {
  const calls = setup(t);
  const body = event();
  const response = await webhook.POST(post(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, replayed: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'kinnso_payment_webhook_ingest');
  assert.deepEqual(calls[0].args, {
    p_provider: 'fake',
    p_event_id: 'evt_test_paid_1',
    p_event_type: 'checkout.session.completed',
    p_payment_id: payment,
    p_payload: { sessionId: 'cs_test_1', paymentIntentId: 'pi_test_1', amountTotal: 75050, currency: 'hkd', mode: null, paymentStatus: 'paid' },
  });
});

test('a replayed event returns the recorded state without a second transition', async (t) => {
  const calls = setup(t, { rpc: async () => ({ data: { received: true, replayed: true }, error: null }) });
  const response = await webhook.POST(post(event()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, replayed: true });
  assert.equal(calls.length, 1);
});

test('an unconfigured secret keeps the endpoint inert', async (t) => {
  const calls = setup(t, { secret: '' });
  const response = await webhook.POST(post(event()));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { received: false, error: 'not_configured' });
  assert.equal(calls.length, 0);
});

test('an unsupported provider keeps the endpoint inert', async (t) => {
  const calls = setup(t, { provider: 'none' });
  const response = await webhook.POST(post(event()));
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test('a forged signature is refused before any database call', async (t) => {
  const calls = setup(t);
  const body = event();
  const response = await webhook.POST(post(body, { signature: sign('{}') }));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('a stale signed request is refused before any database call', async (t) => {
  const calls = setup(t);
  const body = event();
  const response = await webhook.POST(post(body, { signature: sign(body, SECRET, Math.floor(Date.now() / 1000) - 600) }));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('a signed but malformed payload is refused', async (t) => {
  const calls = setup(t);
  const response = await webhook.POST(post('{not json'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { received: false, error: 'invalid_payload' });
  assert.equal(calls.length, 0);
});

test('an unsupported event type is acknowledged without a database call', async (t) => {
  const calls = setup(t);
  const body = JSON.stringify({ id: 'evt_other', type: 'customer.created', data: { object: { id: 'cus_1' } } });
  const response = await webhook.POST(post(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, ignored: true, reason: 'unsupported-event' });
  assert.equal(calls.length, 0);
});

test('an event without a known payment is still forwarded for the ledger', async (t) => {
  const calls = setup(t);
  const response = await webhook.POST(post(event({ client_reference_id: null, metadata: {} })));
  assert.equal(response.status, 200);
  assert.equal(calls[0].args.p_payment_id, null);
});

test('an ignored ingestion reason is returned as data, not an error', async (t) => {
  setup(t, { rpc: async () => ({ data: { received: true, replayed: false, ignored: 'amount_mismatch' }, error: null }) });
  const response = await webhook.POST(post(event()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, replayed: false, ignored: 'amount_mismatch' });
});

test('an oversized body is refused before any database call', async (t) => {
  const calls = setup(t);
  const body = 'x'.repeat(70_000);
  const response = await webhook.POST(post(body));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { received: false, error: 'invalid_body' });
  assert.equal(calls.length, 0);
});

test('an invalid reduced event from the database is reported as an invalid request', async (t) => {
  setup(t, { rpc: async () => ({ data: null, error: { message: 'invalid_webhook' } }) });
  const response = await webhook.POST(post(event()));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { received: false, error: 'invalid_webhook' });
});

test('a database failure is hidden behind an unavailable response', async (t) => {
  setup(t, { rpc: async () => ({ data: null, error: { message: 'connection refused: secret-dsn' } }) });
  const response = await webhook.POST(post(event()));
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.doesNotMatch(text, /connection refused|secret-dsn/);
});

test('a missing service key keeps the endpoint unavailable after verification', async (t) => {
  const calls = setup(t, { serviceKey: '' });
  const response = await webhook.POST(post(event()));
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});
