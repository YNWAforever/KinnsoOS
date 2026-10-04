import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  contribution: null as unknown,
  events: [] as unknown[],
}))

function makeClient() {
  const builder = (resolve: () => unknown, single?: () => unknown) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      order: () => Promise.resolve({ data: resolve() }),
      maybeSingle: async () => ({ data: single ? single() : null }),
    }
    return b
  }
  return {
    from: (table: string) =>
      table === 'creator_contribution'
        ? builder(() => null, () => state.contribution)
        : builder(() => state.events),
  }
}

import { getCreatorContribution, getCreatorStoredTier, listContributionEvents } from '@/lib/contribution/queries'

beforeEach(() => {
  state.contribution = null
  state.events = []
})

describe('getCreatorContribution', () => {
  it('returns progress derived from the stored points', async () => {
    state.contribution = { contribution_points: 80, tier: 'rising' }
    const c = await getCreatorContribution(makeClient() as never, 'creator-1')
    expect(c.tier).toBe('rising')
    expect(c.points).toBe(80)
    expect(c.nextTier).toBe('pro')
    expect(c.pointsForNext).toBe(70)
  })

  it('defaults a creator with no row to seed/0', async () => {
    state.contribution = null
    const c = await getCreatorContribution(makeClient() as never, 'creator-1')
    expect(c.tier).toBe('seed')
    expect(c.points).toBe(0)
    expect(c.pct).toBe(0)
  })
})

describe('getCreatorStoredTier', () => {
  it('returns the stored tier column verbatim', async () => {
    state.contribution = { tier: 'pro' }
    expect(await getCreatorStoredTier(makeClient() as never, 'creator-1')).toBe('pro')
  })

  it('defaults a creator with no contribution row to seed', async () => {
    state.contribution = null
    expect(await getCreatorStoredTier(makeClient() as never, 'creator-1')).toBe('seed')
  })
})

describe('listContributionEvents', () => {
  it('maps event rows to camelCase items', async () => {
    state.events = [
      { id: 'e1', event_type: 'mission_verified', points: 40, created_at: '2026-06-20T00:00:00Z' },
      { id: 'e2', event_type: 'guide_published', points: 15, created_at: '2026-06-19T00:00:00Z' },
    ]
    const items = await listContributionEvents(makeClient() as never, 'creator-1')
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ id: 'e1', eventType: 'mission_verified', points: 40, createdAt: '2026-06-20T00:00:00Z' })
  })

  it('returns an empty array when there are no events', async () => {
    expect(await listContributionEvents(makeClient() as never, 'creator-1')).toEqual([])
  })
})
