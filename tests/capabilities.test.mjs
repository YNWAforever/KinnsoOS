import { test } from 'node:test';
import assert from 'node:assert/strict';

const contract = await import('../lib/contracts/capabilities.ts').catch(() => ({}));
test('unconfigured capabilities cannot claim connected writes or commerce', () => {
  assert.equal(typeof contract.capabilities, 'function');
  const value = contract.capabilities({});
  for (const key of ['auth', 'catalog', 'trips', 'bookmarks', 'media', 'sharing', 'booking', 'payment']) {
    assert.equal(value[key].mode, 'unavailable', key);
  }
});
test('configured target must be explicit and the two applications must use the same identity', () => {
  assert.equal(typeof contract.backendTarget, 'function');
  const base = { KINNSO_ENVIRONMENT: 'local', KINNSO_SUPABASE_URL: 'http://127.0.0.1:58421',
    KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local',
    KINNSO_APPROVED_SUPABASE_ORIGIN: 'http://127.0.0.1:58421',
    KINNSO_LEGACY_AUTH_ORIGIN: 'http://127.0.0.1:58421' };
  assert.equal(contract.backendTarget(base).origin, base.KINNSO_SUPABASE_URL);
  assert.equal(contract.backendTarget({ ...base, KINNSO_LEGACY_AUTH_ORIGIN: 'https://foreign.supabase.co' }), null);
  assert.equal(contract.backendTarget({ ...base, KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://foreign.supabase.co' }), null);
  assert.equal(contract.backendTarget({ ...base, KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' }), null);
  const value = contract.capabilities(base);
  assert.equal(value.catalog.mode, 'connected');
  assert.equal(value.trips.mode, 'unavailable');
  assert.equal(value.booking.mode, 'unavailable');
  assert.equal(value.payment.mode, 'unavailable');
});
