import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

let subject = {};
try { subject = await import('../lib/seo/public-merchants.ts'); } catch {}

const require = createRequire(import.meta.url);
const env = {
  KINNSO_SUPABASE_URL: 'https://approved.supabase.co',
  KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://approved.supabase.co',
  KINNSO_LEGACY_AUTH_ORIGIN: 'https://approved.supabase.co',
  KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};
const merchantRow = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'merchant-one',
  company_name: 'Authored merchant',
  tagline: 'Public tagline',
  city: 'Tokyo',
  logo_url: 'https://cdn.kinnso.ai/logo.png',
  website_url: 'https://example.com',
  created_at: '2026-01-01T00:00:00Z',
  contact_email: 'private@example.test',
};

test('public merchant lookup uses only the PII-safe exact view projection', async () => {
  assert.equal(typeof subject.readPublicMerchant, 'function');
  const result = await subject.readPublicMerchant('merchant-one', env, async (input, options) => {
    const url = new URL(input);
    assert.equal(url.pathname, '/rest/v1/merchant_public_profiles');
    assert.equal(
      url.searchParams.get('select'),
      'id,slug,company_name,tagline,city,logo_url,website_url,created_at',
    );
    assert.equal(url.searchParams.get('slug'), 'eq.merchant-one');
    assert.equal(url.searchParams.get('limit'), '2');
    assert.equal(options.headers.Authorization, undefined);
    return Response.json([merchantRow]);
  });
  assert.equal(result.companyName, 'Authored merchant');
  assert.equal(result.websiteUrl, 'https://example.com/');
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
});

test('public merchant lookup rejects unsafe identities and ambiguous rows', async () => {
  for (const slug of ['', '..', '%2Fsecret', 'a,b', 'a'.repeat(201)]) {
    assert.equal(
      await subject.readPublicMerchant(slug, env, () => assert.fail('must not fetch')),
      null,
    );
  }
  assert.equal(await subject.readPublicMerchant('missing', env, async () => Response.json([])), null);
  await assert.rejects(
    subject.readPublicMerchant('merchant-one', env, async () => Response.json([merchantRow, merchantRow])),
    /merchant_schema/,
  );
  await assert.rejects(
    subject.readPublicMerchant('merchant-one', env, async () =>
      Response.json([{ ...merchantRow, slug: 'other' }]),
    ),
    /merchant_schema/,
  );
});

test('public merchant presentation omits private fields and non-HTTPS website values', async () => {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../lib/seo/public-merchants.ts', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
  for (const website of ['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com']) {
    const result = await module.exports.readPublicMerchant('merchant-one', env, async () =>
      Response.json([{ ...merchantRow, website_url: website }]),
    );
    assert.equal(result.websiteUrl, null);
  }
});

test('merchant metadata is canonical and private in all locales', () => {
  const value = {
    id: merchantRow.id,
    slug: merchantRow.slug,
    companyName: merchantRow.company_name,
    tagline: merchantRow.tagline,
    city: merchantRow.city,
    logoUrl: merchantRow.logo_url,
    websiteUrl: merchantRow.website_url,
  };
  for (const locale of ['en', 'zh-HK', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th']) {
    const meta = subject.merchantPageMetadata(value, locale);
    assert.equal(meta.alternates.canonical, `https://kinnso-os.vercel.app/${locale}/m/merchant-one`);
    assert.deepEqual(meta.robots, { index: false, follow: false });
  }
});

test('merchant SSR keeps the authored identity unlabelled and renders only public experience links', async () => {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../lib/seo/PublicMerchantContent.tsx', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'next/link'],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
  const html = renderToStaticMarkup(
    module.exports.PublicMerchantContent({
      locale: 'th',
      merchant: {
        id: merchantRow.id,
        slug: merchantRow.slug,
        companyName: merchantRow.company_name,
        tagline: merchantRow.tagline,
        city: merchantRow.city,
        logoUrl: merchantRow.logo_url,
        websiteUrl: 'https://example.com/',
      },
      experiences: [],
    }),
  );
  assert.match(html, /<h1 lang="">Authored merchant<\/h1>/);
  assert.match(html, /https:\/\/example\.com\//);
  assert.doesNotMatch(html, /private@example|Contact this merchant|Book/i);
});
