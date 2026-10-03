import { beforeEach, describe, expect, it, vi } from 'vitest'

const orSpy = vi.fn()
const limitSpy = vi.fn().mockResolvedValue({ data: [] })
const chain: Record<string, unknown> = {}
Object.assign(chain, {
  select: vi.fn(() => chain), eq: vi.fn(() => chain),
  or: orSpy.mockImplementation(() => chain),
  order: vi.fn(() => chain), limit: limitSpy,
})
const fromMock = vi.fn<(table: string) => Record<string, unknown>>(() => chain)
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: () => ({ from: fromMock }) }))

import { getGuideOverridesForArticle, getGuidesForRegions } from '@/lib/guides/queries'

beforeEach(() => {
  fromMock.mockClear()
  fromMock.mockImplementation(() => chain) // restore base behavior in case a test below overrides it
  orSpy.mockClear()
  limitSpy.mockClear().mockResolvedValue({ data: [] })
})

describe('getGuidesForRegions', () => {
  it('returns [] without querying when no usable region strings', async () => {
    expect(await getGuidesForRegions([])).toEqual([])
    expect(await getGuidesForRegions(['', ' ', 'x'])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
  it('builds a sanitized ilike-or filter over guide cities', async () => {
    await getGuidesForRegions(['Tokyo', 'Hong Kong, (HK)'])
    expect(orSpy).toHaveBeenCalledWith('city.ilike.%Tokyo%,city.ilike.%Hong Kong HK%')
  })
  it('never throws — returns [] on query failure', async () => {
    limitSpy.mockRejectedValueOnce(new Error('boom'))
    expect(await getGuidesForRegions(['Tokyo'])).toEqual([])
  })
})

describe('getGuideOverridesForArticle', () => {
  it('returns [] without querying guides when no overrides exist', async () => {
    const order = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    fromMock.mockImplementation(() => ({ select }))

    expect(await getGuideOverridesForArticle('article-1')).toEqual([])
    expect(fromMock).toHaveBeenCalledWith('article_guide_overrides')
    expect(fromMock).not.toHaveBeenCalledWith('guides')
  })

  it('preserves override sort_order and drops any pinned guide no longer published', async () => {
    const overridesResult = { data: [{ guide_id: 'g2' }, { guide_id: 'g1' }], error: null }
    const guidesResult = {
      data: [
        { id: 'g1', slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover_url: 'https://x/kyoto.jpg', city: 'Kyoto', saves_count: 3, creator_handle: 'teafan' },
      ],
      error: null,
    }
    const order = vi.fn(() => Promise.resolve(overridesResult))
    const eqOverrides = vi.fn(() => ({ order }))
    const selectOverrides = vi.fn(() => ({ eq: eqOverrides }))
    const eqGuides = vi.fn(() => Promise.resolve(guidesResult))
    const inGuides = vi.fn(() => ({ eq: eqGuides }))
    const selectGuides = vi.fn(() => ({ in: inGuides }))
    fromMock.mockImplementation((table: string) => (table === 'article_guide_overrides' ? { select: selectOverrides } : { select: selectGuides }))

    const result = await getGuideOverridesForArticle('article-1')
    // g2 was pinned first but isn't published/found -> dropped; g1 (pinned second) survives
    expect(result).toEqual([{ slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Kyoto', saves: 3, creatorHandle: 'teafan' }])
  })
})
