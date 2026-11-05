import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

let subject = {};
try { subject = await import('../lib/seo/public-sessions.ts'); } catch {}
const require = createRequire(import.meta.url);
const env = {
  KINNSO_SUPABASE_URL: 'https://approved.supabase.co',
  KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://approved.supabase.co',
  KINNSO_LEGACY_AUTH_ORIGIN: 'https://approved.supabase.co',
  KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};
const creatorId = '11111111-1111-4111-8111-111111111111';
const session = id => ({
  id,
  slug: 'session-' + id.slice(-1),
  title: 'Authored session ' + id.slice(-1),
  description: 'Authored session description',
  type: 'destination_briefing',
  starts_at: '2026-06-01T10:00:00Z',
  duration_minutes: 45,
  embed_url: 'https://external.example/live',
  replay_url: null,
  destination_tags: ['Tokyo', '東京'],
  status: 'scheduled',
  host_creator_id: creatorId,
  privateMarker: 'NEVER',
});
const upcoming = session('22222222-2222-4222-8222-222222222222');
const ended = {
  ...session('33333333-3333-4333-8333-333333333333'),
  status: 'ended',
  replay_url: 'https://replay.example/watch',
};
const hostRow = {
  id: creatorId,
  handle: 'public-host',
  display_name: 'Public host',
  public_profile: { privateMarker: 'NEVER' },
};

test('session discovery merges live inventory and replay-only inventory with bounded stable reads', async () => {
  assert.equal(typeof subject.readPublicSessionDiscovery, 'function');
  const requests = [];
  const result = await subject.readPublicSessionDiscovery(env, async (input, options) => {
    const url = new URL(input);
    requests.push(url);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.cache, 'no-store');
    if (url.pathname === '/rest/v1/community_sessions') {
      if (url.searchParams.get('status') === 'in.(scheduled,live)') {
        assert.equal(url.searchParams.get('order'), 'starts_at.asc,id.asc');
        assert.equal(url.searchParams.get('limit'), '21');
        return Response.json([upcoming]);
      }
      assert.equal(url.searchParams.get('status'), 'eq.ended');
      assert.equal(url.searchParams.get('replay_url'), 'not.is.null');
      assert.equal(url.searchParams.get('order'), 'starts_at.desc,id.asc');
      assert.equal(url.searchParams.get('limit'), '21');
      return Response.json([ended]);
    }
    assert.equal(url.pathname, '/rest/v1/creators');
    assert.equal(url.searchParams.get('id'), 'in.(' + creatorId + ')');
    assert.equal(url.searchParams.get('status'), 'eq.active');
    assert.equal(url.searchParams.get('public_profile'), 'not.is.null');
    assert.equal(url.searchParams.get('limit'), '21');
    return Response.json([hostRow]);
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.items.map(item => item.id), [upcoming.id, ended.id]);
  assert.deepEqual(result.items[0].host, { handle: 'public-host', displayName: 'Public host' });
  assert.equal(result.items[1].replayUrl, 'https://replay.example/watch');
  assert.ok(!JSON.stringify(result).includes('external.example'));
  assert.ok(!JSON.stringify(result).includes('NEVER'));
  assert.equal(requests.length, 3);
});

test('session discovery distinguishes empty, unavailable and malformed inventory', async () => {
  assert.deepEqual(
    await subject.readPublicSessionDiscovery(env, async () => Response.json([])),
    { status: 'empty', items: [] },
  );
  assert.deepEqual(
    await subject.readPublicSessionDiscovery(env, async () => Response.json({}, { status: 503 })),
    { status: 'unavailable', items: [] },
  );
  assert.deepEqual(
    await subject.readPublicSessionDiscovery(env, async input => {
      const url = new URL(input);
      if (url.pathname === '/rest/v1/community_sessions') {
        return url.searchParams.get('status') === 'in.(scheduled,live)'
          ? Response.json([{ ...upcoming, status: 'cancelled' }])
          : Response.json([]);
      }
      return Response.json([hostRow]);
    }),
    { status: 'unavailable', items: [] },
  );
  for (const change of [
    { duration_minutes: 0 },
    { destination_tags: Array(101).fill('Tokyo') },
    { starts_at: 'invalid' },
    { type: 'unknown' },
    { slug: '../private' },
  ]) {
    assert.deepEqual(
      await subject.readPublicSessionDiscovery(env, async input => {
        const url = new URL(input);
        return url.pathname === '/rest/v1/community_sessions'
          ? url.searchParams.get('status') === 'in.(scheduled,live)'
            ? Response.json([{ ...upcoming, ...change }])
            : Response.json([])
          : Response.json([]);
      }),
      { status: 'unavailable', items: [] },
      JSON.stringify(change),
    );
  }
});

test('exact session detail is independent of discovery and keeps only public replay links', async () => {
  assert.equal(typeof subject.readPublicSession, 'function');
  let calls = 0;
  const result = await subject.readPublicSession('session-2', env, async input => {
    const url = new URL(input);
    if (calls++ === 0) {
      assert.equal(url.pathname, '/rest/v1/community_sessions');
      assert.equal(url.searchParams.get('slug'), 'eq.session-2');
      assert.equal(url.searchParams.get('limit'), '2');
      return Response.json([{
        ...upcoming,
        status: 'ended',
        replay_url: 'http://unsafe.example/watch',
      }]);
    }
    assert.equal(url.pathname, '/rest/v1/creators');
    return Response.json([]);
  });
  assert.equal(result.slug, 'session-2');
  assert.equal(result.replayUrl, null);
  assert.equal(result.host, null);
  for (const status of ['cancelled', 'unknown']) {
    assert.equal(
      await subject.readPublicSession('session-2', env, async () =>
        Response.json([{ ...upcoming, status }]),
      ),
      null,
    );
  }
  await assert.rejects(
    subject.readPublicSession('session-2', env, async () => Response.json({}, { status: 503 })),
    /session_unavailable/,
  );
});

