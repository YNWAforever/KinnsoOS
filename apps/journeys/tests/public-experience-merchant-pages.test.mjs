import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const experience = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'city-walk',
  title: 'Authored city walk',
  summary: 'Public summary',
  description: 'Public description',
  city: 'Tokyo',
  priceAmount: 1250,
  currency: 'JPY',
  durationMinutes: 90,
  coverUrl: null,
  publishedAt: '2026-01-01T00:00:00Z',
  savesCount: 4,
  merchant: { slug: 'merchant-one', companyName: 'Authored merchant' },
};
const merchant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'merchant-one',
  companyName: 'Authored merchant',
  tagline: 'Public tagline',
  city: 'Tokyo',
  logoUrl: null,
  websiteUrl: 'https://example.com/',
};

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../app/[locale]/[[...route]]/page.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'next/navigation'],
  plugins: [{
    name: 'public-page-fixture',
    setup(build) {
      build.onResolve({ filter: /travel\/Workbench$/ }, () => ({ path: 'fixture-workbench', external: true }));
      build.onResolve({ filter: /(auth\/actor|supabase\/server)$/ }, () => ({ path: 'fixture-private', external: true }));
      build.onResolve({ filter: /seo\/public-experiences$/ }, () => ({ path: 'fixture-experiences', external: true }));
      build.onResolve({ filter: /seo\/public-merchants$/ }, () => ({ path: 'fixture-merchants', external: true }));
    },
  }],
});
const pageModule = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)((name) => {
  if (name === 'fixture-workbench') {
    return { Workbench: () => { throw new Error('PUBLIC_ROUTE_MOUNTED_WORKBENCH'); } };
  }
  if (name === 'fixture-private') {
    return {
      currentActor: () => { throw new Error('PUBLIC_ROUTE_QUERIED_PRIVATE_ACTOR'); },
      serverClient: () => { throw new Error('PUBLIC_ROUTE_OPENED_PRIVATE_CLIENT'); },
    };
  }
  if (name === 'fixture-experiences') {
    return {
      readPublicExperience: async (slug) => slug === experience.slug ? experience : null,
      readMerchantExperiences: async () => [],
      experiencePageMetadata: (value, locale) => ({
        title: value.title,
        alternates: { canonical: `https://kinnso-os.vercel.app/${locale}/experiences/${value.slug}` },
        robots: { index: false, follow: false },
      }),
    };
  }
  if (name === 'fixture-merchants') {
    return {
      readPublicMerchant: async (slug) => slug === merchant.slug ? merchant : null,
      merchantPageMetadata: (value, locale) => ({
        title: value.companyName,
        alternates: { canonical: `https://kinnso-os.vercel.app/${locale}/m/${value.slug}` },
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

test('experience route renders before private actor and keeps canonical metadata', async () => {
  const params = Promise.resolve({ locale: 'ja', route: ['experiences', 'city-walk'] });
  const html = renderToStaticMarkup(await pageModule.exports.default({ params }));
  assert.match(html, /<h1 lang="">Authored city walk<\/h1>/);
  assert.match(html, /\/ja\/m\/merchant-one/);
  const meta = await pageModule.exports.generateMetadata({ params });
  assert.equal(
    meta.alternates.canonical,
    'https://kinnso-os.vercel.app/ja/experiences/city-walk',
  );
  assert.deepEqual(meta.robots, { index: false, follow: false });
});

test('merchant route renders public experiences before private actor', async () => {
  const params = Promise.resolve({ locale: 'th', route: ['m', 'merchant-one'] });
  const html = renderToStaticMarkup(await pageModule.exports.default({ params }));
  assert.match(html, /<h1 lang="">Authored merchant<\/h1>/);
  assert.match(html, /ยังไม่มีประสบการณ์ที่เผยแพร่/);
  const meta = await pageModule.exports.generateMetadata({ params });
  assert.equal(meta.alternates.canonical, 'https://kinnso-os.vercel.app/th/m/merchant-one');
});

test('missing public records return not-found and unsupported locales remain closed', async () => {
  for (const route of [['experiences', 'missing'], ['m', 'missing']]) {
    await assert.rejects(
      pageModule.exports.default({ params: Promise.resolve({ locale: 'en', route }) }),
      /NOT_FOUND/,
    );
  }
  await assert.rejects(
    pageModule.exports.default({
      params: Promise.resolve({ locale: 'fr', route: ['experiences', 'city-walk'] }),
    }),
    /NOT_FOUND/,
  );
});
