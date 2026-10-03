import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/articles/queries', () => ({
  getPublishedForSitemap: async () => [
    { url: 'ramen', category: 'dining', lastmod: '2026-06-01T00:00:00Z', locales: ['en', 'zh-hk'] },
    { url: 'market', category: 'shopping', lastmod: null, locales: ['zh-hk'] },
  ],
}))
vi.mock('@/lib/guides/queries', () => ({
  getGuidesForSitemap: async () => [{ slug: 'kyoto-tea', lastmod: '2026-06-02T00:00:00Z' }],
}))
vi.mock('@/lib/creators/queries', () => ({
  getCreatorsForSitemap: async () => [{ handle: 'maya', lastmod: '2026-06-03T00:00:00Z' }],
}))
vi.mock('@/lib/destinations/queries', () => ({
  getDestinationsForSitemap: async () => [{ slug: 'tokyo', lastmod: '2026-07-01T00:00:00Z' }],
}))

import sitemap, { generateSitemaps } from '@/app/sitemap'
import { LOCALES } from '@/lib/i18n/config'

const SITE = 'https://www.kinnso.ai'

describe('sitemap — guides, creators, marketing', () => {
  it('emits each guide and creator for all 7 locales', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const l of LOCALES) {
      expect(urls).toContain(`${SITE}/${l}/g/kyoto-tea`)
      expect(urls).toContain(`${SITE}/${l}/c/maya`)
    }
  })
  it('includes the home + key marketing routes per locale', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain(`${SITE}/en`)
    expect(urls).toContain(`${SITE}/en/explore`)
    expect(urls).toContain(`${SITE}/en/creators`)
  })
  it('still includes the articles hub', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain(`${SITE}/en/articles`)
    expect(urls).toContain(`${SITE}/en/articles/dining/ramen`)
  })

  it('emits category routes only for locale/category pairs with indexable articles', async () => {
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toContain(`${SITE}/en/articles/dining`)
    expect(urls).toContain(`${SITE}/zh-hk/articles/dining`)
    expect(urls).toContain(`${SITE}/zh-hk/articles/shopping`)
    expect(urls).not.toContain(`${SITE}/en/articles/shopping`)
    expect(urls).not.toContain(`${SITE}/ja/articles/dining`)
  })
})

describe('sitemap — destinations', () => {
  it('emits each destination for all 7 locales', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    for (const l of LOCALES) {
      expect(urls).toContain(`${SITE}/${l}/destinations/tokyo`)
    }
  })
})

describe('sitemap — sharding (50k-URL protocol cap)', () => {
  it('reports at least one shard, starting at id 0', async () => {
    const shards = await generateSitemaps()
    expect(shards.length).toBeGreaterThanOrEqual(1)
    expect(shards[0]).toEqual({ id: 0 })
  })
  // Next 16 calls sitemap({ id }) with id as a Promise<string> — exercise that real
  // contract (a literal number would mask a NaN/empty-shard regression).
  it('shards reassemble to exactly the full set, no drops or duplicates', async () => {
    const all = await sitemap()
    const shards = await generateSitemaps()
    const reassembled = (
      await Promise.all(shards.map((s) => sitemap({ id: Promise.resolve(String(s.id)) })))
    ).flat()
    expect(reassembled.map((e) => e.url)).toEqual(all.map((e) => e.url))
  })
  it('an out-of-range shard id resolves to an empty list, not an error', async () => {
    expect(await sitemap({ id: Promise.resolve('99') })).toEqual([])
  })
})
