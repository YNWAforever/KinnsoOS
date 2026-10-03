import { describe, it, expect } from 'vitest'
import { redirects } from '../src/checks/redirects'
import type { LegacySource, NewStackSource } from '../src/types'

function fakeLegacy(samples: Array<{ from: string; to: string }>): LegacySource {
  return {
    expectedUrlPaths: async () => new Set(),
    localeCounts: async () => ({}),
    redirectSamples: async () => samples,
    negativePaths: async () => [],
  }
}
function fakeNewstack(map: Record<string, { status: number; location: string | null }>): NewStackSource {
  return {
    publishedArticles: async () => [],
    localeCounts: async () => ({}),
    seoRedirects: async () => [],
    sitemapUrls: async () => new Set(),
    status: async () => 200,
    html: async () => '',
    redirect: async (path) => map[path] ?? { status: 404, location: null },
  }
}

describe('redirects', () => {
  it('passes a 301 whose Location pathname matches the locale-prefixed target', async () => {
    const r = await redirects({
      legacy: fakeLegacy([{ from: '/post/old-ramen', to: '/en/articles/dining/ramen-guide' }]),
      newstack: fakeNewstack({
        '/post/old-ramen': { status: 301, location: 'https://host/en/articles/dining/ramen-guide' },
      }),
      sample: 3,
    })
    expect(r[0]).toMatchObject({ check: 'redirects', target: '/post/old-ramen', status: 'pass' })
  })

  it('fails on wrong status or wrong destination', async () => {
    const r = await redirects({
      legacy: fakeLegacy([
        { from: '/post/old-ramen', to: '/en/articles/dining/ramen-guide' },
        { from: '/zh-hk/post/old-ramen', to: '/zh-hk/articles/dining/ramen-guide' },
      ]),
      newstack: fakeNewstack({
        '/post/old-ramen': { status: 307, location: 'https://host/en/post/old-ramen' },
        '/zh-hk/post/old-ramen': { status: 301, location: 'https://host/en/articles/dining/ramen-guide' },
      }),
      sample: 3,
    })
    expect(r[0].status).toBe('fail') // wrong status (307)
    expect(r[1].status).toBe('fail') // wrong locale on destination
  })
})
