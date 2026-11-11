import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
const provider = await import('../lib/payments/provider.ts').catch(() => ({}));
const format = await import('../lib/payments/format.ts').catch(() => ({}));

const site = 'https://journeys.example';
const baseInput = { paymentId: '11111111-1111-4111-8111-111111111111', amountMinor: 75050, currency: 'HKD', guideTitle: 'Harbour walk', locale: 'zh-HK' };

test('no provider configuration refuses to create a checkout', async () => {
  const adapter = provider.paymentsProvider({ KINNSO_SITE_URL: site });
  assert.equal(adapter.name, 'none');
  assert.equal(adapter.configured, false);
  await assert.rejects(() => adapter.createCheckout(baseInput), /not-configured/);
});

test('the fake adapter hands off to the labelled test checkout page', async () => {
  const adapter = provider.paymentsProvider({ KINNSO_SITE_URL: site + '/', KINNSO_PAYMENTS_PROVIDER: 'fake' });
  assert.equal(adapter.name, 'fake');
  assert.equal(adapter.configured, true);
  const session = await adapter.createCheckout({ ...baseInput, locale: 'en' });
  assert.deepEqual(session, {
    url: `${site}/api/payments/fake/checkout/11111111-1111-4111-8111-111111111111?locale=en`,
    sessionId: 'fake_11111111-1111-4111-8111-111111111111',
    mode: 'test',
  });
});

test('the fake adapter needs a site origin before it may hand off', async () => {
  const adapter = provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'fake' });
  assert.equal(adapter.configured, false);
  await assert.rejects(() => adapter.createCheckout(baseInput), /not-configured/);
});

