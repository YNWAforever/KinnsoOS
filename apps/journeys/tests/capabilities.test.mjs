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

const mediaBase = {
  KINNSO_ENVIRONMENT: 'production', KINNSO_SUPABASE_URL: 'https://example.supabase.co',
  KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://example.supabase.co',
  KINNSO_LEGACY_AUTH_ORIGIN: 'https://example.supabase.co',
  KINNSO_ENABLED_CAPABILITIES: 'trips,media,sharing,booking,payment',
};
test('media flag alone cannot advertise an upload that has no finalizer', () => {
  const value = contract.capabilities(mediaBase);
  assert.equal(value.media.mode, 'connected');
  assert.equal(value.mediaUpload?.mode, 'unavailable');
  assert.equal(value.trips.mode, 'connected');
  assert.equal(value.sharing.mode, 'connected');
  assert.equal(value.booking.mode, 'unavailable');
  assert.equal(value.payment.mode, 'unavailable');
});
test('unified upload requires a server key rather than the frontend publishable key', () => {
  for (const key of [undefined, '', 'sb_publishable_test', 'sb_secret_', 'sb_secret_test\n']) {
    assert.equal(contract.capabilities({...mediaBase, KINNSO_MEDIA_RUNTIME:'unified', KINNSO_SUPABASE_SECRET_KEY:key}).mediaUpload?.mode, 'unavailable', String(key));
  }
});
test('unified media accepts a configured server secret without exposing it in capability DTOs', () => {
  const value = contract.capabilities({...mediaBase, KINNSO_MEDIA_RUNTIME:'unified', KINNSO_SUPABASE_SECRET_KEY:'sb_secret_test'});
  assert.equal(value.mediaUpload?.mode, 'connected');
  assert.ok(!JSON.stringify(value).includes('sb_secret_test'));
  assert.equal(contract.capabilities({...mediaBase, KINNSO_MEDIA_RUNTIME:'unified', KINNSO_SUPABASE_SECRET_KEY:'sb_secret_test', KINNSO_ENABLED_CAPABILITIES:'trips,sharing'}).mediaUpload?.mode, 'unavailable');
});
const jwt = claims => 'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
test('legacy unified server JWT must be the service role for the approved project', () => {
  for (const key of [jwt({role:'anon',ref:'example'}), jwt({role:'service_role',ref:'foreign'}), jwt({role:'service_role'})]) {
    assert.equal(contract.capabilities({...mediaBase,KINNSO_MEDIA_RUNTIME:'unified',KINNSO_SUPABASE_SECRET_KEY:key}).mediaUpload?.mode,'unavailable');
  }
  assert.equal(contract.capabilities({...mediaBase,KINNSO_MEDIA_RUNTIME:'unified',KINNSO_SUPABASE_SECRET_KEY:jwt({role:'service_role',ref:'example'})}).mediaUpload?.mode,'connected');
});
test('approved legacy finalizer remains usable and unknown runtime modes stay unavailable', () => {
  const legacy={...mediaBase,KINNSO_SERVICES_ORIGIN:'https://services.example',KINNSO_APPROVED_SERVICES_ORIGIN:'https://services.example'};
  assert.equal(contract.capabilities(legacy).mediaUpload?.mode,'connected');
  assert.equal(contract.capabilities({...legacy,KINNSO_MEDIA_RUNTIME:'unknown'}).mediaUpload?.mode,'unavailable');
  assert.equal(contract.capabilities({...legacy,KINNSO_MEDIA_RUNTIME:'unified'}).mediaUpload?.mode,'unavailable');
});
test('legacy finalizer requires an approved origin with no credentials or URL suffix', () => {
  for (const origin of ['http://services.example','https://user:password@services.example','https://services.example/path','https://services.example/?query=1','https://services.example/#fragment']) {
    assert.equal(contract.capabilities({...mediaBase,KINNSO_SERVICES_ORIGIN:origin,KINNSO_APPROVED_SERVICES_ORIGIN:origin}).mediaUpload?.mode,'unavailable',origin);
  }
  assert.equal(contract.capabilities({...mediaBase,KINNSO_SERVICES_ORIGIN:'https://services.example',KINNSO_APPROVED_SERVICES_ORIGIN:'https://foreign.example'}).mediaUpload?.mode,'unavailable');
});
test('local unified media matches only the owned runtime ports and retains local service JWT compatibility', () => {
  const local={...mediaBase,KINNSO_ENVIRONMENT:'local',KINNSO_MEDIA_RUNTIME:'unified',KINNSO_SUPABASE_SECRET_KEY:jwt({role:'service_role'}),KINNSO_SUPABASE_URL:'http://127.0.0.1:58421',KINNSO_APPROVED_SUPABASE_ORIGIN:'http://127.0.0.1:58421',KINNSO_LEGACY_AUTH_ORIGIN:'http://127.0.0.1:58421'};
  assert.equal(contract.capabilities(local).mediaUpload?.mode,'connected');
  assert.equal(contract.capabilities({...local,KINNSO_SUPABASE_URL:'http://127.0.0.1:9999',KINNSO_APPROVED_SUPABASE_ORIGIN:'http://127.0.0.1:9999',KINNSO_LEGACY_AUTH_ORIGIN:'http://127.0.0.1:9999'}).mediaUpload?.mode,'unavailable');
  const ci={...local,KINNSO_SUPABASE_URL:'http://127.0.0.1:54421',KINNSO_APPROVED_SUPABASE_ORIGIN:'http://127.0.0.1:54421',KINNSO_LEGACY_AUTH_ORIGIN:'http://127.0.0.1:54421'};
  assert.equal(contract.capabilities(ci).mediaUpload?.mode,'unavailable');
  assert.equal(contract.capabilities({...ci,CI:'true',KINNSO_TEST_PROJECT:'kinnso-v3'}).mediaUpload?.mode,'connected');
});
