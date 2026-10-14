import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const localSource = readFileSync(new URL('../apps/e2e/r7-10-local.ts', import.meta.url), 'utf8');
const configSource = readFileSync(new URL('../apps/e2e/playwright.r7-10.config.ts', import.meta.url), 'utf8');

function evaluate(source, env, dependencies) {
  const module = { exports: {} };
  const js = ts.transpileModule(source.replaceAll('import.meta.dirname', '__dirname'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports, process: { env }, URL, __dirname: '/owned/apps/e2e',
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `unexpected configuration dependency ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}

function config(overrides = {}) {
  const env = { CI: 'true', R7_10_BOOKING_STATE: 'on', STRIPE_SECRET_KEY: 'sk_test_inert_fixture',
    STRIPE_WEBHOOK_SECRET: 'whsec_inert_fixture', ...overrides };
  const local = evaluate(localSource, env, {});
  return evaluate(configSource, env, {
    'node:fs': { readFileSync: () => 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421\nNEXT_PUBLIC_SUPABASE_ANON_KEY=inert-local-anon\n' },
    'node:path': { resolve: (...parts) => parts.join('/') },
    '@playwright/test': { defineConfig: (value) => value },
    './playwright.config': { default: { use: {}, retries: 1, timeout: 120_000 } },
    './r7-10-local': local,
    './r7-10-specs': { R7_10_OFF_SPECS: ['r7-10-booking.spec.ts'] },
  }).default;
}

test('Booking ON in CI consumes the existing production build instead of a mutable dev router', () => {
  const value = config();
  assert.equal(value.webServer.command, 'pnpm --filter web exec next start --hostname 127.0.0.1 --port 3101');
  assert.equal(value.webServer.reuseExistingServer, false);
  assert.equal(value.webServer.env.BOOKING_LIVE, 'true');
  assert.equal(value.webServer.env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54421');
  assert.equal(value.webServer.env.NEXT_PUBLIC_SITE_URL, 'http://127.0.0.1:3101');
  assert.equal(value.retries, 1);
  assert.equal(value.timeout, 120_000);
});

test('Booking OFF CI keeps its dev server and disabled product state', () => {
  const value = config({ R7_10_BOOKING_STATE: 'off' });
  assert.equal(value.webServer.command, 'pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3100');
  assert.equal(value.webServer.env.BOOKING_LIVE, 'false');
});

test('the local developer Booking ON invocation still owns its dev server', () => {
  const value = config({ CI: undefined });
  assert.equal(value.webServer.command, 'pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3101');
});

test('production-server selection does not relax loopback and Stripe test-mode guards', () => {
  assert.throws(() => config({ E2E_BASE_URL: 'https://kinnso-os.vercel.app' }), /E2E_BASE_URL must be loopback/);
  assert.throws(() => config({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }), /NEXT_PUBLIC_SUPABASE_URL must be loopback/);
  assert.throws(() => config({ STRIPE_SECRET_KEY: 'sk_live_inert' }), /STRIPE_SECRET_KEY must start with sk_test_/);
  assert.throws(() => config({ STRIPE_SECRET_KEY: undefined }), /STRIPE_SECRET_KEY is required/);
  assert.throws(() => config({ STRIPE_WEBHOOK_SECRET: undefined }), /STRIPE_WEBHOOK_SECRET is required/);
});
