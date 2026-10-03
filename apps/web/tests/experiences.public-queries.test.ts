// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: fromMock }),
}))

import { getExperienceBySlug, getExperienceOverridesForArticle, getExperiencesForCity, getExperiencesForCities, getExperiencesForSitemap, listPublishedExperiencesForMerchant } from '@/lib/experiences/public-queries'

beforeEach(() => { fromMock.mockReset() })

describe('getExperienceBySlug', () => {
  it('returns null when the experience is missing or not published (RLS)', async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })
    expect(await getExperienceBySlug('nope')).toBeNull()
  })

  it('joins the owning merchant via the public view (two-query, not an embed)', async () => {
    const expRow = {
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', price_amount: 480, currency: 'HKD',
      duration_minutes: 120, cover_url: 'https://x/y.jpg', merchant_profile_id: 'm1',
      published_at: '2026-07-01T00:00:00Z',
    }
    const merchantRow = { id: 'm1', slug: 'acme-travel', company_name: 'Acme Travel' }
    const expMaybeSingle = vi.fn(() => Promise.resolve({ data: expRow, error: null }))
    const merchantMaybeSingle = vi.fn(() => Promise.resolve({ data: merchantRow, error: null }))
    fromMock
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: expMaybeSingle })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: merchantMaybeSingle })) })) })

    const result = await getExperienceBySlug('sunset-tour')
    expect(fromMock).toHaveBeenNthCalledWith(1, 'experiences')
    expect(fromMock).toHaveBeenNthCalledWith(2, 'merchant_public_profiles')
    expect(result).toEqual({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: 'https://x/y.jpg', publishedAt: '2026-07-01T00:00:00Z',
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
  })

  it('returns null if the owning merchant is missing from the public view (defensive)', async () => {
    const expRow = { id: 'e1', slug: 's', title: 'T', summary: null, description: null, city: 'HK', price_amount: 1, currency: 'HKD', duration_minutes: null, cover_url: null, merchant_profile_id: 'm1', published_at: null }
    const expMaybeSingle = vi.fn(() => Promise.resolve({ data: expRow, error: null }))
    const merchantMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    fromMock
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: expMaybeSingle })) })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: merchantMaybeSingle })) })) })
    expect(await getExperienceBySlug('s')).toBeNull()
  })
})

describe('listPublishedExperiencesForMerchant', () => {
  it('lists published experiences scoped to one merchant id', async () => {
    const order = vi.fn(() => Promise.resolve({
      data: [{ id: 'e1', slug: 'sunset-tour', title: 'Sunset tour', summary: null, description: null, city: 'HK', price_amount: 480, currency: 'HKD', duration_minutes: null, cover_url: null, merchant_profile_id: 'm1', published_at: '2026-07-01T00:00:00Z' }],
      error: null,
    }))
    const eq2 = vi.fn(() => ({ order }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: eq1 })) })
    const rows = await listPublishedExperiencesForMerchant('m1')
    expect(eq1).toHaveBeenCalledWith('merchant_profile_id', 'm1')
    expect(eq2).toHaveBeenCalledWith('status', 'published')
    expect(rows[0].title).toBe('Sunset tour')
  })
})

describe('getExperiencesForSitemap', () => {
  it('returns slug + lastmod pairs for published experiences', async () => {
    const order = vi.fn(() => Promise.resolve({ data: [{ slug: 'sunset-tour', published_at: '2026-07-01T00:00:00Z' }], error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })
    expect(await getExperiencesForSitemap()).toEqual([{ slug: 'sunset-tour', lastmod: '2026-07-01T00:00:00Z' }])
  })
})

describe('getExperiencesForCity', () => {
  it('returns [] for a too-short/noise-only city string without querying', async () => {
    expect(await getExperiencesForCity('!')).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('queries published experiences by case-insensitive city match, ordered, capped at 3', async () => {
    const limit = vi.fn(() => Promise.resolve({
      data: [{ id: 'e1', slug: 'sunset-tour', title: 'Sunset tour', summary: null, description: null, city: 'Tokyo', price_amount: 12000, currency: 'JPY', duration_minutes: null, cover_url: null, merchant_profile_id: 'm1', published_at: '2026-07-01T00:00:00Z' }],
      error: null,
    }))
    const order = vi.fn(() => ({ limit }))
    const ilike = vi.fn(() => ({ order }))
    const eq = vi.fn(() => ({ ilike }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq })) })

    const rows = await getExperiencesForCity('Tokyo')
    expect(fromMock).toHaveBeenCalledWith('experiences')
    expect(eq).toHaveBeenCalledWith('status', 'published')
    expect(ilike).toHaveBeenCalledWith('city', '%Tokyo%')
    expect(limit).toHaveBeenCalledWith(3)
    expect(rows[0].title).toBe('Sunset tour')
  })

  it('never throws — degrades to [] on query failure', async () => {
    fromMock.mockImplementation(() => { throw new Error('boom') })
    expect(await getExperiencesForCity('Tokyo')).toEqual([])
  })
})

describe('getExperiencesForCities', () => {
  it('returns [] for an empty or noise-only term list without querying', async () => {
    expect(await getExperiencesForCities([])).toEqual([])
    expect(await getExperiencesForCities(['', ' ', 'x'])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('builds a sanitized ilike-or filter across all given terms', async () => {
    const limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const order = vi.fn(() => ({ limit }))
    const or = vi.fn(() => ({ order }))
    const eq = vi.fn(() => ({ or }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq })) })

    await getExperiencesForCities(['Tokyo', 'Shibuya, (Ward)'])
    expect(or).toHaveBeenCalledWith('city.ilike.%Tokyo%,city.ilike.%Shibuya Ward%')
    expect(limit).toHaveBeenCalledWith(6)
  })

  it('never throws — degrades to [] on query failure', async () => {
    fromMock.mockImplementation(() => { throw new Error('boom') })
    expect(await getExperiencesForCities(['Tokyo'])).toEqual([])
  })
})

describe('getExperienceOverridesForArticle', () => {
  it('returns [] without querying experiences when no overrides exist', async () => {
    const order = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    fromMock.mockReturnValue({ select })

    expect(await getExperienceOverridesForArticle('article-1')).toEqual([])
    expect(fromMock).toHaveBeenCalledWith('article_experience_overrides')
  })

  it('preserves override sort_order and drops any pinned experience no longer found', async () => {
    const overridesResult = { data: [{ experience_id: 'e2' }, { experience_id: 'e1' }], error: null }
    const expRow = {
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
      city: 'Hong Kong', price_amount: 480, currency: 'HKD', duration_minutes: 120,
      cover_url: null, merchant_profile_id: 'm1', published_at: '2026-07-01T00:00:00Z',
    }
    const order = vi.fn(() => Promise.resolve(overridesResult))
    const eqOverrides = vi.fn(() => ({ order }))
    const selectOverrides = vi.fn(() => ({ eq: eqOverrides }))
    const eqExp = vi.fn(() => Promise.resolve({ data: [expRow], error: null }))
    const inExp = vi.fn(() => ({ eq: eqExp }))
    const selectExp = vi.fn(() => ({ in: inExp }))
    fromMock.mockImplementation((table: string) => (table === 'article_experience_overrides' ? { select: selectOverrides } : { select: selectExp }))

    const result = await getExperienceOverridesForArticle('article-1')
    expect(result).toEqual([{
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
      city: 'Hong Kong', priceAmount: 480, currency: 'HKD', durationMinutes: 120,
      coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', merchant: { slug: '', companyName: '' },
    }])
  })
})
