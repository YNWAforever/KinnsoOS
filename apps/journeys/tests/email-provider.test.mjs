import test from 'node:test';
import assert from 'node:assert/strict';
import { emailProvider } from '../lib/email/provider.ts';

const message = { to: 'traveller@example.test', subject: 'Test subject', text: 'Test body', idempotencyKey: 'idem-123' };

test('resend adapter requires both the API key and the from address', () => {
  assert.equal(emailProvider({ KINNSO_EMAIL_PROVIDER: 'resend' }).configured, false);
  assert.equal(emailProvider({ KINNSO_EMAIL_PROVIDER: 'resend', KINNSO_EMAIL_API_KEY: 're_test' }).configured, false);
  assert.equal(emailProvider({ KINNSO_EMAIL_PROVIDER: 'resend', KINNSO_EMAIL_API_KEY: 're_test', KINNSO_EMAIL_FROM: 'Kinnso <bookings@mail.kinnso.com>' }).configured, true);
});

test('resend adapter posts the expected request and returns the provider id', async () => {
  const original = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const adapter = emailProvider({ KINNSO_EMAIL_PROVIDER: 'resend', KINNSO_EMAIL_API_KEY: 're_test', KINNSO_EMAIL_FROM: 'Kinnso <bookings@mail.kinnso.com>' });
    const result = await adapter.send(message);
    assert.deepEqual(result, { id: 'email_123' });
    assert.equal(captured.url, 'https://api.resend.com/emails');
    assert.equal(captured.init.headers.Authorization, 'Bearer re_test');
    assert.equal(captured.init.headers['Idempotency-Key'], 'idem-123');
    const body = JSON.parse(captured.init.body);
    assert.deepEqual(body, { from: 'Kinnso <bookings@mail.kinnso.com>', to: ['traveller@example.test'], subject: 'Test subject', text: 'Test body' });
  } finally {
    globalThis.fetch = original;
  }
});

test('resend adapter surfaces provider failures without leaking the key', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"domain is not verified"}', { status: 403 });
  try {
    const adapter = emailProvider({ KINNSO_EMAIL_PROVIDER: 'resend', KINNSO_EMAIL_API_KEY: 're_secret_value', KINNSO_EMAIL_FROM: 'Kinnso <bookings@mail.kinnso.com>' });
    await assert.rejects(adapter.send(message), (error) => {
      assert.match(error.message, /resend 403/);
      assert.match(error.message, /domain is not verified/);
      assert.equal(error.message.includes('re_secret_value'), false);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('test base URL override is respected for local verification', async () => {
  const original = globalThis.fetch;
  let url = '';
  globalThis.fetch = async (target) => { url = String(target); return new Response(JSON.stringify({ id: 'local_1' }), { status: 200 }); };
  try {
    const adapter = emailProvider({ KINNSO_EMAIL_PROVIDER: 'resend', KINNSO_EMAIL_API_KEY: 're_test', KINNSO_EMAIL_FROM: 'x@y.test', KINNSO_EMAIL_API_BASE: 'http://127.0.0.1:3498/' });
    await adapter.send(message);
    assert.equal(url, 'http://127.0.0.1:3498/emails');
  } finally {
    globalThis.fetch = original;
  }
});
