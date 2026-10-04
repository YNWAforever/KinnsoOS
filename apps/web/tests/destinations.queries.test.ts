// apps/web/tests/destinations.queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ list: [] as unknown[], single: null as unknown, error: null as unknown }))
const orderSpy = vi.hoisted(() => vi.fn())
const fromSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({
    from: (relation: string) => {
      fromSpy(relation)
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: (col: string, opts: unknown) => { orderSpy(col, opts); return builder },
        maybeSingle: async () => ({ data: state.single, error: state.error }),
        then: (onF: (v: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({ data: state.list, error: state.error }).then(onF),
      }
      return builder
    },
  }),
}))

import { getPublishedDestinations, getDestinationBySlug, getDestinationsForSitemap } from '@/lib/destinations/queries'

const row = {
  slug: 'tokyo', name: 'Tokyo', hero_image_url: null, description: null,
  match_terms: ['Tokyo'], guide_count: 1, experience_count: 1,
  latest_published_at: '2026-07-19T00:00:00.000Z', sort_order: 0,
}
const missingViewError = {
  code: 'PGRST205',
  message: "Could not find the table 'public.destination_index' in the schema cache",
}

beforeEach(() => {
  state.list = []
  state.single = null
  orderSpy.mockClear()
  state.error = null
  fromSpy.mockClear()
})

describe('getPublishedDestinations', () => {
  it('maps inventory rows ordered by sort_order, name, then slug', async () => {
    state.list = [row]
    const result = await getPublishedDestinations()
    expect(result).toEqual([{
      slug: 'tokyo', name: 'Tokyo', heroImageUrl: null, description: null,
      matchTerms: ['Tokyo'], guideCount: 1, experienceCount: 1,
      latestPublishedAt: '2026-07-19T00:00:00.000Z',
    }])
    expect(fromSpy).toHaveBeenCalledWith('destination_index')
    expect(orderSpy).toHaveBeenCalledWith('sort_order', { ascending: true })
    expect(orderSpy).toHaveBeenCalledWith('name', { ascending: true })
    expect(orderSpy).toHaveBeenCalledWith('slug', { ascending: true })
  })

  it('returns [] when there are no published destinations', async () => {
    state.list = []
    expect(await getPublishedDestinations()).toEqual([])
  })

  it('returns an honest empty state while the destination view migration is pending', async () => {
    state.error = missingViewError
    await expect(getPublishedDestinations()).resolves.toEqual([])
  })

  it('still throws unrelated database errors', async () => {
    const error = { code: '42501', message: 'permission denied' }
    state.error = error
    await expect(getPublishedDestinations()).rejects.toBe(error)
  })

  it('defaults matchTerms to [] when the row has none', async () => {
    state.list = [{ ...row, match_terms: null }]
    const result = await getPublishedDestinations()
    expect(result[0].matchTerms).toEqual([])
  })

  it('coerces nullable inventory counts to zero', async () => {
    state.list = [{ ...row, guide_count: null, experience_count: null }]
    const result = await getPublishedDestinations()
    expect(result[0]).toMatchObject({ guideCount: 0, experienceCount: 0 })
  })

  it('filters rows with missing or blank identity fields', async () => {
    state.list = [
      row,
      { ...row, slug: null },
      { ...row, slug: '   ' },
      { ...row, name: null },
      { ...row, name: '   ' },
    ]
    expect(await getPublishedDestinations()).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'tokyo', name: 'Tokyo' }),
    ]))
    expect(await getPublishedDestinations()).toHaveLength(1)
  })
})

describe('getDestinationBySlug', () => {
  it('returns the mapped destination from the inventory view when a row exists', async () => {
    state.single = row
    const dest = await getDestinationBySlug('tokyo')
    expect(dest?.name).toBe('Tokyo')
    expect(fromSpy).toHaveBeenCalledWith('destination_index')
  })

  it('returns null when no row matches', async () => {
    state.single = null
    expect(await getDestinationBySlug('nowhere')).toBeNull()
  })

  it('returns null while the destination view migration is pending', async () => {
    state.error = missingViewError
    await expect(getDestinationBySlug('tokyo')).resolves.toBeNull()
  })

  it('returns null when the matched row has missing or blank identity fields', async () => {
    for (const invalidRow of [
      { ...row, slug: null },
      { ...row, slug: '   ' },
      { ...row, name: null },
      { ...row, name: '   ' },
    ]) {
      state.single = invalidRow
      await expect(getDestinationBySlug('tokyo')).resolves.toBeNull()
    }
  })
})

describe('getDestinationsForSitemap', () => {
  it('maps latest_published_at to lastmod from the inventory view', async () => {
    state.list = [{ slug: 'tokyo', name: 'Tokyo', latest_published_at: '2026-07-01T00:00:00Z' }]
    expect(await getDestinationsForSitemap()).toEqual([{ slug: 'tokyo', lastmod: '2026-07-01T00:00:00Z' }])
    expect(fromSpy).toHaveBeenCalledWith('destination_index')
  })

  it('filters sitemap rows with missing or blank identity fields', async () => {
    state.list = [
      { slug: 'tokyo', name: 'Tokyo', latest_published_at: '2026-07-01T00:00:00Z' },
      { slug: null, name: 'Missing slug', latest_published_at: null },
      { slug: '   ', name: 'Blank slug', latest_published_at: null },
      { slug: 'missing-name', name: null, latest_published_at: null },
      { slug: 'blank-name', name: '   ', latest_published_at: null },
    ]
    expect(await getDestinationsForSitemap()).toEqual([{ slug: 'tokyo', lastmod: '2026-07-01T00:00:00Z' }])
  })

  it('returns [] when there are no published destinations', async () => {
    state.list = []
    expect(await getDestinationsForSitemap()).toEqual([])
  })

  it('returns no sitemap rows while the destination view migration is pending', async () => {
    state.error = missingViewError
    await expect(getDestinationsForSitemap()).resolves.toEqual([])
  })
})
