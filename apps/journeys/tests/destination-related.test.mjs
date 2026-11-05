import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../lib/seo/destination-related.ts'); } catch {}

const env = {
  KINNSO_SUPABASE_URL: 'https://approved.supabase.co',
  KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://approved.supabase.co',
  KINNSO_LEGACY_AUTH_ORIGIN: 'https://approved.supabase.co',
  KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};
const destination = {
  slug: 'tokyo',
  name: 'Tokyo',
  description: 'Authored destination',
  heroImageUrl: null,
  matchTerms: ['Tokyo', '東京', 'Shibuya'],
  guideCount: 1,
  experienceCount: 1,
  latestPublishedAt: '2026-01-01T00:00:00Z',
};
const guideCreatorId='11111111-1111-4111-8111-111111111111';
const guideRow = {
  id: '11111111-1111-4111-8111-111111111111',
  creator_id: guideCreatorId,
  title: 'Authored guide',
  summary: 'Guide summary',
  city: 'Tokyo',
  cover_url: 'https://cdn.kinnso.ai/guide.jpg',
  creator_handle: 'guide-author',
  saves_count: 3,
  published_at: '2026-01-01T00:00:00Z',
  privateMarker: 'NEVER',
};
const experienceRow = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'city-walk',
  title: 'Authored experience',
  summary: 'Experience summary',
  description: 'Experience description',
  city: 'Tokyo',
  price_amount: 1250,
  currency: 'JPY',
  duration_minutes: 90,
  cover_url: 'https://cdn.kinnso.ai/experience.jpg',
  published_at: '2026-01-02T00:00:00Z',
  saves_count: 4,
  merchant_profile_id: '33333333-3333-4333-8333-333333333333',
  privateMarker: 'NEVER',
};

test('related guide reader sanitizes terms and uses one bounded published query', async () => {
  assert.equal(typeof subject.readPublicGuidesForTerms, 'function');
  const result = await subject.readPublicGuidesForTerms(
    [' Tokyo ', '東京', 'Tokyo', 'Shibuya,())', 'a'],
    6,
    env,
    async (input, options) => {
      const url = new URL(input);
      if(url.pathname==='/rest/v1/creators'){assert.equal(url.searchParams.get('id'),'in.('+guideCreatorId+')');assert.equal(url.searchParams.get('status'),'eq.active');return Response.json([{id:guideCreatorId}]);}
      assert.equal(url.pathname, '/rest/v1/guides');
      assert.equal(url.searchParams.get('status'), 'eq.published');
      assert.equal(url.searchParams.get('limit'), '6');
      assert.equal(url.searchParams.get('order'), 'published_at.desc.nullslast,id.asc');
      assert.equal(
        url.searchParams.get('or'),
        '(city.ilike.%Tokyo%,city.ilike.%東京%,city.ilike.%Shibuya%)',
      );
      assert.equal(url.searchParams.get('select'), 'id,title,summary,city,cover_url,creator_handle,saves_count,published_at,creator_id');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.cache, 'no-store');
      return Response.json([guideRow]);
    },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, guideRow.id);
  assert.equal(result[0].coverUrl, guideRow.cover_url);
  assert.ok(!JSON.stringify(result).includes('NEVER'));
});

test('related guide rejection, unsafe values and oversized requests fail closed', async () => {
  assert.deepEqual(
    await subject.readPublicGuidesForTerms([], 6, env, () => assert.fail('must not fetch')),
    [],
  );
  for (const limit of [0, 7, 1.5]) {
    assert.deepEqual(
      await subject.readPublicGuidesForTerms(['Tokyo'], limit, env, () => assert.fail('must not fetch')),
      [],
    );
  }
  const result = await subject.readPublicGuidesForTerms(['Tokyo'], 6, env, async () =>
    Response.json([{
      ...guideRow,
      id: '../private',
      cover_url: 'https://outside.test/image',
    }]),
  );
  assert.deepEqual(result, []);
});

test('related guide backend failure stays unavailable instead of becoming an empty section', async () => {
  await assert.rejects(
    subject.readPublicGuidesForTerms(['Tokyo'], 6, env, async () =>
      Response.json({}, { status: 503 }),
    ),
    /guide_unavailable/,
  );
});

