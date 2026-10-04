import { describe, it, expect } from 'vitest'
import { structuredData } from '../src/checks/structured-data'
import type { LegacySource, NewStackSource, PublishedArticle } from '../src/types'

const legacy = {} as LegacySource

const GOOD_HTML = `<head>
<link rel="alternate" hreflang="en" href="https://x/en/articles/dining/ramen-guide"/>
<link rel="alternate" hreflang="zh-hk" href="https://x/zh-hk/articles/dining/ramen-guide"/>
<link rel="alternate" hreflang="x-default" href="https://x/en/articles/dining/ramen-guide"/>
<meta property="og:type" content="article"/>
<script type="application/ld+json">[{"@type":"Article","dateModified":"2026-06-12"},{"@type":"BreadcrumbList"}]</script>
</head>`

const BAD_HTML = `<head>
<link rel="alternate" hreflang="en" href="https://x/en/articles/dining/x"/>
<meta property="og:type" content="website"/>
<script type="application/ld+json">{"@type":"Article"}</script>
</head>`

const NON_ENGLISH_HTML = `<head>
<link rel="alternate" hreflang="zh-tw" href="https://x/zh-tw/articles/dining/tea-guide"/>
<link rel="alternate" hreflang="ja" href="https://x/ja/articles/dining/tea-guide"/>
<link rel="alternate" hreflang="x-default" href="https://x/zh-tw/articles/dining/tea-guide"/>
<meta property="og:type" content="article"/>
<script type="application/ld+json">[{"@type":"Article","dateModified":"2026-06-12"},{"@type":"BreadcrumbList"}]</script>
</head>`

function fakeNewstack(htmlByPath: Record<string, string>, articles: PublishedArticle[]): NewStackSource {
  return {
    publishedArticles: async () => articles,
    localeCounts: async () => ({}),
    seoRedirects: async () => [],
    sitemapUrls: async () => new Set(),
    status: async () => 200,
    html: async (path) => htmlByPath[path] ?? '',
    redirect: async () => ({ status: 200, location: null }),
  }
}

describe('structured-data', () => {
  it('passes Article+dateModified, Breadcrumb, og:type, hreflang reciprocity, x-default', async () => {
    const newstack = fakeNewstack(
      { '/en/articles/dining/ramen-guide': GOOD_HTML, '/zh-hk/articles/dining/ramen-guide': GOOD_HTML },
      [{ url: 'ramen-guide', category: 'dining', isCoupon: false, locales: ['en', 'zh-hk'] }],
    )
    const r = await structuredData({ legacy, newstack, sample: 1 })
    expect(r.every((x) => x.status === 'pass')).toBe(true)
  })

  it('fails missing dateModified, wrong og:type, and incomplete hreflang', async () => {
    const newstack = fakeNewstack(
      { '/en/articles/dining/x': BAD_HTML },
      [{ url: 'x', category: 'dining', isCoupon: false, locales: ['en', 'zh-hk'] }],
    )
    const r = await structuredData({ legacy, newstack, sample: 1 })
    const byLabel = (l: string) => r.find((x) => x.target.endsWith(l))!
    expect(byLabel('Article.dateModified').status).toBe('fail')
    expect(byLabel('og:type').status).toBe('fail')
    expect(byLabel('hreflang').status).toBe('fail') // zh-hk + x-default absent
  })

  it('fails when hreflang advertises a locale absent from genuine translations', async () => {
    const html = GOOD_HTML.replace(
      '<link rel="alternate" hreflang="x-default"',
      '<link rel="alternate" hreflang="ja" href="https://x/ja/articles/dining/ramen-guide"/>' +
      '<link rel="alternate" hreflang="x-default"',
    )
    const result = await structuredData({
      legacy,
      newstack: fakeNewstack(
        {
          '/en/articles/dining/ramen-guide': html,
          '/zh-hk/articles/dining/ramen-guide': html,
        },
        [{
          url: 'ramen-guide',
          category: 'dining',
          isCoupon: false,
          locales: ['en', 'zh-hk'],
        }],
      ),
      sample: 1,
    })
    expect(result.find((row) => row.target.endsWith('hreflang'))?.status).toBe(
      'fail',
    )
  })

  it('accepts the first genuine locale as x-default for a non-English-only article', async () => {
    const result = await structuredData({
      legacy,
      newstack: fakeNewstack(
        {
          '/ja/articles/dining/tea-guide': NON_ENGLISH_HTML,
          '/zh-tw/articles/dining/tea-guide': NON_ENGLISH_HTML,
        },
        [{
          url: 'tea-guide',
          category: 'dining',
          isCoupon: false,
          locales: ['ja', 'zh-tw'],
        }],
      ),
      sample: 1,
    })
    expect(result.find((row) => row.target.endsWith('x-default'))?.status).toBe(
      'pass',
    )
  })

  it('respects the sample cap', async () => {
    const newstack = fakeNewstack(
      { '/en/articles/dining/ramen-guide': GOOD_HTML },
      [
        { url: 'ramen-guide', category: 'dining', isCoupon: false, locales: ['en'] },
        { url: 'sushi-guide', category: 'dining', isCoupon: false, locales: ['en'] },
      ],
    )
    const r = await structuredData({ legacy, newstack, sample: 1 })
    expect(r.every((x) => x.target.includes('ramen-guide'))).toBe(true)
  })
})
