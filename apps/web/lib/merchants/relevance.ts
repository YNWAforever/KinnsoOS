export interface SearchableCreator {
  id: string
  handle: string; name: string; bio: string
  niches: string[]; audienceGeos: string[]; languages: string[]; platforms: string[]
  guideCount: number; lastGuideAt: string | null
}
export interface CreatorFilters {
  niches: string[]; audienceGeos: string[]; languages: string[]; platforms: string[]; hasGuides: boolean
}
export interface Reason { dimension: 'niche' | 'geo' | 'language' | 'platform'; values: string[] }
export interface RankedCreator { creator: SearchableCreator; matched: number; reasons: Reason[] }

const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x))

/** Drop creators failing an active filter, then rank by # of matched dimensions
 *  (desc), tie-broken deterministically by guide recency (desc), guide count
 *  (desc), then handle (asc). No filters → stable recency/count/handle order. */
export function rankCreators(creators: SearchableCreator[], f: CreatorFilters): RankedCreator[] {
  const recency = (c: SearchableCreator) => (c.lastGuideAt ? Date.parse(c.lastGuideAt) : 0)
  return creators
    .filter((c) => !f.hasGuides || c.guideCount > 0)
    .map((c) => {
      const reasons: Reason[] = []
      const n = overlap(f.niches, c.niches); if (n.length) reasons.push({ dimension: 'niche', values: n })
      const g = overlap(f.audienceGeos, c.audienceGeos); if (g.length) reasons.push({ dimension: 'geo', values: g })
      const l = overlap(f.languages, c.languages); if (l.length) reasons.push({ dimension: 'language', values: l })
      const p = overlap(f.platforms, c.platforms); if (p.length) reasons.push({ dimension: 'platform', values: p })
      return { creator: c, matched: reasons.length, reasons }
    })
    // any active filter with zero overlap excludes the creator
    .filter((r) => {
      if (f.niches.length && !r.reasons.some((x) => x.dimension === 'niche')) return false
      if (f.audienceGeos.length && !r.reasons.some((x) => x.dimension === 'geo')) return false
      if (f.languages.length && !r.reasons.some((x) => x.dimension === 'language')) return false
      if (f.platforms.length && !r.reasons.some((x) => x.dimension === 'platform')) return false
      return true
    })
    .sort(
      (a, b) =>
        b.matched - a.matched ||
        recency(b.creator) - recency(a.creator) ||
        b.creator.guideCount - a.creator.guideCount ||
        a.creator.handle.localeCompare(b.creator.handle),
    )
}
