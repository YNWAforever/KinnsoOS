import { describe, expect, it } from 'vitest'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import {
  EXPLORE_PAGE_SIZE,
  canSortByMostSaved,
  eligibleExploreDestinations,
  indexExploreGuides,
  parseExploreState,
  selectExploreResults,
  serializeExploreState,
} from '@/lib/explore/discovery'

const destinations: Destination[] = [
  {
    slug: 'tokyo', name: 'Tokyo', matchTerms: ['東京', 'Shinjuku'], guideCount: 2,
    experienceCount: 0, heroImageUrl: null, description: null, latestPublishedAt: null,
  },
  {
    slug: 'seoul', name: 'Seoul', matchTerms: ['서울'], guideCount: 1,
    experienceCount: 0, heroImageUrl: null, description: null, latestPublishedAt: null,
  },
  {
    slug: 'empty', name: 'Empty', matchTerms: [], guideCount: 0,
    experienceCount: 1, heroImageUrl: null, description: null, latestPublishedAt: null,
  },
]

const guide = (slug: string, city: string, saves = 0, title = slug): Guide => ({
  slug, title, city, saves, cover: null, creatorHandle: `${slug}-creator`,
})

describe('Explore discovery model', () => {
  it('offers only canonical destinations with published guides', () => {
    expect(eligibleExploreDestinations(destinations).map(({ slug }) => slug)).toEqual(['tokyo', 'seoul'])
  })

  it('matches exact normalized city values to canonical names and aliases', () => {
    const indexed = indexExploreGuides(
      [guide('name', ' Tokyo '), guide('alias', '東京'), guide('unknown', 'Osaka')],
      destinations,
    )
    expect(indexed.map(({ destination }) => destination?.slug ?? null)).toEqual(['tokyo', 'tokyo', null])
  })

  it('searches only card fields plus canonical destination terms', () => {
    const indexed = indexExploreGuides(
      [{ ...guide('ramen', 'Tokyo'), title: 'Night ramen', creatorHandle: 'ada' }],
      destinations,
    )
    for (const q of ['ramen', 'ADA', 'tokyo', 'shinjuku', '  night   ramen ']) {
      expect(selectExploreResults(indexed, { destination: null, q, sort: 'newest', page: 1 }).total).toBe(1)
    }
    expect(selectExploreResults(indexed, { destination: null, q: 'body-only-copy', sort: 'newest', page: 1 }).total).toBe(0)
  })

  it('filters one destination and keeps unmatched guides in All only', () => {
    const indexed = indexExploreGuides(
      [guide('tokyo-guide', 'Tokyo'), guide('seoul-guide', 'Seoul'), guide('unknown', 'Osaka')],
      destinations,
    )
    expect(selectExploreResults(indexed, { destination: null, q: '', sort: 'newest', page: 1 }).total).toBe(3)
    expect(selectExploreResults(indexed, { destination: 'tokyo', q: '', sort: 'newest', page: 1 }).visible.map(({ slug }) => slug))
      .toEqual(['tokyo-guide'])
  })

  it('preserves newest input order and uses it to break save-count ties', () => {
    const indexed = indexExploreGuides(
      [guide('newest', 'Tokyo', 2), guide('tie-newer', 'Tokyo', 5), guide('tie-older', 'Tokyo', 5)],
      destinations,
    )
    expect(selectExploreResults(indexed, { destination: null, q: '', sort: 'newest', page: 1 }).visible.map(({ slug }) => slug))
      .toEqual(['newest', 'tie-newer', 'tie-older'])
    expect(selectExploreResults(indexed, { destination: null, q: '', sort: 'most-saved', page: 1 }).visible.map(({ slug }) => slug))
      .toEqual(['tie-newer', 'tie-older', 'newest'])
  })

  it('enables Most saved only for a verified positive count', () => {
    expect(canSortByMostSaved([guide('zero', 'Tokyo', 0)])).toBe(false)
    expect(canSortByMostSaved([guide('saved', 'Tokyo', 1)])).toBe(true)
  })

  it('normalizes valid URL state and rejects unsupported values', () => {
    expect(parseExploreState(
      new URLSearchParams('destination=tokyo&q=%20Night%20%20ramen%20&sort=most-saved&page=2'),
      new Set(['tokyo', 'seoul']),
      true,
    )).toEqual({ destination: 'tokyo', q: 'Night ramen', sort: 'most-saved', page: 2 })
    expect(parseExploreState(
      new URLSearchParams('destination=missing&sort=popular&page=-4'),
      new Set(['tokyo']),
      false,
    )).toEqual({ destination: null, q: '', sort: 'newest', page: 1 })
  })

  it('omits defaults and serializes non-default state in a stable order', () => {
    expect(serializeExploreState({ destination: null, q: '', sort: 'newest', page: 1 }).toString()).toBe('')
    expect(serializeExploreState({
      destination: 'tokyo', q: 'Night ramen', sort: 'most-saved', page: 2,
    }).toString()).toBe('destination=tokyo&q=Night+ramen&sort=most-saved&page=2')
  })

  it('reveals exactly twelve cards per requested page', () => {
    const indexed = indexExploreGuides(
      Array.from({ length: 13 }, (_, index) => guide(`guide-${index + 1}`, 'Tokyo')),
      destinations,
    )
    const first = selectExploreResults(indexed, { destination: null, q: '', sort: 'newest', page: 1 })
    const second = selectExploreResults(indexed, { destination: null, q: '', sort: 'newest', page: 2 })
    expect(first.visible).toHaveLength(EXPLORE_PAGE_SIZE)
    expect(first).toMatchObject({ total: 13, hasMore: true })
    expect(second.visible).toHaveLength(13)
    expect(second.hasMore).toBe(false)
  })
})
