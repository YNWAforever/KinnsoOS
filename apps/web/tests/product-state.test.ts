// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getProductState,
  getSessionsLive,
  resolveConfiguredProductState,
} from '@/lib/product-state'

const { createSupabasePublicClientMock } = vi.hoisted(() => ({
  createSupabasePublicClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: createSupabasePublicClientMock,
}))

type QueryResult = { data: Array<{ id: string }> | null; error: Error | null }

function query(result: QueryResult) {
  const chain = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  }
  chain.select.mockReturnValue(chain)
  chain.in.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.not.mockReturnValue(chain)
  return chain
}

function publicClient(...queries: ReturnType<typeof query>[]) {
  return { from: vi.fn().mockImplementation(() => queries.shift()) }
}

describe('product state', () => {
  afterEach(() => {
    createSupabasePublicClientMock.mockReset()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('uses the locked configured defaults', () => {
    expect(resolveConfiguredProductState({})).toEqual({ agentLive: true, bookingLive: false })
  })

  it('accepts case-insensitive true and false values', () => {
    expect(resolveConfiguredProductState({ AGENT_LIVE: 'false', BOOKING_LIVE: 'TRUE' }))
      .toEqual({ agentLive: false, bookingLive: true })
  })

  it('trims configured values', () => {
    expect(resolveConfiguredProductState({ AGENT_LIVE: ' false ', BOOKING_LIVE: ' TRUE ' }))
      .toEqual({ agentLive: false, bookingLive: true })
  })

  it('composes configured state with derived Sessions state', async () => {
    const client = publicClient(query({ data: [{ id: 'upcoming' }], error: null }))
    createSupabasePublicClientMock.mockReturnValue(client as never)
    vi.stubEnv('AGENT_LIVE', 'false')
    vi.stubEnv('BOOKING_LIVE', 'true')

    await expect(getProductState()).resolves.toEqual({
      agentLive: false,
      bookingLive: true,
      sessionsLive: true,
    })
  })

  it('rejects configured values other than true or false without echoing them', () => {
    expect(() => resolveConfiguredProductState({ BOOKING_LIVE: 'yes' }))
      .toThrow('BOOKING_LIVE must be true or false')
    try {
      resolveConfiguredProductState({ BOOKING_LIVE: 'yes' })
    } catch (error) {
      expect(String(error)).not.toContain('yes')
    }
  })

  it('returns true for an upcoming session without querying replays', async () => {
    const upcoming = query({ data: [{ id: 'upcoming' }], error: null })
    const replay = query({ data: [{ id: 'replay' }], error: null })
    const client = publicClient(upcoming, replay)

    await expect(getSessionsLive(client as never)).resolves.toBe(true)
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledWith('community_sessions')
    expect(upcoming.select).toHaveBeenCalledWith('id')
    expect(upcoming.in).toHaveBeenCalledWith('status', ['scheduled', 'live'])
    expect(upcoming.limit).toHaveBeenCalledWith(1)
  })

  it('returns true when an ended session has a replay', async () => {
    const upcoming = query({ data: [], error: null })
    const replay = query({ data: [{ id: 'replay' }], error: null })
    const client = publicClient(upcoming, replay)

    await expect(getSessionsLive(client as never)).resolves.toBe(true)
    expect(client.from).toHaveBeenCalledTimes(2)
    expect(replay.select).toHaveBeenCalledWith('id')
    expect(replay.eq).toHaveBeenCalledWith('status', 'ended')
    expect(replay.not).toHaveBeenCalledWith('replay_url', 'is', null)
    expect(replay.limit).toHaveBeenCalledWith(1)
  })

  it('returns false when there is no upcoming session or replay', async () => {
    const client = publicClient(
      query({ data: [], error: null }),
      query({ data: [], error: null }),
    )

    await expect(getSessionsLive(client as never)).resolves.toBe(false)
  })

  it.each([
    ['upcoming', publicClient(query({ data: null, error: new Error('raw-upcoming-secret') }))],
    [
      'replay',
      publicClient(
        query({ data: [], error: null }),
        query({ data: null, error: new Error('raw-replay-secret') }),
      ),
    ],
  ])('fails closed with a safe warning when the %s query errors', async (_queryName, client) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(getSessionsLive(client as never)).resolves.toBe(false)
    expect(warn).toHaveBeenCalledWith('product-state-sessions-query-failed')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('raw-')
  })
})
