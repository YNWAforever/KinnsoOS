import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const owner = '00000000-0000-4000-8000-000000000001';
const booking = '00000000-0000-4000-8000-00000000000b';
const payment = '00000000-0000-4000-8000-00000000000c';
async function handler(path) {
  const r = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['next/server', 'next/headers'], plugins: [{ name: 'author-session', setup(b) {
    b.onResolve({ filter: /supabase\/server$/ }, () => ({ path: 'fixture', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: 'export async function serverClient(){return globalThis.__checkoutClient}' }));
  } }] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', r.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const start = await handler('../app/api/booking-requests/[id]/payment/route.ts');
const confirm = await handler('../app/api/payments/fake/confirm/route.ts');
const checkoutPage = await handler('../app/api/payments/fake/checkout/[paymentId]/route.ts');
const summary = { enabled: true, paymentId: payment, bookingRequestId: booking, paymentStatus: 'requires_payment', amountMinor: 75050, currency: 'HKD', deadlineAt: '2026-11-18T08:30:00Z', guideTitle: 'Harbour walk' };
function setup(t, { enabled = true, anonymous = false, errorFor = {} } = {}) {
  const env = {
    KINNSO_SUPABASE_URL: 'https://test.supabase.co',
    KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://test.supabase.co',
    KINNSO_LEGACY_AUTH_ORIGIN: 'https://test.supabase.co',
    KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    KINNSO_SITE_URL: 'https://journeys.example',
    KINNSO_ENABLED_CAPABILITIES: 'trips',
    KINNSO_PAYMENTS_PROVIDER: 'fake',
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const calls = [];
  globalThis.__checkoutClient = {
    auth: { getUser: async () => (anonymous ? { data: { user: null }, error: { status: 401 } } : { data: { user: { id: owner } } }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'kinnso_actor') return anonymous ? { data: null, error: { message: 'unauthenticated' } } : { data: { id: owner, roles: ['trips'] }, error: null };
      if (errorFor[name]) return { data: null, error: { message: errorFor[name] } };
      if (name === 'kinnso_traveller_payment') return { data: { ...summary, enabled }, error: null };
      if (name === 'kinnso_traveller_start_checkout') return { data: { paymentId: payment, bookingRequestId: booking, amountMinor: 75050, currency: 'HKD', guideTitle: 'Harbour walk', deadlineAt: summary.deadlineAt, provider: 'fake' }, error: null };
      if (name === 'kinnso_traveller_record_checkout') return { data: { paymentId: payment, status: 'processing', checkoutUrl: 'https://journeys.example/api/payments/fake/checkout/' + payment, deadlineAt: summary.deadlineAt }, error: null };
      if (name === 'kinnso_traveller_confirm_fake_payment') return { data: { paymentId: payment, status: 'paid', paidAt: '2026-11-12T00:00:00Z', replayed: false }, error: null };
      return { data: null, error: { message: 'unexpected_rpc:' + name } };
    },
  };
  t.after(() => {
    delete globalThis.__checkoutClient;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  return calls;
}
const headers = (origin = 'https://journeys.example') => ({ Host: 'journeys.example', Origin: origin, 'Sec-Fetch-Site': 'same-origin' });
const startRequest = (body = { locale: 'zh-HK' }, origin) => new Request(`https://journeys.example/api/booking-requests/${booking}/payment`, { method: 'POST', headers: { ...headers(origin), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const startContext = { params: Promise.resolve({ id: booking }) };
const confirmRequest = (body = { paymentId: payment }) => new Request('https://journeys.example/api/payments/fake/confirm', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const confirmFormRequest = (body = `paymentId=${payment}&locale=zh-HK`) => new Request('https://journeys.example/api/payments/fake/confirm', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' }, body });
const pageRequest = () => new Request(`https://journeys.example/api/payments/fake/checkout/${payment}?locale=zh-HK`, { method: 'GET', headers: { Host: 'journeys.example' } });
const pageContext = { params: Promise.resolve({ paymentId: payment }) };

test('starting checkout hands off to the fake test page and records the session server-side', async (t) => {
  const calls = setup(t);
  const response = await start.POST(startRequest(), startContext);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.data, {
    url: `https://journeys.example/api/payments/fake/checkout/${payment}?locale=zh-HK`,
    mode: 'test',
    paymentId: payment,
    amountMinor: 75050,
    currency: 'HKD',
    deadlineAt: summary.deadlineAt,
  });
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor', 'kinnso_traveller_payment', 'kinnso_traveller_start_checkout', 'kinnso_traveller_record_checkout']);
  assert.equal(calls[3].args.p_provider, 'fake');
  assert.equal(calls[3].args.p_url, payload.data.url);
});

test('a disabled payments flag refuses to start checkout before any provider call', async (t) => {
  const calls = setup(t, { enabled: false });
  const response = await start.POST(startRequest(), startContext);
  assert.equal(response.status, 403);
  const text = await response.text();
  assert.match(text, /FORBIDDEN/);
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor', 'kinnso_traveller_payment']);
});

test('an enabled flag with no configured provider refuses instead of leaving a stuck checkout', async (t) => {
  const calls = setup(t);
  process.env.KINNSO_PAYMENTS_PROVIDER = 'none';
  const response = await start.POST(startRequest(), startContext);
  assert.equal(response.status, 503);
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor', 'kinnso_traveller_payment']);
});

test('an expired payment window is reported as a conflict without leaking backend detail', async (t) => {
  setup(t, { errorFor: { kinnso_traveller_start_checkout: 'payment_expired' } });
  const response = await start.POST(startRequest(), startContext);
  assert.equal(response.status, 409);
  const text = await response.text();
  assert.match(text, /CONFLICT/);
  assert.doesNotMatch(text, /payment_expired/);
});

test('a cross-origin checkout start is denied before any RPC runs', async (t) => {
  const calls = setup(t);
  const response = await start.POST(startRequest(undefined, 'https://foreign.example'), startContext);
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test('a malformed checkout start payload is refused before any RPC runs', async (t) => {
  const calls = setup(t);
  const response = await start.POST(new Request(`https://journeys.example/api/booking-requests/${booking}/payment`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: '{not json' }), startContext);
  assert.equal(response.status, 400);
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor']);
});

test('the fake confirmation marks the payment paid exactly once via the booking RPC', async (t) => {
  const calls = setup(t);
  const response = await confirm.POST(confirmRequest());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.status, 'paid');
  assert.deepEqual(calls.map((call) => call.name), ['kinnso_actor', 'kinnso_traveller_confirm_fake_payment']);
  assert.equal(calls[1].args.p_payment_id, payment);
});

test('confirmation validates the payment id and refuses foreign origins first', async (t) => {
  const calls = setup(t);
  for (const body of [{}, { paymentId: 'nope' }, { paymentId: 42 }, { other: payment }]) {
    assert.equal((await confirm.POST(confirmRequest(body))).status, 400, JSON.stringify(body));
  }
  assert.equal((await confirm.POST(new Request('https://journeys.example/api/payments/fake/confirm', { method: 'POST', headers: { ...headers('https://foreign.example'), 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId: payment }) }))).status, 403);
  assert.equal(calls.filter((call) => call.name !== 'kinnso_actor').length, 0);
});

test('confirmation maps a disabled flag and non-payable rows to refusals', async (t) => {
  setup(t, { errorFor: { kinnso_traveller_confirm_fake_payment: 'payments_disabled' } });
  assert.equal((await confirm.POST(confirmRequest())).status, 403);
  setup(t, { errorFor: { kinnso_traveller_confirm_fake_payment: 'payment_not_payable' } });
  assert.equal((await confirm.POST(confirmRequest())).status, 409);
});

test('confirmation is only available while the fake provider is active', async (t) => {
  const calls = setup(t);
  process.env.KINNSO_PAYMENTS_PROVIDER = 'stripe';
  const response = await confirm.POST(confirmRequest());
  assert.equal(response.status, 404);
  assert.equal(calls.filter((call) => call.name !== 'kinnso_actor').length, 0);
});

test('a start whose window just closed reports a conflict without creating a session', async (t) => {
  const calls = setup(t);
  globalThis.__checkoutClient.rpc = async (name) => {
    if (name === 'kinnso_actor') return { data: { id: owner, roles: ['trips'] }, error: null };
    if (name === 'kinnso_traveller_payment') return { data: { ...summary, enabled: true }, error: null };
    return { data: { paymentId: payment, status: 'expired', expired: true }, error: null };
  };
  const response = await start.POST(startRequest(), startContext);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /CONFLICT/);
  assert.equal(calls.filter((call) => call.name === 'kinnso_traveller_record_checkout').length, 0);
});

test('a confirmation that expires the window reports a conflict and redirects with a reason', async (t) => {
  setup(t);
  globalThis.__checkoutClient.rpc = async (name) => {
    if (name === 'kinnso_actor') return { data: { id: owner, roles: ['trips'] }, error: null };
    return { data: { paymentId: payment, status: 'expired', paidAt: null, expired: true }, error: null };
  };
  const response = await confirm.POST(confirmRequest());
  assert.equal(response.status, 409);
  assert.match(await response.text(), /CONFLICT/);
  const form = await confirm.POST(confirmFormRequest());
  assert.equal(form.status, 303);
  assert.match(String(form.headers.get('location')), /\/zh-HK\/requests\?pay_error=payment-expired$/);
});

test('the checkout form post redirects back to the request list', async (t) => {
  setup(t);
  const response = await confirm.POST(confirmFormRequest());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://journeys.example/zh-HK/requests?paid=1');
});

test('the checkout page shows the server-side amount in test mode', async (t) => {
  setup(t);
  const response = await checkoutPage.GET(pageRequest(), pageContext);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /data-testid="fake-checkout"/);
  assert.match(html, /HK\$750\.50/);
  assert.match(html, /data-amount-minor="75050"/);
  assert.match(html, new RegExp(`name="paymentId" value="${payment}"`));
  assert.match(html, /Test mode/);
  assert.doesNotMatch(html, /card_number|cvc/i);
});

test('a paid payment redirects instead of showing a checkout form', async (t) => {
  setup(t);
  globalThis.__checkoutClient.rpc = async (name) => {
    if (name === 'kinnso_actor') return { data: { id: owner, roles: ['trips'] }, error: null };
    return { data: { ...summary, paymentStatus: 'paid', bookingStatus: 'paid' }, error: null };
  };
  const response = await checkoutPage.GET(pageRequest(), pageContext);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://journeys.example/zh-HK/requests?paid=1');
});

test('the checkout page is owner-only and needs a session', async (t) => {
  setup(t, { anonymous: true });
  assert.equal((await checkoutPage.GET(pageRequest(), pageContext)).status, 401);
  setup(t);
  globalThis.__checkoutClient.rpc = async (name) => {
    if (name === 'kinnso_actor') return { data: { id: owner, roles: ['trips'] }, error: null };
    return { data: null, error: { message: 'payment_not_found' } };
  };
  assert.equal((await checkoutPage.GET(pageRequest(), pageContext)).status, 404);
  setup(t);
  globalThis.__checkoutClient.rpc = async (name) => {
    if (name === 'kinnso_actor') return { data: { id: owner, roles: ['trips'] }, error: null };
    return { data: null, error: { message: 'forbidden' } };
  };
  assert.equal((await checkoutPage.GET(pageRequest(), pageContext)).status, 403);
});
