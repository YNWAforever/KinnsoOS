// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fetchActionsMock, upsertMock, programsSelectMock, linksSelectMock, fromMock } = vi.hoisted(() => {
  const fetchActionsMock = vi.fn()
  const upsertMock = vi.fn(async () => ({ error: null }))
  const programsSelectMock = vi.fn(async () => ({ data: [{ id: 'prog1', external_program_id: '101' }], error: null }))
  const linksSelectMock = vi.fn(async () => ({
    data: [{ sub_id: 'kinnso_m_1_p_2_c_3', mission_id: 'm1', mission_participant_id: 'p1', creator_id: 'c1' }],
    error: null,
  }))
  const fromMock = vi.fn((table: string) => {
    if (table === 'affiliate_network_programs') return { select: () => ({ eq: () => ({ in: programsSelectMock }) }) }
    if (table === 'affiliate_partner_links') return { select: () => ({ eq: () => ({ in: linksSelectMock }) }) }
    if (table === 'affiliate_network_events') return { upsert: upsertMock }
    throw new Error(`unexpected table ${table}`)
  })
  return { fetchActionsMock, upsertMock, programsSelectMock, linksSelectMock, fromMock }
})

vi.mock('@/lib/missions/travelpayouts', () => ({ fetchTravelpayoutsActions: fetchActionsMock }))
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => ({ from: fromMock }) }))

import { GET } from '@/app/api/cron/travelpayouts-sync/route'

const makeReq = (bearer?: string) =>
  new Request('http://x/api/cron/travelpayouts-sync', {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 's3cret'
  programsSelectMock.mockResolvedValue({ data: [{ id: 'prog1', external_program_id: '101' }], error: null })
  linksSelectMock.mockResolvedValue({
    data: [{ sub_id: 'kinnso_m_1_p_2_c_3', mission_id: 'm1', mission_participant_id: 'p1', creator_id: 'c1' }],
    error: null,
  })
  upsertMock.mockResolvedValue({ error: null })
})

describe('GET /api/cron/travelpayouts-sync', () => {
  it("401s without the Authorization: Bearer <CRON_SECRET> header (Vercel Cron's real invocation shape)", async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
    expect(fetchActionsMock).not.toHaveBeenCalled()
  })

  it('401s with the wrong secret', async () => {
    const res = await GET(makeReq('wrong'))
    expect(res.status).toBe(401)
    expect(fetchActionsMock).not.toHaveBeenCalled()
  })

  it('fetches, maps program/sub_id lookups, and upserts on the correct conflict target', async () => {
    fetchActionsMock.mockResolvedValue([
      {
        externalActionId: 'a1',
        externalProgramId: '101',
        eventState: 'paid',
        subId: 'kinnso_m_1_p_2_c_3',
        priceAmount: 100,
        profitAmount: 10,
        currency: 'usd',
        bookedAt: '2026-07-01',
        updatedAt: '2026-07-02',
        raw: {},
      },
    ])
    const res = await GET(makeReq('s3cret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, synced: 1 })
    expect(upsertMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          network: 'travelpayouts',
          external_action_id: 'a1',
          affiliate_network_program_id: 'prog1',
          mission_id: 'm1',
          mission_participant_id: 'p1',
          creator_id: 'c1',
          sub_id: 'kinnso_m_1_p_2_c_3',
          event_state: 'paid',
          price_amount: 100,
          profit_amount: 10,
          currency: 'usd',
          booked_at: '2026-07-01',
          external_updated_at: '2026-07-02',
        }),
      ],
      { onConflict: 'network,external_action_id' },
    )
  })

  it('best-effort maps: an action whose program/sub_id has no local match still upserts, with null FKs', async () => {
    programsSelectMock.mockResolvedValue({ data: [], error: null })
    linksSelectMock.mockResolvedValue({ data: [], error: null })
    fetchActionsMock.mockResolvedValue([
      {
        externalActionId: 'a2',
        externalProgramId: 'unknown-campaign',
        eventState: 'unknown',
        subId: null,
        priceAmount: null,
        profitAmount: null,
        currency: 'usd',
        bookedAt: null,
        updatedAt: null,
        raw: {},
      },
    ])
    const res = await GET(makeReq('s3cret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, synced: 1 })
    expect(upsertMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          external_action_id: 'a2',
          affiliate_network_program_id: null,
          mission_id: null,
          mission_participant_id: null,
          creator_id: null,
        }),
      ],
      { onConflict: 'network,external_action_id' },
    )
  })

  it('returns synced:0 and skips the upsert entirely when the fetch yields nothing', async () => {
    fetchActionsMock.mockResolvedValue([])
    const res = await GET(makeReq('s3cret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, synced: 0 })
    expect(upsertMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('502s when the Travelpayouts fetch itself throws', async () => {
    fetchActionsMock.mockRejectedValue(new Error('network down'))
    const res = await GET(makeReq('s3cret'))
    expect(res.status).toBe(502)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
