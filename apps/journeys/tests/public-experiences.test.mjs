import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

let subject = {};
try { subject = await import('../lib/seo/public-experiences.ts'); } catch {}

const require = createRequire(import.meta.url);
const env = {
  KINNSO_SUPABASE_URL: 'https://approved.supabase.co',
  KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://approved.supabase.co',
  KINNSO_LEGACY_AUTH_ORIGIN: 'https://approved.supabase.co',
  KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};
const merchantId = '11111111-1111-4111-8111-111111111111';
const experienceRow = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'city-walk',
  title: 'Authored city walk',
  summary: 'Summary',
  description: 'Authored description',
  city: 'Tokyo',
  price_amount: 1250,
  currency: 'JPY',
  duration_minutes: 90,
  cover_url: 'https://cdn.kinnso.ai/walk.jpg',
  published_at: '2026-01-01T00:00:00Z',
  saves_count: 4,
  merchant_profile_id: merchantId,
  privateMarker: 'NEVER',
};
const merchantRow = {
  id: merchantId,
  slug: 'merchant-one',
  company_name: 'Authored merchant',
  tagline: 'Public tagline',
  city: 'Tokyo',
  logo_url: 'https://cdn.kinnso.ai/logo.png',
  website_url: 'https://example.com',
  contact_email: 'private@example.test',
  created_at: '2026-01-01T00:00:00Z',
};

test('experience detail binds exact slug and reads attribution from the public merchant view', async () => {
  assert.equal(typeof subject.readPublicExperience, 'function');
  let calls = 0;
  const result = await subject.readPublicExperience('city-walk', env, async (input, options) => {
    const url = new URL(input);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.apikey, env.KINNSO_SUPABASE_PUBLISHABLE_KEY);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    if (calls++ === 0) {
      assert.equal(url.pathname, '/rest/v1/experiences');
      assert.equal(url.searchParams.get('slug'), 'eq.city-walk');
      assert.equal(url.searchParams.get('status'), 'eq.published');
      assert.equal(url.searchParams.get('limit'), '2');
      assert.ok(!url.searchParams.get('select').includes('*'));
      return Response.json([experienceRow]);
    }
    assert.equal(url.pathname, '/rest/v1/merchant_public_profiles');
    assert.equal(url.searchParams.get('id'), 'eq.' + merchantId);
    assert.equal(url.searchParams.get('limit'), '2');
    assert.equal(url.searchParams.get('select'), 'id,slug,company_name,tagline,city,logo_url,website_url,created_at');
    return Response.json([merchantRow]);
  });
  assert.equal(calls, 2);
  assert.equal(result.slug, 'city-walk');
  assert.equal(result.priceAmount, 1250);
  assert.equal(result.durationMinutes, 90);
  assert.deepEqual(result.merchant, { slug: 'merchant-one', companyName: 'Authored merchant' });
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
  assert.ok(!JSON.stringify(result).includes('NEVER'));
});

test('experience reads distinguish missing, unavailable and malformed records', async () => {
  assert.equal(typeof subject.readPublicExperience, 'function');
  assert.equal(await subject.readPublicExperience('missing', env, async () => Response.json([])), null);
  await assert.rejects(
    subject.readPublicExperience('city-walk', env, async () => Response.json({}, { status: 503 })),
    /experience_unavailable/,
  );
  for (const change of [
    { slug: 'other' },
    { status: 'draft' },
    { price_amount: -1 },
    { currency: 'EUR' },
    { duration_minutes: 0 },
    { published_at: 'invalid' },
    { saves_count: -1 },
  ]) {
    await assert.rejects(
      subject.readPublicExperience('city-walk', env, async () => Response.json([{ ...experienceRow, ...change }])),
      /experience_schema/,
      JSON.stringify(change),
    );
  }
  await assert.rejects(
    subject.readPublicExperience('city-walk', env, async (input) => {
      const url = new URL(input);
      return url.pathname === '/rest/v1/experiences'
        ? Response.json([experienceRow, experienceRow])
        : Response.json([merchantRow]);
    }),
    /experience_schema/,
  );
  await assert.rejects(
    subject.readPublicExperience('city-walk', env, async (input) => {
      const url = new URL(input);
      return url.pathname === '/rest/v1/experiences'
        ? Response.json([experienceRow])
        : Response.json([merchantRow, merchantRow]);
    }),
    /experience_schema/,
  );
});

