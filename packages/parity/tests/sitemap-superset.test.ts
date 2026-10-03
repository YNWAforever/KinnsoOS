import { describe, it, expect } from 'vitest'
import { sitemapSuperset } from '../src/checks/sitemap-superset'
import type { LegacySource, NewStackSource } from '../src/types'

function fakeLegacy(paths: string[]): LegacySource {
  return {
    expectedUrlPaths: async () => new Set(paths),
    localeCounts: async () => ({}),
    redirectSamples: async () => [],
    negativePaths: async () => [],
  }
}
function fakeNewstack(sitemap: string[]): NewStackSource {
  return {
    publishedArticles: async () => [],
    localeCounts: async () => ({}),
    seoRedirects: async () => [],
    sitemapUrls: async () => new Set(sitemap),
    status: async () => 200,
    html: async () => '',
    redirect: async () => ({ status: 200, location: null }),
  }
}

describe('sitemap-superset', () => {
  it('passes when the sitemap covers every expected URL', async () => {
    const r = await sitemapSuperset({
      legacy: fakeLegacy(['/en/articles/dining/ramen-guide']),
      newstack: fakeNewstack(['/en/articles/dining/ramen-guide', '/en/articles/dining']),
      sample: 3,
    })
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('pass')
  })

  it('fails and names each dropped URL', async () => {
    const r = await sitemapSuperset({
      legacy: fakeLegacy(['/en/articles/dining/ramen-guide', '/zh-hk/articles/dining/ramen-guide']),
      newstack: fakeNewstack(['/en/articles/dining/ramen-guide']),
      sample: 3,
    })
    expect(r).toEqual([
      { check: 'sitemap-superset', target: '/zh-hk/articles/dining/ramen-guide', status: 'fail', detail: 'missing from sitemap' },
    ])
  })
})
