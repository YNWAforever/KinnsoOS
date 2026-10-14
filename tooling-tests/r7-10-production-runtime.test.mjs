import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';

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

function profileConfig(overrides = {}) {
  const env = { CI: 'true', E2E_PROFILE_ENQUIRIES_LOCAL: '1', E2E_BASE_URL: 'http://127.0.0.1:3000',
    SUPABASE_URL: 'http://127.0.0.1:54421', SUPABASE_ANON_KEY: 'inert-local-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'inert-local-service-role', SUPABASE_DB_CONTAINER: 'supabase_db_owned', ...overrides };
  const source = readFileSync(new URL('../apps/e2e/profile-enquiries-local.ts', import.meta.url), 'utf8');
  const local = evaluate(source, env, { 'node:crypto': { createHmac } });
  return evaluate(readFileSync(new URL('../apps/e2e/playwright.profile-enquiries.config.ts', import.meta.url), 'utf8'), env, {
    'node:fs': { readFileSync: () => '' },
    'node:path': { resolve: (...parts) => parts.join('/') },
    '@playwright/test': { defineConfig: (value) => value },
    './playwright.config': { default: { use: {}, retries: 1, timeout: 120_000 } },
    './profile-enquiries-local': local,
  }).default;
}

test('CI profile enquiries consumes the compiled public and authenticated route table', () => {
  const value = profileConfig();
  assert.equal(value.webServer.command, 'pnpm --filter web exec next start --hostname 127.0.0.1 --port 3000');
  assert.equal(value.webServer.reuseExistingServer, false);
  assert.equal(value.webServer.env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54421');
  assert.equal(value.webServer.env.ENQUIRY_SUBMISSION_SECRET, 'r7-7-e2e-local-only-dummy-not-a-production-secret');
  assert.equal(value.retries, 1);
  assert.equal(value.timeout, 120_000);
});

test('local profile enquiries retains the owned dev server', () => {
  assert.equal(profileConfig({ CI: undefined }).webServer.command,
    'pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3000');
});

test('compiled profile enquiries keeps opt-in, loopback, credentials and container guards', () => {
  assert.throws(() => profileConfig({ E2E_PROFILE_ENQUIRIES_LOCAL: undefined }), /E2E_PROFILE_ENQUIRIES_LOCAL=1 is required/);
  assert.throws(() => profileConfig({ E2E_BASE_URL: 'https://kinnso-os.vercel.app' }), /E2E_BASE_URL must be an http loopback URL/);
  assert.throws(() => profileConfig({ SUPABASE_URL: 'https://example.supabase.co' }), /SUPABASE_URL must be an http loopback URL/);
  assert.throws(() => profileConfig({ SUPABASE_SERVICE_ROLE_KEY: undefined }), /credentials are incomplete/);
  assert.throws(() => profileConfig({ SUPABASE_DB_CONTAINER: 'supabase_db;unsafe' }), /not a safe local container name/);
});
