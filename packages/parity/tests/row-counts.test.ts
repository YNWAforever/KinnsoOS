import { describe, it, expect } from 'vitest'
import { rowCounts } from '../src/checks/row-counts'
import type { LegacySource, NewStackSource } from '../src/types'

function fakeLegacy(counts: Record<string, number>): LegacySource {
  return {
    expectedUrlPaths: async () => new Set(),
    localeCounts: async () => counts,
    redirectSamples: async () => [],
    negativePaths: async () => [],
  }
}
function fakeNewstack(counts: Record<string, number>): NewStackSource {
  return {
    publishedArticles: async () => [],
    localeCounts: async () => counts,
    seoRedirects: async () => [],
    sitemapUrls: async () => new Set(),
    status: async () => 200,
    html: async () => '',
    redirect: async () => ({ status: 200, location: null }),
  }
}

describe('row-counts', () => {
  it('passes when every locale count matches the baseline', async () => {
    const r = await rowCounts({
      legacy: fakeLegacy({ en: 5, 'zh-hk': 3 }),
      newstack: fakeNewstack({ en: 5, 'zh-hk': 3 }),
      sample: 3,
    })
    expect(r.every((x) => x.status === 'pass')).toBe(true)
    expect(r).toHaveLength(2)
  })

  it('reports the delta for a mismatched locale', async () => {
    const r = await rowCounts({
      legacy: fakeLegacy({ en: 5, 'zh-hk': 3 }),
      newstack: fakeNewstack({ en: 5, 'zh-hk': 2 }),
      sample: 3,
    })
    const hk = r.find((x) => x.target === 'zh-hk')!
    expect(hk.status).toBe('fail')
    expect(hk.detail).toContain('baseline 3')
    expect(hk.detail).toContain('live 2')
  })

  it('warns (skips) when the source mode has no baseline counts', async () => {
    const r = await rowCounts({ legacy: fakeLegacy({}), newstack: fakeNewstack({ en: 5 }), sample: 3 })
    expect(r[0].status).toBe('warn')
  })
})
