import { describe, it, expect, vi, beforeEach } from 'vitest'

const publicClient = { from: vi.fn() }
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => publicClient,
}))

import { searchPublicCreators, deriveFacets } from '@/lib/merchants/creator-search'
import type { SearchableCreator } from '@/lib/merchants/relevance'

/** Build a chainable creators-query stub resolving to {data, error}. */
function creatorsQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not']) q[m] = () => q
  // the last `.not(...)` in the chain is awaited
  q.not = () => Object.assign(q, { then: (r: (v: unknown) => void) => r(result) })
  return q
}

/** Build a chainable guides-query stub resolving to {data, error}. */
function guidesQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => Object.assign(q, { then: (r: (v: unknown) => void) => r(result) })
  return q
}

beforeEach(() => {
  publicClient.from.mockReset()
})

describe('searchPublicCreators', () => {
  it('maps public_profile attributes + guide counts to SearchableCreator[]', async () => {
    const creators = [
      {
        id: 'c1',
        handle: 'alice',
        display_name: 'Alice',
        bio: 'hi',
        public_profile: {
          niches: ['food'],
          audience_geos: ['HK'],
          languages: ['en'],
          platforms: [{ platform: 'instagram' }, { platform: 'youtube' }],
        },
      },
      {
        id: 'c2',
        handle: 'bob',
        display_name: null,
        bio: null,
        public_profile: {},
      },
    ]
    const guides = [
      { creator_id: 'c1', published_at: '2026-01-01' },
      { creator_id: 'c1', published_at: '2026-03-01' },
    ]
    publicClient.from
      .mockReturnValueOnce(creatorsQuery({ data: creators, error: null }))
      .mockReturnValueOnce(guidesQuery({ data: guides, error: null }))

    const out = await searchPublicCreators()
    expect(out).toEqual<SearchableCreator[]>([
      {
        id: 'c1',
        handle: 'alice',
        name: 'Alice',
        bio: 'hi',
        niches: ['food'],
        audienceGeos: ['HK'],
        languages: ['en'],
        platforms: ['instagram', 'youtube'],
        guideCount: 2,
        lastGuideAt: '2026-03-01',
      },
      {
        id: 'c2',
        handle: 'bob',
        name: 'bob',
        bio: '',
        niches: [],
        audienceGeos: [],
        languages: [],
        platforms: [],
        guideCount: 0,
        lastGuideAt: null,
      },
    ])
  })

  it('returns [] when no creators match', async () => {
    publicClient.from.mockReturnValueOnce(creatorsQuery({ data: [], error: null }))
    expect(await searchPublicCreators()).toEqual([])
  })

  it('throws on creators query error', async () => {
    publicClient.from.mockReturnValueOnce(creatorsQuery({ data: null, error: { message: 'boom' } }))
    await expect(searchPublicCreators()).rejects.toBeTruthy()
  })
})

describe('deriveFacets', () => {
  it('returns distinct sorted facet values across creators', () => {
    const base = (over: Partial<SearchableCreator>): SearchableCreator => ({
      id: 'id', handle: 'h', name: 'N', bio: '', niches: [], audienceGeos: [], languages: [], platforms: [], guideCount: 0, lastGuideAt: null, ...over,
    })
    const facets = deriveFacets([
      base({ niches: ['food', 'travel'], audienceGeos: ['HK'], languages: ['en'], platforms: ['instagram'] }),
      base({ niches: ['food'], audienceGeos: ['JP'], languages: ['ja'], platforms: ['youtube'] }),
    ])
    expect(facets).toEqual({
      niches: ['food', 'travel'],
      audienceGeos: ['HK', 'JP'],
      languages: ['en', 'ja'],
      platforms: ['instagram', 'youtube'],
    })
  })
})