test('session metadata and SSR are localized without RSVP or provider execution', async () => {
  const value = {
    id: upcoming.id,
    slug: upcoming.slug,
    title: upcoming.title,
    description: upcoming.description,
    type: upcoming.type,
    startsAt: upcoming.starts_at,
    durationMinutes: upcoming.duration_minutes,
    destinationTags: upcoming.destination_tags,
    status: upcoming.status,
    replayUrl: null,
    host: { handle: 'public-host', displayName: 'Public host' },
  };
  for (const locale of ['en', 'zh-HK', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th']) {
    const meta = subject.sessionPageMetadata(value, locale);
    assert.equal(
      meta.alternates.canonical,
      `https://kinnso-os.vercel.app/${locale}/sessions/session-2`,
    );
    assert.deepEqual(meta.robots, { index: false, follow: false });
  }
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../lib/seo/PublicSessionContent.tsx', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'next/link'],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
  const detail = renderToStaticMarkup(
    module.exports.PublicSessionContent({ session: value, locale: 'ko' }),
  );
  assert.match(detail, /<h1 lang="">Authored session 2<\/h1>/);
  assert.match(detail, /\/ko\/c\/public-host/);
  assert.doesNotMatch(detail, /<form|<iframe|RSVP|참가 신청/i);
  const index = renderToStaticMarkup(
    module.exports.PublicSessionsContent({
      locale: 'th',
      discovery: { status: 'empty', items: [] },
    }),
  );
  assert.match(index, /ตอนนี้ยังไม่มีเซสชันที่กำหนดไว้/);
  assert.doesNotMatch(index, /<form|<iframe/i);
});

test('session routes render before private actor and expose unavailable rather than empty', async () => {
  const pageBuild = await build({
    entryPoints: [fileURLToPath(new URL('../app/[locale]/[[...route]]/page.tsx', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'next/navigation'],
    plugins: [{
      name: 'session-page-fixture',
      setup(build) {
        build.onResolve({ filter: /travel\/Workbench$/ }, () => ({ path: 'fixture-workbench', external: true }));
        build.onResolve({ filter: /(auth\/actor|supabase\/server)$/ }, () => ({ path: 'fixture-private', external: true }));
        build.onResolve({ filter: /seo\/public-sessions$/ }, () => ({ path: 'fixture-sessions', external: true }));
      },
    }],
  });
  const value = {
    id: upcoming.id,
    slug: upcoming.slug,
    title: upcoming.title,
    description: upcoming.description,
    type: upcoming.type,
    startsAt: upcoming.starts_at,
    durationMinutes: upcoming.duration_minutes,
    destinationTags: upcoming.destination_tags,
    status: upcoming.status,
    replayUrl: null,
    host: { handle: 'public-host', displayName: 'Public host' },
  };
  const pageModule = { exports: {} };
  new Function('require', 'module', 'exports', pageBuild.outputFiles[0].text)((name) => {
    if (name === 'fixture-workbench') {
      return { Workbench: () => { throw new Error('PUBLIC_ROUTE_MOUNTED_WORKBENCH'); } };
    }
    if (name === 'fixture-private') {
      return {
        currentActor: () => { throw new Error('PUBLIC_ROUTE_QUERIED_PRIVATE_ACTOR'); },
        serverClient: () => { throw new Error('PUBLIC_ROUTE_OPENED_PRIVATE_CLIENT'); },
      };
    }
    if (name === 'fixture-sessions') {
      return {
        readPublicSessionDiscovery: async () => ({ status: 'unavailable', items: [] }),
        readPublicSession: async slug => slug === value.slug ? value : null,
        sessionIndexMetadata: locale => ({
          title: 'Sessions',
          alternates: { canonical: `https://kinnso-os.vercel.app/${locale}/sessions` },
          robots: { index: false, follow: false },
        }),
        sessionPageMetadata: (session, locale) => ({
          title: session.title,
          alternates: {
            canonical: `https://kinnso-os.vercel.app/${locale}/sessions/${session.slug}`,
          },
          robots: { index: false, follow: false },
        }),
      };
    }
    if (name === 'next/navigation') {
      return {
        notFound: () => { throw new Error('NOT_FOUND'); },
        redirect: () => { throw new Error('UNEXPECTED_REDIRECT'); },
      };
    }
    return require(name);
  }, pageModule, pageModule.exports);
  const index = renderToStaticMarkup(
    await pageModule.exports.default({
      params: Promise.resolve({ locale: 'ja', route: ['sessions'] }),
    }),
  );
  assert.match(index, /コンテンツを読み込めませんでした/);
  const detail = renderToStaticMarkup(
    await pageModule.exports.default({
      params: Promise.resolve({ locale: 'ja', route: ['sessions', value.slug] }),
    }),
  );
  assert.match(detail, /Authored session 2/);
  const meta = await pageModule.exports.generateMetadata({
    params: Promise.resolve({ locale: 'ja', route: ['sessions', value.slug] }),
  });
  assert.equal(
    meta.alternates.canonical,
    `https://kinnso-os.vercel.app/ja/sessions/${value.slug}`,
  );
});
