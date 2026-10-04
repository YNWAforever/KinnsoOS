import { afterEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, rpcMock, serverClientMock, serviceClientMock, serviceFromMock, serviceSelectMock, serviceUpsertMock, getClientIpMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  serverClientMock: vi.fn(),
  serviceClientMock: vi.fn(),
  serviceFromMock: vi.fn(),
  serviceSelectMock: vi.fn(),
  serviceUpsertMock: vi.fn(),
  getClientIpMock: vi.fn(async () => '1.2.3.4'),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: serverClientMock,
}))

vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceClientMock,
}))

import { POST } from '@/app/api/analytics/route'

const originalMode = process.env.ANALYTICS_INGEST_MODE

function payload(overrides: Record<string, unknown> = {}) {
  return {
    clientEventId: '00000000-0000-4000-8000-000000000001',
    journeyId: '00000000-0000-4000-8000-000000000002',
    consentVersion: 'v1',
    event: 'journey_started',
    occurredAt: new Date().toISOString(),
    locale: 'en',
    routeKey: 'journey',
    ...overrides,
  }
}

function request(body: unknown, headers?: HeadersInit) {
  return new Request('http://kinnso.test/api/analytics', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function allowJourney() {
  // Covers both throttles: the per-IP limit and the per-journey limit.
  rpcMock.mockResolvedValue({ data: true, error: null })
  getUserMock.mockResolvedValue({ data: { user: null }, error: null })
  getClientIpMock.mockResolvedValue('1.2.3.4')
  serverClientMock.mockResolvedValue({ rpc: rpcMock, auth: { getUser: getUserMock } })
}

afterEach(() => {
  vi.resetAllMocks()
  if (originalMode === undefined) delete process.env.ANALYTICS_INGEST_MODE
  else process.env.ANALYTICS_INGEST_MODE = originalMode
})

describe('POST /api/analytics', () => {
  it('returns 400 for an event whose route is outside the approved taxonomy', async () => {
    const response = await POST(request(payload({ routeKey: 'home' })))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ accepted: false, error: 'invalid_request' })
    expect(serverClientMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an offer event with a mismatched entity type', async () => {
    const response = await POST(
      request(
        payload({
          event: 'offer_claimed',
          routeKey: 'guide_detail',
          entityType: 'guide',
          entityId: 'offer_1',
        }),
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ accepted: false, error: 'invalid_request' })
    expect(serverClientMock).not.toHaveBeenCalled()
  })

  it.each(['offer_viewed', 'offer_claimed'])(
    'acknowledges a valid %s event through the full ingest path',
    async (event) => {
      process.env.ANALYTICS_INGEST_MODE = 'production'
      allowJourney()
      serviceSelectMock.mockResolvedValue({ data: [{ id: 'ledger-row-1' }], error: null })
      serviceUpsertMock.mockReturnValue({ select: serviceSelectMock })
      serviceFromMock.mockReturnValue({ upsert: serviceUpsertMock })
      serviceClientMock.mockReturnValue({ from: serviceFromMock })

      const response = await POST(
        request(
          payload({
            event,
            routeKey: 'creator_profile',
            entityType: 'offer',
            entityId: 'offer_1',
          }),
        ),
      )

      expect(response.status).toBe(202)
      await expect(response.json()).resolves.toEqual({ accepted: true })
      expect(serviceUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ event_name: event, entity_type: 'offer', entity_id: 'offer_1' }),
        { onConflict: 'journey_id,client_event_id', ignoreDuplicates: true },
      )
    },
  )

  it('returns 413 for an oversized raw request without opening a client', async () => {
    const response = await POST(request(`${JSON.stringify(payload())}${' '.repeat(8_193)}`))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ accepted: false, error: 'payload_too_large' })
    expect(serverClientMock).not.toHaveBeenCalled()
  })

  it('returns 429 when the journey throttle rejects a valid raw event', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'production'
    rpcMock.mockResolvedValue({ data: false, error: null })
    serverClientMock.mockResolvedValue({ rpc: rpcMock, auth: { getUser: getUserMock } })

    const response = await POST(request(payload()))

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({ accepted: false, error: 'rate_limited' })
  })

  it('returns 429 on the per-IP throttle even when each event uses a fresh journeyId', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'production'
    getClientIpMock.mockResolvedValue('9.9.9.9')
    // The IP limit rejects; the per-journey limit would happily allow, since a
    // rotated journeyId always lands in a fresh bucket.
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'check_and_increment_traveller_analytics_ip_rate_limit'
          ? { data: false, error: null }
          : { data: true, error: null },
      ),
    )
    serverClientMock.mockResolvedValue({ rpc: rpcMock, auth: { getUser: getUserMock } })

    const response = await POST(
      request(payload({ journeyId: '00000000-0000-4000-8000-00000000beef' })),
    )

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({ accepted: false, error: 'rate_limited' })
    expect(rpcMock).toHaveBeenCalledWith(
      'check_and_increment_traveller_analytics_ip_rate_limit',
      expect.objectContaining({ p_ip: '9.9.9.9' }),
    )
  })

  it('acknowledges valid test-mode events without opening a Supabase client', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'test'

    const response = await POST(request(payload()))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ accepted: true })
    expect(serverClientMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges a duplicate ledger event with 202', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'production'
    allowJourney()
    serviceSelectMock.mockResolvedValue({ data: [], error: null })
    serviceUpsertMock.mockReturnValue({ select: serviceSelectMock })
    serviceFromMock.mockReturnValue({ upsert: serviceUpsertMock })
    serviceClientMock.mockReturnValue({ from: serviceFromMock })

    const response = await POST(request(payload()))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ accepted: true })
  })

  it('returns a generic 503 when persistence is unavailable', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'production'
    allowJourney()
    serviceSelectMock.mockResolvedValue({ data: null, error: new Error('database details') })
    serviceUpsertMock.mockReturnValue({ select: serviceSelectMock })
    serviceFromMock.mockReturnValue({ upsert: serviceUpsertMock })
    serviceClientMock.mockReturnValue({ from: serviceFromMock })

    const response = await POST(request(payload()))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ accepted: false, error: 'unavailable' })
  })
})
