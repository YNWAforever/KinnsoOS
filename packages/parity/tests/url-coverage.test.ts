import { describe, it, expect } from 'vitest'
import { urlCoverage } from '../src/checks/url-coverage'
import type { LegacySource, NewStackSource } from '../src/types'

const legacy = {} as LegacySource

function fakeNewstack(over: Partial<NewStackSource>): NewStackSource {
  return {
    publishedArticles: async () => [],
    localeCounts: async () => ({}),
    seoRedirects: async () => [],
    sitemapUrls: async () => new Set(),
    status: async () => 200,
    html: async () => '',
    redirect: async () => ({ status: 200, location: null }),
    ...over,
  }
}

describe('url-coverage', () => {
  it('passes when every published locale URL returns 200', async () => {
    const newstack = fakeNewstack({
      publishedArticles: async () => [
        { url: 'ramen-guide', category: 'dining', isCoupon: false, locales: ['en', 'zh-hk'] },
      ],
      status: async () => 200,
    })
    const r = await urlCoverage({ legacy, newstack, sample: 3 })
    expect(r).toHaveLength(2)
    expect(r.every((x) => x.status === 'pass')).toBe(true)
  })

  it('fails the specific URL that does not return 200', async () => {
    const newstack = fakeNewstack({
      publishedArticles: async () => [
        { url: 'gone', category: 'dining', isCoupon: false, locales: ['en'] },
      ],
      status: async () => 404,
    })
    const r = await urlCoverage({ legacy, newstack, sample: 3 })
    expect(r[0]).toMatchObject({ check: 'url-coverage', target: '/en/articles/dining/gone', status: 'fail' })
  })

  it('flags an unrouted category instead of fetching it', async () => {
    const newstack = fakeNewstack({
      publishedArticles: async () => [
        { url: 'p', category: 'promotion', isCoupon: false, locales: ['en'] },
      ],
    })
    const r = await urlCoverage({ legacy, newstack, sample: 3 })
    expect(r[0]).toMatchObject({ status: 'fail', detail: expect.stringContaining('unrouted') })
  })
})
