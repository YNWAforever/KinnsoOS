import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))
vi.mock('@supabase/supabase-js', () => ({}))

import {
  getExperienceRatingAggregate, getGuideRatingAggregate,
  listPublishedReviewsForExperience, listPublishedReviewsForGuide,
  hasReviewForBooking,
} from '@/lib/reviews/queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('getExperienceRatingAggregate', () => {
  it('averages ratings in application code', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: [{ rating: 5 }, { rating: 3 }], error: null }))
    expect(await getExperienceRatingAggregate(supabaseMock as never, 'e1')).toEqual({ average: 4, count: 2 })
  })

  it('returns null (never a fake zero) when there are no published reviews', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: [], error: null }))
    expect(await getExperienceRatingAggregate(supabaseMock as never, 'e1')).toBeNull()
  })
})

describe('getGuideRatingAggregate', () => {
  it('averages ratings attributed to the guide', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: [{ rating: 4 }], error: null }))
    expect(await getGuideRatingAggregate(supabaseMock as never, 'g1')).toEqual({ average: 4, count: 1 })
  })
})

describe('listPublishedReviewsForExperience / listPublishedReviewsForGuide', () => {
  it('maps rows to Review objects', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({ data: [{ id: 'r1', rating: 5, body: 'Great!', created_at: '2026-07-01T00:00:00Z' }], error: null }),
    )
    expect(await listPublishedReviewsForExperience(supabaseMock as never, 'e1')).toEqual([
      { id: 'r1', rating: 5, body: 'Great!', createdAt: '2026-07-01T00:00:00Z' },
    ])
  })

  it('maps a null body through unchanged', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({ data: [{ id: 'r2', rating: 3, body: null, created_at: '2026-07-02T00:00:00Z' }], error: null }),
    )
    expect(await listPublishedReviewsForGuide(supabaseMock as never, 'g1')).toEqual([
      { id: 'r2', rating: 3, body: null, createdAt: '2026-07-02T00:00:00Z' },
    ])
  })
})

describe('hasReviewForBooking', () => {
  it('returns true when a row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: { id: 'r1' }, error: null }))
    expect(await hasReviewForBooking(supabaseMock as never, 'b1')).toBe(true)
  })

  it('returns false when no row exists', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: null }))
    expect(await hasReviewForBooking(supabaseMock as never, 'b1')).toBe(false)
  })
})