test('stripe stays unconfigured without a secret key or site origin', async () => {
  assert.equal(provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', KINNSO_SITE_URL: site }).configured, false);
  assert.equal(provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_123' }).configured, false);
  assert.equal(provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_123', KINNSO_SITE_URL: site }).configured, true);
});

test('the stripe adapter creates a hosted checkout session with a server-side amount', async (t) => {
  const seen = {};
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      seen.method = request.method;
      seen.path = request.url;
      seen.auth = request.headers.authorization;
      seen.body = body;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id: 'cs_test_123', url: 'https://checkout.stripe.test/pay/cs_test_123' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const adapter = provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_123', KINNSO_SITE_URL: site, KINNSO_PAYMENTS_API_BASE: base });
  assert.equal(adapter.configured, true);
  const session = await adapter.createCheckout({ ...baseInput, guideTitle: 'Harbour walk <Kowloon>' });
  assert.deepEqual(session, { url: 'https://checkout.stripe.test/pay/cs_test_123', sessionId: 'cs_test_123', mode: 'hosted' });
  assert.equal(seen.method, 'POST');
  assert.equal(seen.path, '/v1/checkout/sessions');
  assert.match(seen.auth, /^Bearer sk_test_123$/);
  const params = new URLSearchParams(seen.body);
  assert.equal(params.get('mode'), 'payment');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '75050');
  assert.equal(params.get('line_items[0][price_data][currency]'), 'hkd');
  assert.equal(params.get('line_items[0][quantity]'), '1');
  assert.equal(params.get('client_reference_id'), baseInput.paymentId);
  assert.equal(params.get('metadata[payment_id]'), baseInput.paymentId);
  assert.equal(params.get('success_url'), `${site}/zh-HK/requests?paid=1`);
  assert.equal(params.get('cancel_url'), `${site}/zh-HK/requests?pay_cancelled=1`);
  assert.equal(params.get('line_items[0][price_data][product_data][name]'), 'Harbour walk <Kowloon>');
});

test('stripe failures surface the status without echoing the key', async (t) => {
  const server = createServer((request, response) => {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'provider exploded' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const adapter = provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_secret_value', KINNSO_SITE_URL: site, KINNSO_PAYMENTS_API_BASE: `http://127.0.0.1:${server.address().port}` });
  await assert.rejects(() => adapter.createCheckout(baseInput), (error) => {
    assert.match(error.message, /^stripe 500:/);
    assert.doesNotMatch(error.message, /sk_test_secret_value/);
    return true;
  });
});

test('stripe responses without a checkout url are refused', async (t) => {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 'cs_test_missing_url' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const adapter = provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_123', KINNSO_SITE_URL: site, KINNSO_PAYMENTS_API_BASE: `http://127.0.0.1:${server.address().port}` });
  await assert.rejects(() => adapter.createCheckout(baseInput), /missing id\/url/);
});

test('the fake adapter refunds locally with a stable provider refund id', async () => {
  const adapter = provider.paymentsProvider({ KINNSO_SITE_URL: site, KINNSO_PAYMENTS_PROVIDER: 'fake' });
  const input = { paymentId: baseInput.paymentId, paymentIntentId: 'pi_fake_1', amountMinor: 75050, currency: 'HKD' };
  const first = await adapter.refund(input);
  assert.deepEqual(first, { id: 're_fake_11111111111141118111111111111111', status: 'succeeded' });
  assert.deepEqual(await adapter.refund(input), first);
  const unconfigured = provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'fake' });
  await assert.rejects(() => unconfigured.refund(input), /not-configured/);
});

test('the stripe adapter refunds the payment intent with an idempotency key', async (t) => {
  const seen = {};
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      Object.assign(seen, { method: request.method, path: request.url, auth: request.headers.authorization, key: request.headers['idempotency-key'], body });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ id: 're_test_123', status: 'succeeded' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const adapter = provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_123', KINNSO_SITE_URL: site, KINNSO_PAYMENTS_API_BASE: `http://127.0.0.1:${server.address().port}` });
  const result = await adapter.refund({ paymentId: baseInput.paymentId, paymentIntentId: 'pi_test_1', amountMinor: 75050, currency: 'HKD' });
  assert.deepEqual(result, { id: 're_test_123', status: 'succeeded' });
  assert.equal(seen.method, 'POST');
  assert.equal(seen.path, '/v1/refunds');
  assert.match(seen.auth, /^Bearer sk_test_123$/);
  assert.equal(seen.key, `refund_${baseInput.paymentId}`);
  const params = new URLSearchParams(seen.body);
  assert.equal(params.get('payment_intent'), 'pi_test_1');
  assert.equal(params.get('amount'), '75050');
  assert.equal(params.get('metadata[payment_id]'), baseInput.paymentId);
});

test('a pending stripe refund is reported as pending and failures hide the key', async (t) => {
  let mode = 'pending';
  const server = createServer((request, response) => {
    response.writeHead(mode === 'pending' ? 200 : 402, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(mode === 'pending' ? { id: 're_test_pending', status: 'pending' } : { error: { message: 'card declined' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const adapter = provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_secret_value', KINNSO_SITE_URL: site, KINNSO_PAYMENTS_API_BASE: `http://127.0.0.1:${server.address().port}` });
  const input = { paymentId: baseInput.paymentId, paymentIntentId: 'pi_test_1', amountMinor: 75050, currency: 'HKD' };
  assert.deepEqual(await adapter.refund(input), { id: 're_test_pending', status: 'pending' });
  mode = 'error';
  await assert.rejects(() => adapter.refund(input), (error) => {
    assert.match(error.message, /^stripe 402:/);
    assert.doesNotMatch(error.message, /sk_test_secret_value/);
    return true;
  });
});

test('stripe refund responses without an id or a final status are refused', async (t) => {
  let payload = { id: 're_test_1' };
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const adapter = provider.paymentsProvider({ KINNSO_PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_123', KINNSO_SITE_URL: site, KINNSO_PAYMENTS_API_BASE: `http://127.0.0.1:${server.address().port}` });
  const input = { paymentId: baseInput.paymentId, paymentIntentId: 'pi_test_1', amountMinor: 75050, currency: 'HKD' };
  await assert.rejects(() => adapter.refund(input), /refund status unknown/);
  payload = { status: 'succeeded' };
  await assert.rejects(() => adapter.refund(input), /missing id/);
});

test('the unconfigured adapter refuses refunds too', async () => {
  const adapter = provider.paymentsProvider({ KINNSO_SITE_URL: site });
  await assert.rejects(() => adapter.refund({ paymentId: baseInput.paymentId, paymentIntentId: 'pi_1', amountMinor: 1, currency: 'HKD' }), /not-configured/);
});

test('money display keeps the integer minor-unit contract', () => {
  assert.equal(format.formatMoneyMinor(75050, 'HKD'), 'HK$750.50');
  assert.equal(format.formatMoneyMinor(100, 'HKD'), 'HK$1.00');
  assert.equal(format.formatMoneyMinor(123456789, 'HKD'), 'HK$1,234,567.89');
  assert.equal(format.formatMoneyMinor(0, 'HKD'), 'HK$0.00');
  assert.equal(format.formatMoneyMinor(-250, 'HKD'), '-HK$2.50');
  assert.equal(format.formatMoneyMinor(999, 'USD'), 'USD 9.99');
});

test('deadline formatting hides invalid values', () => {
  assert.equal(format.formatPaymentDeadline(null), '');
  assert.equal(format.formatPaymentDeadline('not-a-date'), '');
  assert.match(format.formatPaymentDeadline('2026-11-18T08:30:00Z'), /2026/);
});
