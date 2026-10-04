import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mutable mock state, read fresh on each query call.
const state = vi.hoisted(() => ({ list: [] as unknown[], single: null as unknown, error: null as unknown }))
const limitSpy = vi.hoisted(() => vi.fn())
const rpcSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({
    rpc: (name: string, args: unknown) => {
      rpcSpy(name, args)
      const builder = {
        limit: (n: number) => {
          limitSpy(n)
          return Promise.resolve({ data: state.list })
        },
        then: (onF: (v: { data: unknown }) => unknown) =>
          Promise.resolve({ data: state.list }).then(onF),
      }
      return builder
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        // queries chain one or more .order() calls, then await the builder (thenable)
        order: () => builder,
        // getGuideBySlug awaits .maybeSingle()
        maybeSingle: async () => ({ data: state.single }),
        limit: (n: number) => {
          limitSpy(n)
          return Promise.resolve({ data: state.list, error: state.error })
        },
        then: (onF: (v: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({ data: state.list, error: state.error }).then(onF),
      }
      return builder
    },
  }),
}))

import { mapRowToGuide, getPublishedGuides, getGuideBySlug, getGuidesForSitemap, getAttributedGuidesForMerchant } from '@/lib/guides/queries'
import { guides as mockGuides } from '@/lib/creator-mock'

const row = {
  slug: 'kyoto-tea',
  title: 'Kyoto Tea Houses',
  cover_url: 'https://example.com/kyoto.jpg',
  city: 'Kyoto',
  saves_count: 42,
  creator_handle: 'teafan',
}

beforeEach(() => {
  state.list = []
  state.single = null
  state.error = null
  limitSpy.mockClear()
  rpcSpy.mockClear()
})

describe('mapRowToGuide', () => {
  it('maps a db row to the public Guide shape', () => {
    expect(mapRowToGuide(row)).toEqual({
      slug: 'kyoto-tea',
      title: 'Kyoto Tea Houses',
      cover: 'https://example.com/kyoto.jpg',
      city: 'Kyoto',
      saves: 42,
      creatorHandle: 'teafan',
    })
  })

  it('preserves a missing cover as null', () => {
    expect(mapRowToGuide({ ...row, cover_url: null }).cover).toBeNull()
  })
})

describe('getPublishedGuides', () => {
  it('returns only DB guides (no mock seed appended)', async () => {
    state.list = [row]
    const result = await getPublishedGuides()
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('kyoto-tea')
    expect(result.some((g) => g.slug === mockGuides[0].slug)).toBe(false)
  })

  it('returns an empty array when the DB has no published guides', async () => {
    state.list = []
    expect(await getPublishedGuides()).toEqual([])
  })

  it('surfaces a query failure instead of reporting an empty catalogue', async () => {
    // "Unavailable" and "empty" are different facts. /explore is statically
    // regenerated every 300s across seven locales, so swallowing this served a
    // cheerful "no guides yet" page for five minutes per locale.
    const failure = { code: '57P01', message: 'terminating connection' }
    state.list = []
    state.error = failure

    await expect(getPublishedGuides()).rejects.toBe(failure)
  })

  it('surfaces a query failure even when a limit is applied', async () => {
    const failure = { code: '08006', message: 'connection failure' }
    state.error = failure

    await expect(getPublishedGuides(6)).rejects.toBe(failure)
  })

  it('forwards a row limit when given', async () => {
    await getPublishedGuides(6)
    expect(limitSpy).toHaveBeenCalledWith(6)
  })

  it('does not call limit when no limit is given', async () => {
    await getPublishedGuides()
    expect(limitSpy).not.toHaveBeenCalled()
  })
})

