// apps/web/tests/sessions.public-queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: () => ({ from: fromMock }) }))

import {
  getUpcomingSessionsList, getReplaySessions, getSessionBySlug, getSessionsForSitemap, getSessionsForDestination, getPublicSessionsForCreator,
} from '@/lib/sessions/public-queries'

const sessionRow = {
  id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
  type: 'ask_a_creator', starts_at: '2027-01-15T18:00:00.000Z', duration_minutes: 45,
  embed_url: 'https://youtu.be/abc123', replay_url: null, destination_tags: ['Tokyo'],
  status: 'scheduled', host_creator_id: 'creator-1',
}
const creatorRow = { id: 'creator-1', handle: 'sora', display_name: 'Sora' }

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'in', 'eq', 'not', 'order', 'limit', 'maybeSingle', 'overlaps']
  for (const m of methods) builder[m] = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => finalValue)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(finalValue).then(resolve)
  return builder
}

beforeEach(() => { fromMock.mockReset() })

describe('getUpcomingSessionsList', () => {
  it('queries scheduled+live sessions ordered by starts_at ascending, then attaches host', async () => {
    const sessionsChain = chain({ data: [sessionRow], error: null })
    const creatorsChain = chain({ data: [creatorRow], error: null })
    fromMock.mockImplementation((table: string) => (table === 'community_sessions' ? sessionsChain : creatorsChain))

    const result = await getUpcomingSessionsList()
    expect(sessionsChain.in).toHaveBeenCalledWith('status', ['scheduled', 'live'])
    expect(sessionsChain.order).toHaveBeenCalledWith('starts_at', { ascending: true })
    expect(result).toEqual([{
      id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
      type: 'ask_a_creator', startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
      embedUrl: 'https://youtu.be/abc123', replayUrl: null, destinationTags: ['Tokyo'],
      status: 'scheduled', host: { handle: 'sora', displayName: 'Sora' },
    }])
  })
})

describe('getReplaySessions', () => {
  it('queries ended sessions with a non-null replay_url, ordered by starts_at descending', async () => {
    const sessionsChain = chain({ data: [], error: null })
    fromMock.mockReturnValue(sessionsChain)
    await getReplaySessions()
    expect(sessionsChain.eq).toHaveBeenCalledWith('status', 'ended')
    expect(sessionsChain.not).toHaveBeenCalledWith('replay_url', 'is', null)
    expect(sessionsChain.order).toHaveBeenCalledWith('starts_at', { ascending: false })
  })
})

describe('getPublicSessionsForCreator', () => {
  it('keeps public session types while filtering an exact host and only upcoming or replayable ended sessions', async () => {
    const upcomingChain = chain({ data: [{ ...sessionRow, type: 'merchant_spotlight', status: 'live' }], error: null })
    const replayChain = chain({ data: [{ ...sessionRow, id: 's2', slug: 'replay', status: 'ended', replay_url: 'https://youtu.be/replay' }], error: null })
    const creatorsChain = chain({ data: [creatorRow], error: null })
    let sessions = 0
    fromMock.mockImplementation((table: string) => table === 'creators'
      ? creatorsChain
      : (++sessions === 1 ? upcomingChain : replayChain))

    const result = await getPublicSessionsForCreator('creator-1')

    expect(upcomingChain.eq).toHaveBeenCalledWith('host_creator_id', 'creator-1')
    expect(upcomingChain.in).toHaveBeenCalledWith('status', ['scheduled', 'live'])
    expect(replayChain.eq).toHaveBeenCalledWith('host_creator_id', 'creator-1')
    expect(replayChain.eq).toHaveBeenCalledWith('status', 'ended')
    expect(replayChain.not).toHaveBeenCalledWith('replay_url', 'is', null)
    expect(result.map((session) => session.type)).toEqual(['merchant_spotlight', 'ask_a_creator'])
  })
})

describe('getSessionBySlug', () => {
  it('returns null when no row matches', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: null }))
    expect(await getSessionBySlug('does-not-exist')).toBeNull()
  })

  it('degrades host to null when the creator row is not publicly readable', async () => {
    const sessionsChain = chain({ data: sessionRow, error: null })
    const creatorsChain = chain({ data: [], error: null })
    fromMock.mockImplementation((table: string) => (table === 'community_sessions' ? sessionsChain : creatorsChain))
    const result = await getSessionBySlug('tokyo-ramen-ama')
    expect(result?.host).toBeNull()
  })
})

describe('getSessionsForSitemap', () => {
  it('includes upcoming and ended-with-replay sessions only', async () => {
    const upcomingChain = chain({ data: [{ slug: 'a', starts_at: '2027-01-01T00:00:00.000Z' }], error: null })
    const replayChain = chain({ data: [{ slug: 'b', starts_at: '2026-06-01T00:00:00.000Z' }], error: null })
    let call = 0
    fromMock.mockImplementation(() => (call++ === 0 ? upcomingChain : replayChain))
    const result = await getSessionsForSitemap()
    expect(result).toEqual([
      { slug: 'a', lastmod: '2027-01-01T00:00:00.000Z' },
      { slug: 'b', lastmod: '2026-06-01T00:00:00.000Z' },
    ])
  })
})

describe('getSessionsForDestination', () => {
  it('returns [] without querying when matchTerms is empty', async () => {
    expect(await getSessionsForDestination([])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('queries scheduled+live sessions overlapping the given match terms, then attaches host', async () => {
    const sessionsChain = chain({ data: [sessionRow], error: null })
    const creatorsChain = chain({ data: [creatorRow], error: null })
    fromMock.mockImplementation((table: string) => (table === 'community_sessions' ? sessionsChain : creatorsChain))

    const result = await getSessionsForDestination(['Tokyo'])
    expect(sessionsChain.in).toHaveBeenCalledWith('status', ['scheduled', 'live'])
    // destination_tags keeps the creator's original casing — the comparison runs against
    // destination_tags_ci (a generated, always-lowercase column kept in sync by Postgres for
    // every row, existing and future), so matchTerms only need lowercasing on this side.
    expect(sessionsChain.overlaps).toHaveBeenCalledWith('destination_tags_ci', ['tokyo'])
    expect(result[0].host).toEqual({ handle: 'sora', displayName: 'Sora' })
  })

  it('lowercases mixed-case match terms before overlapping against destination_tags_ci', async () => {
    const sessionsChain = chain({ data: [sessionRow], error: null })
    const creatorsChain = chain({ data: [creatorRow], error: null })
    fromMock.mockImplementation((table: string) => (table === 'community_sessions' ? sessionsChain : creatorsChain))

    await getSessionsForDestination(['Tokyo, Japan', 'KYOTO'])
    expect(sessionsChain.overlaps).toHaveBeenCalledWith('destination_tags_ci', ['tokyo, japan', 'kyoto'])
  })

  it('never throws — degrades to [] on query failure', async () => {
    fromMock.mockImplementation(() => { throw new Error('boom') })
    expect(await getSessionsForDestination(['Tokyo'])).toEqual([])
  })
})
