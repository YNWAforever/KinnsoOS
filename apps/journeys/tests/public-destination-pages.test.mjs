import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const destination = {
  slug: 'tokyo',
  name: 'Tokyo',
  description: 'Authored destination',
  heroImageUrl: null,
  matchTerms: ['Tokyo', '東京'],
  guideCount: 1,
  experienceCount: 1,
  latestPublishedAt: '2026-01-01T00:00:00Z',
};
const related = {
  guides: {
    status: 'ready',
    items: [{
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Authored guide',
      summary: 'Guide summary',
      city: 'Tokyo',
      coverUrl: null,
      creatorHandle: 'guide-author',
      savesCount: 3,
    }],
  },
  experiences: {
    status: 'ready',
    items: [{
      slug: 'city-walk',
      title: 'Authored experience',
      city: 'Tokyo',
      priceAmount: 1250,
      currency: 'JPY',
      coverUrl: null,
      savesCount: 4,
    }],
  },
  articles: {
    status: 'ready',
    items: [{
      slug: 'tokyo-article',
      title: 'Authored article',
      canOpen: true,
      summary: 'Summary',
      publishedAt: '2026-01-01T00:00:00Z',
      image: null,
      href: '/ja/articles/destinations/tokyo-article',
    }],
  },
  sessions: {
    status: 'unavailable',
    items: [],
  },
};

const pageBuild = await build({
  entryPoints: [fileURLToPath(new URL('../app/[locale]/[[...route]]/page.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'next/navigation'],
  plugins: [{
    name: 'destination-page-fixture',
    setup(build) {
      build.onResolve({ filter: /travel\/Workbench$/ }, () => ({ path: 'fixture-workbench', external: true }));
      build.onResolve({ filter: /(auth\/actor|supabase\/server)$/ }, () => ({ path: 'fixture-private', external: true }));
      build.onResolve({ filter: /seo\/public-destinations$/ }, () => ({ path: 'fixture-destinations', external: true }));
      build.onResolve({ filter: /seo\/destination-related$/ }, () => ({ path: 'fixture-related', external: true }));
    },
  }],
});
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
  if (name === 'fixture-destinations') {
    return {
      readDestinationListing: async page => ({
        items: page === 1 ? [destination] : [],
        page,
        hasNext: page === 1,
      }),
      readPublicDestination: async slug => slug === destination.slug ? destination : null,
      destinationIndexMetadata: locale => ({
        title: 'Destinations',
        alternates: { canonical: `https://kinnso-os.vercel.app/${locale}/destinations` },
        robots: { index: false, follow: false },
      }),
      destinationPageMetadata: (value, locale) => ({
        title: value.name,
        alternates: {
          canonical: `https://kinnso-os.vercel.app/${locale}/destinations/${value.slug}`,
        },
        robots: { index: false, follow: false },
      }),
    };
  }
  if (name === 'fixture-related') {
    return { readDestinationRelated: async () => related };
  }
  if (name === 'next/navigation') {
    return {
      notFound: () => { throw new Error('NOT_FOUND'); },
      redirect: () => { throw new Error('UNEXPECTED_REDIRECT'); },
    };
  }
  return require(name);
}, pageModule, pageModule.exports);

test('destination index renders before private actor with localized pagination', async () => {
  const html = renderToStaticMarkup(
    await pageModule.exports.default({
      params: Promise.resolve({ locale: 'ja', route: ['destinations'] }),
      searchParams: Promise.resolve({}),
    }),
  );
  assert.match(html, /<p>旅行先<\/p><h1>その街を一番知る人が/);
  assert.match(html, /href="\/ja\/destinations\/tokyo"/);
  assert.match(html, /href="\/ja\/destinations\?page=2"/);
  const meta = await pageModule.exports.generateMetadata({
    params: Promise.resolve({ locale: 'ja', route: ['destinations'] }),
  });
  assert.equal(meta.alternates.canonical, 'https://kinnso-os.vercel.app/ja/destinations');
});

test('destination detail renders authored title and canonical related links', async () => {
  const html = renderToStaticMarkup(
    await pageModule.exports.default({
      params: Promise.resolve({ locale: 'ja', route: ['destinations', 'tokyo'] }),
      searchParams: Promise.resolve({}),
    }),
  );
  assert.match(html, /<article lang=""><h1>Tokyo<\/h1>/);
  assert.match(html, /\/ja\/g\/11111111-1111-4111-8111-111111111111/);
  assert.match(html, /\/ja\/experiences\/city-walk/);
  assert.match(html, /\/ja\/articles\/destinations\/tokyo-article/);
  assert.match(html, /コンテンツを読み込めませんでした/);
  assert.doesNotMatch(html, /remix-kinnso-web/);
  const meta = await pageModule.exports.generateMetadata({
    params: Promise.resolve({ locale: 'ja', route: ['destinations', 'tokyo'] }),
  });
  assert.equal(
    meta.alternates.canonical,
    'https://kinnso-os.vercel.app/ja/destinations/tokyo',
  );
});

test('unknown destinations and unsupported locales fail before private work', async () => {
  await assert.rejects(
    pageModule.exports.default({
      params: Promise.resolve({ locale: 'en', route: ['destinations', 'missing'] }),
      searchParams: Promise.resolve({}),
    }),
    /NOT_FOUND/,
  );
  await assert.rejects(
    pageModule.exports.default({
      params: Promise.resolve({ locale: 'fr', route: ['destinations'] }),
      searchParams: Promise.resolve({}),
    }),
    /NOT_FOUND/,
  );
});

test('destination detail omits empty related sections while preserving unavailable ones', async () => {
  const componentBuild = await build({
    entryPoints: [fileURLToPath(new URL('../lib/seo/PublicDestinationContent.tsx', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'next/link'],
  });
  const component = { exports: {} };
  new Function('require', 'module', 'exports', componentBuild.outputFiles[0].text)(
    require,
    component,
    component.exports,
  );
  const html = renderToStaticMarkup(component.exports.PublicDestinationDetail({
    locale: 'en',
    destination,
    related: {
      guides: { status: 'empty', items: [] },
      experiences: { status: 'empty', items: [] },
      articles: { status: 'empty', items: [] },
      sessions: { status: 'omitted', items: [] },
    },
  }));
  assert.doesNotMatch(html, /<h2>Guides<\/h2>/);
  assert.doesNotMatch(html, /<h2>Experiences<\/h2>/);
  assert.doesNotMatch(html, /<h2>Articles<\/h2>/);
  assert.doesNotMatch(html, /<h2>Upcoming sessions<\/h2>/);
});
