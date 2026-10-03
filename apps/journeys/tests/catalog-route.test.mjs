import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../app/api/catalog/route.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { GET } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const approved = {
  KINNSO_ENVIRONMENT: 'production',
  KINNSO_SUPABASE_URL: 'https://example.supabase.co',
  KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://example.supabase.co',
  KINNSO_LEGACY_AUTH_ORIGIN: 'https://example.supabase.co',
};

function setEnvironment(t, overrides = {}) {
  const values = { ...approved, ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test('catalog HTTP route retains the approved shared identity configuration', async t => {
  setEnvironment(t);
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://example.supabase.co');
    assert.equal(url.pathname, '/rest/v1/guides');
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(options.headers.apikey, 'sb_publishable_test');
    return Response.json([]);
  });
  const response = await GET(new Request('https://journeys.example/api/catalog'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items, []);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('catalog HTTP route fails closed for mismatched or missing identity approval', async t => {
  for (const overrides of [
    { KINNSO_APPROVED_SUPABASE_ORIGIN: undefined },
    { KINNSO_LEGACY_AUTH_ORIGIN: 'https://different.supabase.co' },
    { KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' },
  ]) {
    await t.test(JSON.stringify(Object.keys(overrides)), async sub => {
      setEnvironment(sub, overrides);
      sub.mock.method(globalThis, 'fetch', async () => { throw new Error('Unapproved backend must not be contacted'); });
      const response = await GET(new Request('https://journeys.example/api/catalog'));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: 'unconfigured', code: 'catalog_not_configured' });
    });
  }
});
