import { describe, it, expect } from 'vitest'
import { rankCreators, type SearchableCreator, type CreatorFilters } from '@/lib/merchants/relevance'
const base = (over: Partial<SearchableCreator>): SearchableCreator => ({
  id: 'id', handle: 'h', name: 'N', bio: '', niches: [], audienceGeos: [], languages: [], platforms: [], guideCount: 0, lastGuideAt: null, ...over,
})
const NONE: CreatorFilters = { niches: [], audienceGeos: [], languages: [], platforms: [], hasGuides: false }
describe('rankCreators', () => {
  it('no filters → recent guide activity order', () => {
    const a = base({ handle: 'a', lastGuideAt: '2026-01-01' }); const b = base({ handle: 'b', lastGuideAt: '2026-02-01' })
    expect(rankCreators([a, b], NONE).map((r) => r.creator.handle)).toEqual(['b', 'a'])
  })
  it('ranks by matched filter dimensions and lists reasons', () => {
    const a = base({ handle: 'a', niches: ['food'] })
    const b = base({ handle: 'b', niches: ['food'], audienceGeos: ['HK'] })
    const ranked = rankCreators([a, b], { ...NONE, niches: ['food'], audienceGeos: ['HK'] })
    expect(ranked[0].creator.handle).toBe('b')
    expect(ranked[0].reasons.length).toBe(2)
  })
  it('hasGuides filter drops creators without guides', () => {
    const a = base({ handle: 'a', guideCount: 0 }); const b = base({ handle: 'b', guideCount: 2 })
    expect(rankCreators([a, b], { ...NONE, hasGuides: true }).map((r) => r.creator.handle)).toEqual(['b'])
  })
  it('no-filter ties break deterministically: equal recency → higher guideCount first', () => {
    const a = base({ handle: 'a', lastGuideAt: '2026-01-01', guideCount: 1 })
    const b = base({ handle: 'b', lastGuideAt: '2026-01-01', guideCount: 9 })
    // Input order is a,b but b has more guides at equal recency → b leads.
    expect(rankCreators([a, b], NONE).map((r) => r.creator.handle)).toEqual(['b', 'a'])
  })
  it('no-filter ties with everything equal break by handle ascending', () => {
    const z = base({ handle: 'z', lastGuideAt: null, guideCount: 0 })
    const a = base({ handle: 'a', lastGuideAt: null, guideCount: 0 })
    // Input order is z,a but with all sort keys equal, handle asc → a leads.
    expect(rankCreators([z, a], NONE).map((r) => r.creator.handle)).toEqual(['a', 'z'])
  })
})
