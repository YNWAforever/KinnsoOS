import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
let routes = {};
try { routes = await import('../lib/seo/public-routes.ts'); } catch {}
const require = createRequire(import.meta.url);
const routeBuild = await build({
  entryPoints: [fileURLToPath(new URL('../app/travel/routes.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
});
const travelModule = { exports: {} };
new Function('require', 'module', 'exports', routeBuild.outputFiles[0].text)(
  require,
  travelModule,
  travelModule.exports,
);
const travelRoutes = travelModule.exports;

const locales = ['en', 'zh-HK', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th'];
const empty = () => new URLSearchParams();

test('public route parser accepts the destination journey in every supported locale', () => {
  assert.equal(typeof routes.parsePublicRoute, 'function');
  for (const locale of locales) {
    assert.deepEqual(
      routes.parsePublicRoute(locale, ['destinations'], empty()),
      { kind: 'destinations-index', page: 1 },
    );
    assert.deepEqual(
      routes.parsePublicRoute(locale, ['destinations', '東京'], empty()),
      { kind: 'destination', slug: '東京' },
    );
    assert.deepEqual(
      routes.parsePublicRoute(locale, ['g', '香港攻略'], empty()),
      { kind: 'guide', reference: '香港攻略' },
    );
    assert.deepEqual(
      routes.parsePublicRoute(locale, ['c', 'jane.doe'], empty()),
      { kind: 'creator', handle: 'jane.doe', page: 1 },
    );
    assert.deepEqual(
      routes.parsePublicRoute(locale, ['experiences', 'city-walk'], empty()),
      { kind: 'experience', slug: 'city-walk' },
    );
    assert.deepEqual(
      routes.parsePublicRoute(locale, ['m', 'merchant-one'], empty()),
      { kind: 'merchant', slug: 'merchant-one' },
    );
    assert.deepEqual(
      routes.parsePublicRoute(locale, ['sessions'], empty()),
      { kind: 'sessions-index' },
    );
    assert.deepEqual(
      routes.parsePublicRoute(locale, ['sessions', 'session-one'], empty()),
      { kind: 'session', slug: 'session-one' },
    );
  }
});

test('public route hrefs normalize only the legacy Hong Kong locale alias', () => {
  assert.equal(typeof routes.publicRouteHref, 'function');
  assert.equal(
    routes.publicRouteHref('zh-hk', { kind: 'destination', slug: '東京' }),
    '/zh-HK/destinations/%E6%9D%B1%E4%BA%AC',
  );
  assert.equal(
    routes.publicRouteHref('ja', { kind: 'creator', handle: 'a.b', page: 2 }),
    '/ja/c/a.b?page=2',
  );
});

test('public route parser rejects ambiguous queries, unsafe identifiers and unsupported paths', () => {
  assert.equal(typeof routes.parsePublicRoute, 'function');
  for (const locale of ['fr', '']) {
    assert.equal(
      routes.parsePublicRoute(locale, ['destinations'], empty()),
      null,
    );
  }
  for (const query of ['page=0', 'page=10001', 'page=1.5', 'page=1&page=2']) {
    assert.equal(
      routes.parsePublicRoute('en', ['destinations'], new URLSearchParams(query)),
      null,
    );
  }
  for (const slug of ['', '..', '%2Fsecret', '%252Fsecret', 'a,b', 'a\\b']) {
    assert.equal(
      routes.parsePublicRoute('en', ['destinations', slug], empty()),
      null,
    );
  }
  for (const path of [
    ['destinations', 'tokyo', 'extra'],
    ['m', 'one', 'two'],
    ['sessions', 'one', 'two'],
    ['unknown', 'one'],
  ]) {
    assert.equal(routes.parsePublicRoute('en', path, empty()), null);
  }
});

test('backend-disabled indexes stay on static public entries', () => {
  const off = {};
  const on = {
    KINNSO_SUPABASE_URL: 'https://approved.supabase.co',
    KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://approved.supabase.co',
    KINNSO_LEGACY_AUTH_ORIGIN: 'https://approved.supabase.co',
    KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  };
  assert.equal(routes.readLiveArticles(['articles'], off), false);
  assert.equal(routes.readLiveArticles(['articles', 'destinations'], off), false);
  assert.equal(routes.readLiveArticles(['articles'], on), true);
  assert.equal(routes.readLiveSessions(['sessions'], off), false);
  assert.equal(routes.readLiveSessions(['sessions'], on), true);
  assert.equal(routes.readLiveSessions(['sessions', 'briefing'], on), false);
  assert.equal(routes.bareNamespaceIsPublicEntry('en', ['experiences'], empty()), true);
  assert.equal(routes.bareNamespaceIsPublicEntry('en', ['experiences', 'not a slug'], empty()), false);
  assert.equal(routes.bareNamespaceIsPublicEntry('en', ['sessions'], empty()), false);
});

test('known-route recognition accepts dynamic public content without hard-coded destination slugs', () => {
  assert.equal(typeof travelRoutes.isKnownRoute, 'function');
  for (const path of [
    'destinations/tokyo-beyond-the-guide',
    'destinations/東京',
    'experiences/city-walk',
    'm/a-valid-merchant',
    'sessions/a-valid-session',
  ]) {
    assert.equal(travelRoutes.isKnownRoute(path), true, path);
  }
  for (const path of [
    'destinations/..',
    'experiences/a/b',
    'm/%2Fsecret',
    'sessions/%252Fsecret',
  ]) {
    assert.equal(travelRoutes.isKnownRoute(path), false, path);
  }
  assert.equal(travelRoutes.isKnownRoute('trips/private-id'), true);
  assert.equal(travelRoutes.isKnownRoute('studio/guides/new'), true);
});
