import { describe, it, expect } from 'vitest'
import { negative404 } from '../src/checks/negative-404'
import type { LegacySource, NewStackSource } from '../src/types'

function fakeLegacy(paths: string[]): LegacySource {
  return {
    expectedUrlPaths: async () => new Set(),
    localeCounts: async () => ({}),
    redirectSamples: async () => [],
    negativePaths: async () => paths,
  }
}
function fakeNewstack(statusByPath: Record<string, number>): NewStackSource {
  return {
    publishedArticles: async () => [],
    localeCounts: async () => ({}),
    seoRedirects: async () => [],
    sitemapUrls: async () => new Set(),
    status: async (path) => statusByPath[path] ?? 200,
    html: async () => '',
    redirect: async () => ({ status: 200, location: null }),
  }
}

describe('negative-404', () => {
  it('passes when every negative path returns 404', async () => {
    const r = await negative404({
      legacy: fakeLegacy(['/en/articles/shopping/draft-article', '/ja/articles/dining/ramen-guide']),
      newstack: fakeNewstack({ '/en/articles/shopping/draft-article': 404, '/ja/articles/dining/ramen-guide': 404 }),
      sample: 3,
    })
    expect(r.every((x) => x.status === 'pass')).toBe(true)
  })

  it('fails a path that leaks a 200', async () => {
    const r = await negative404({
      legacy: fakeLegacy(['/en/articles/shopping/draft-article']),
      newstack: fakeNewstack({ '/en/articles/shopping/draft-article': 200 }),
      sample: 3,
    })
    expect(r[0].status).toBe('fail')
  })

  it('warns when the source mode has no negative fixtures', async () => {
    const r = await negative404({ legacy: fakeLegacy([]), newstack: fakeNewstack({}), sample: 3 })
    expect(r[0].status).toBe('warn')
  })
})