test('related guides exclude rows whose creator is no longer active and public',async()=>{
 const creatorId='11111111-1111-4111-8111-111111111111';let creatorCalls=0;
 const result=await subject.readPublicGuidesForTerms(['Tokyo'],6,env,async input=>{
  const url=new URL(input);
  if(url.pathname==='/rest/v1/guides')return Response.json([{...guideRow,creator_id:creatorId}]);
  assert.equal(url.pathname,'/rest/v1/creators');creatorCalls++;return Response.json([]);
 });
 assert.deepEqual(result,[]);assert.equal(creatorCalls,1);
});

test('destination related content keeps successful sections when another source fails', async () => {
  assert.equal(typeof subject.readDestinationRelated, 'function');
  const result = await subject.readDestinationRelated(destination, 'ja', env, async (input, options) => {
    const url = new URL(input);
    assert.equal(options.headers.Authorization, undefined);
    if (url.pathname === '/rest/v1/guides') return Response.json([guideRow]);
    if (url.pathname === '/rest/v1/creators') return Response.json([{id:guideCreatorId}]);
    if (url.pathname === '/rest/v1/experiences') return Response.json({}, { status: 503 });
    if (url.pathname === '/rest/v1/rpc/search_articles') {
      const body = JSON.parse(options.body);
      assert.ok(body.p_q.length <= 200);
      return Response.json([{
        url: 'tokyo-guide-' + body.p_category,
        category: body.p_category,
        title: 'Authored article ' + body.p_category,
        summary: 'Summary',
        thumbnails: [],
        published_at: '2026-01-03T00:00:00Z',
        total_count: 1,
      }]);
    }
    if (url.pathname === '/rest/v1/community_sessions') {
      return Response.json({}, { status: 503 });
    }
    return Response.json([], { status: 503 });
  });
  assert.equal(result.guides.status, 'ready');
  assert.equal(result.experiences.status, 'unavailable');
  assert.equal(result.articles.status, 'ready');
  assert.equal(result.articles.items.length, 3);
  assert.equal(result.sessions.status, 'unavailable');
  assert.ok(result.guides.items[0].id);
});

test('destination related experience and article queries preserve bounded destination semantics', async () => {
  const seen = [];
  const result = await subject.readDestinationRelated(destination, 'th', env, async (input, options) => {
    const url = new URL(input);
    seen.push(url.pathname);
    if (url.pathname === '/rest/v1/guides') return Response.json([]);
    if (url.pathname === '/rest/v1/experiences') {
      assert.equal(url.searchParams.get('status'), 'eq.published');
      assert.equal(url.searchParams.get('limit'), '6');
      assert.match(url.searchParams.get('or'), /city\.ilike\.%Tokyo%/);
      assert.doesNotMatch(url.searchParams.get('or'), /[,())]+Shibuya[(),)]/);
      return Response.json([experienceRow]);
    }
    if (url.pathname === '/rest/v1/rpc/search_articles') {
      const body = JSON.parse(options.body);
      assert.equal(body.p_locale, 'th');
      assert.match(body.p_q, /Tokyo/);
      assert.ok(body.p_q.length <= 200);
      return Response.json([]);
    }
    if (url.pathname === '/rest/v1/community_sessions') return Response.json([]);
    return Response.json([]);
  });
  assert.equal(result.guides.status, 'empty');
  assert.equal(result.experiences.status, 'ready');
  assert.equal(result.experiences.items[0].slug, 'city-walk');
  assert.equal(result.articles.status, 'empty');
  assert.equal(result.sessions.status, 'omitted');
  assert.ok(seen.includes('/rest/v1/guides'));
  assert.ok(seen.includes('/rest/v1/experiences'));
  assert.equal(seen.filter(value => value === '/rest/v1/rpc/search_articles').length, 3);
});

test('destination metadata stays canonical and noindex in every public language', async () => {
  const presentation = await import('../lib/seo/public-destinations.ts');
  for (const locale of ['en', 'zh-HK', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th']) {
    const index = subject.destinationIndexMetadata(locale);
    const detail = subject.destinationPageMetadata(destination, locale);
    assert.equal(index.alternates.canonical, `https://kinnso-os.vercel.app/${locale}/destinations`);
    assert.equal(detail.alternates.canonical, `https://kinnso-os.vercel.app/${locale}/destinations/tokyo`);
    assert.deepEqual(detail.robots, { index: false, follow: false });
    assert.equal(typeof presentation.readDestinationListing, 'function');
  }
});