describe('getGuideBySlug', () => {
  it('returns the db guide (source: db) when a row exists, threading published_at, id, and creatorId', async () => {
    state.single = { ...row, id: 'g1', creator_id: 'c1', creator_name: 'Tea Fan', summary: 'Lovely tea houses.', published_at: '2026-06-02T00:00:00Z' }
    const guide = await getGuideBySlug('kyoto-tea')
    expect(guide?.slug).toBe('kyoto-tea')
    expect(guide?.id).toBe('g1')
    expect(guide?.creatorId).toBe('c1')
    expect(guide?.source).toBe('db')
    expect(guide?.publishedAt).toBe('2026-06-02T00:00:00Z')
  })

  it('defaults creatorId to null when the row has no creator_id', async () => {
    state.single = { ...row, id: 'g1', creator_id: null, creator_name: 'Tea Fan', summary: null }
    const guide = await getGuideBySlug('kyoto-tea')
    expect(guide?.creatorId).toBeNull()
  })

  it('defaults publishedAt to null when the row has no published_at', async () => {
    state.single = { ...row, id: 'g1', creator_id: null, creator_name: 'Tea Fan', summary: null }
    const guide = await getGuideBySlug('kyoto-tea')
    expect(guide?.publishedAt).toBeNull()
  })

  it('returns null for a slug not in the database (no mock fallback)', async () => {
    state.single = null
    expect(await getGuideBySlug(mockGuides[0].slug)).toBeNull()
  })
})

describe('getGuidesForSitemap', () => {
  it('returns published slugs with a lastmod', async () => {
    state.list = [{ slug: 'kyoto-tea', published_at: '2026-06-02T00:00:00Z' }]
    const rows = await getGuidesForSitemap()
    expect(rows).toEqual([{ slug: 'kyoto-tea', lastmod: '2026-06-02T00:00:00Z' }])
  })
  it('returns [] when there are no published guides', async () => {
    state.list = []
    expect(await getGuidesForSitemap()).toEqual([])
  })

  it('surfaces a query failure rather than emitting a sitemap with no guides', async () => {
    // A sitemap that silently drops a whole content type is worse than one that
    // fails: a failed generation makes a crawler retry and keep the last known
    // good, whereas a successful-but-empty section tells it those URLs are gone.
    const failure = { code: '57P01', message: 'terminating connection' }
    state.list = []
    state.error = failure

    await expect(getGuidesForSitemap()).rejects.toBe(failure)
  })
})

describe('getAttributedGuidesForMerchant', () => {
  it('uses only the attribution RPC, applies the requested cap, and maps the approved public card shape', async () => {
    state.list = [
      { ...row, booking_id: 'private-booking', traveler_id: 'private-traveller', guest_email: 'private@example.test', payment_intent: 'pi_private', checkout_session_id: 'cs_private' },
      { ...row, booking_id: 'duplicate-private-booking' },
    ]

    const result = await getAttributedGuidesForMerchant('123e4567-e89b-42d3-a456-426614174000', 4)

    expect(rpcSpy).toHaveBeenCalledWith('get_attributed_guides_for_merchant', {
      p_merchant_id: '123e4567-e89b-42d3-a456-426614174000',
      p_limit: 4,
    })
    expect(limitSpy).toHaveBeenCalledWith(4)
    expect(result).toEqual([{ slug: row.slug, title: row.title, cover: row.cover_url, city: row.city, saves: row.saves_count, creatorHandle: row.creator_handle }])
    expect(JSON.stringify(result)).not.toMatch(/booking|traveler|guest|payment|checkout/i)
  })

  it.each([
    ['undefined', undefined, 20],
    ['NaN', Number.NaN, 20],
    ['negative', -3, 0],
    ['fractional', 4.9, 4],
    ['above cap', 99, 20],
  ])('normalizes a %s limit to the deterministic safe query cap', async (_name, input, expected) => {
    state.list = [row]

    const result = await getAttributedGuidesForMerchant('123e4567-e89b-42d3-a456-426614174000', input)

    expect(rpcSpy).toHaveBeenCalledWith('get_attributed_guides_for_merchant', {
      p_merchant_id: '123e4567-e89b-42d3-a456-426614174000',
      p_limit: expected,
    })
    expect(limitSpy).toHaveBeenCalledWith(expected)
    expect(result).toEqual([{ slug: row.slug, title: row.title, cover: row.cover_url, city: row.city, saves: row.saves_count, creatorHandle: row.creator_handle }])
  })
})