test('experience projections reject unsafe media and website values without exposing private fields', async () => {
  assert.equal(typeof subject.readPublicExperience, 'function');
  const result = await subject.readPublicExperience('city-walk', env, async (input) => {
    const url = new URL(input);
    return url.pathname === '/rest/v1/experiences'
      ? Response.json([{ ...experienceRow, cover_url: 'https://outside.test/image' }])
      : Response.json([{
          ...merchantRow,
          logo_url: 'https://user:pass@cdn.kinnso.ai/logo.png',
          website_url: 'http://example.com/private',
        }]);
  });
  assert.equal(result.coverUrl, null);
  assert.ok(!JSON.stringify(result).includes('outside.test'));
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
});

test('merchant experience cards bind one merchant and use a deterministic bounded page', async () => {
  assert.equal(typeof subject.readMerchantExperiences, 'function');
  const result = await subject.readMerchantExperiences(merchantId, env, async (input) => {
    const url = new URL(input);
    assert.equal(url.pathname, '/rest/v1/experiences');
    assert.equal(url.searchParams.get('merchant_profile_id'), 'eq.' + merchantId);
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(url.searchParams.get('order'), 'published_at.desc,id.asc');
    assert.equal(url.searchParams.get('limit'), '12');
    return Response.json([experienceRow]);
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].slug, 'city-walk');
  assert.equal(result[0].savesCount, 4);
  for (const id of ['', '../private', 'not-a-uuid']) {
    assert.deepEqual(await subject.readMerchantExperiences(id, env, () => assert.fail('must not fetch')), []);
  }
  await assert.rejects(
    subject.readMerchantExperiences(merchantId, env, async () => Response.json(Array(13).fill(experienceRow))),
    /experience_schema/,
  );
});

test('experience metadata remains on the canonical KinnsoOS origin in all public languages', () => {
  const value = {
    id: experienceRow.id,
    slug: experienceRow.slug,
    title: experienceRow.title,
    summary: experienceRow.summary,
    description: experienceRow.description,
    city: experienceRow.city,
    priceAmount: 1250,
    currency: 'JPY',
    durationMinutes: 90,
    coverUrl: experienceRow.cover_url,
    publishedAt: experienceRow.published_at,
    savesCount: 4,
    merchant: { slug: merchantRow.slug, companyName: merchantRow.company_name },
  };
  for (const locale of ['en', 'zh-HK', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th']) {
    const meta = subject.experiencePageMetadata(value, locale);
    assert.equal(meta.alternates.canonical, `https://kinnso-os.vercel.app/${locale}/experiences/city-walk`);
    assert.deepEqual(meta.robots, { index: false, follow: false });
  }
});

test('experience SSR keeps authored content language and sends no private actor lookup', async () => {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../lib/seo/PublicExperienceContent.tsx', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'next/link'],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
  const value = {
    id: experienceRow.id,
    slug: experienceRow.slug,
    title: experienceRow.title,
    summary: experienceRow.summary,
    description: experienceRow.description,
    city: experienceRow.city,
    priceAmount: 1250,
    currency: 'JPY',
    durationMinutes: 90,
    coverUrl: experienceRow.cover_url,
    publishedAt: experienceRow.published_at,
    savesCount: 4,
    merchant: { slug: merchantRow.slug, companyName: merchantRow.company_name },
  };
  const html = renderToStaticMarkup(
    module.exports.PublicExperienceContent({ experience: value, locale: 'ja' }),
  );
  assert.match(html, /<h1 lang="">Authored city walk<\/h1>/);
  assert.match(html, /<p lang="">Tokyo<\/p>/);
  assert.match(html, /<span lang="">Authored merchant<\/span>/);
  assert.match(html, /\/ja\/m\/merchant-one/);
  assert.doesNotMatch(html, /private@example|Book now|RSVP|payment/i);
});
