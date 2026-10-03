import { afterEach, describe, expect, it, vi } from 'vitest'

const { serviceClientMock, serviceFromMock, serviceUpsertMock, serviceSelectMock } = vi.hoisted(() => ({
  serviceClientMock: vi.fn(),
  serviceFromMock: vi.fn(),
  serviceUpsertMock: vi.fn(),
  serviceSelectMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceClientMock,
}))

import { parseAnalyticsRequest, persistTravellerAnalyticsEvent } from '@/lib/analytics/server'
import type { TravellerAnalyticsPayload } from '@/lib/analytics/contracts'

const originalMode = process.env.ANALYTICS_INGEST_MODE
const originalPublicMode = process.env.NEXT_PUBLIC_ANALYTICS_MODE

function validPayload(overrides: Partial<TravellerAnalyticsPayload> & Record<string, unknown> = {}): TravellerAnalyticsPayload {
  return {
    clientEventId: '00000000-0000-4000-8000-000000000001',
    journeyId: '00000000-0000-4000-8000-000000000002',
    consentVersion: 'v1',
    event: 'checkout_started',
    occurredAt: new Date().toISOString(),
    locale: 'en',
    routeKey: 'experience_detail',
    entityType: 'experience',
    entityId: 'experience_1',
    bookingState: 'on',
    outcome: 'created',
    ...overrides,
  }
}

afterEach(() => {
  vi.resetAllMocks()
  if (originalMode === undefined) delete process.env.ANALYTICS_INGEST_MODE
  else process.env.ANALYTICS_INGEST_MODE = originalMode
  if (originalPublicMode === undefined) delete process.env.NEXT_PUBLIC_ANALYTICS_MODE
  else process.env.NEXT_PUBLIC_ANALYTICS_MODE = originalPublicMode
})

describe('parseAnalyticsRequest', () => {
  const base = {
    clientEventId: '00000000-0000-4000-8000-000000000001',
    journeyId: '00000000-0000-4000-8000-000000000002',
    consentVersion: 'v1',
    occurredAt: new Date().toISOString(),
    locale: 'en',
  } as const

  const validEventPayloads = {
    journey_started: { ...base, event: 'journey_started', routeKey: 'journey' },
    entity_viewed: {
      ...base,
      event: 'entity_viewed',
      routeKey: 'guide_detail',
      entityType: 'guide',
      entityId: 'guide_1',
    },
    agent_started: { ...base, event: 'agent_started', routeKey: 'agent' },
    booking_cta_clicked: {
      ...base,
      event: 'booking_cta_clicked',
      routeKey: 'experience_detail',
      entityType: 'experience',
      entityId: 'experience_1',
      bookingState: 'on',
    },
    waitlist_submitted: {
      ...base,
      event: 'waitlist_submitted',
      routeKey: 'experience_detail',
      entityType: 'experience',
      entityId: 'experience_1',
      bookingState: 'off',
      outcome: 'submitted',
    },
    checkout_started: validPayload(),
    signup_started: { ...base, event: 'signup_started', routeKey: 'sign_up' },
    signup_completed: { ...base, event: 'signup_completed', routeKey: 'sign_up', outcome: 'success' },
    offer_viewed: {
      ...base,
      event: 'offer_viewed',
      routeKey: 'guide_detail',
      entityType: 'offer',
      entityId: 'offer_1',
    },
    offer_claimed: {
      ...base,
      event: 'offer_claimed',
      routeKey: 'creator_profile',
      entityType: 'offer',
      entityId: 'offer_1',
    },
  }

  it.each(Object.values(validEventPayloads))('accepts the approved event taxonomy', async (payload) => {
    await expect(
      parseAnalyticsRequest(
        new Request('http://kinnso.test/api/analytics', { method: 'POST', body: JSON.stringify(payload) }),
      ),
    ).resolves.toMatchObject({ event: payload.event })
  })

  it.each([
    { ...validEventPayloads.waitlist_submitted, outcome: 'error', errorCategory: 'unavailable' },
    { ...validEventPayloads.checkout_started, outcome: 'error', errorCategory: 'unavailable' },
    { ...validEventPayloads.signup_completed, outcome: 'error', errorCategory: 'unavailable' },
  ])('accepts an allowed error outcome only when its category is constrained', async (payload) => {
    await expect(
      parseAnalyticsRequest(
        new Request('http://kinnso.test/api/analytics', { method: 'POST', body: JSON.stringify(payload) }),
      ),
    ).resolves.toMatchObject({ outcome: 'error', errorCategory: 'unavailable' })
  })

  it.each([
    ['journey_started with an arbitrary route', { ...validEventPayloads.journey_started, routeKey: 'home' }],
    ['entity_viewed with a mismatched entity type', { ...validEventPayloads.entity_viewed, entityType: 'article' }],
    ['agent_started with entity metadata', { ...validEventPayloads.agent_started, entityType: 'guide', entityId: 'guide_1' }],
    ['booking_cta_clicked without booking state', (() => {
      const { bookingState: _bookingState, ...payload } = validEventPayloads.booking_cta_clicked
      return payload
    })()],
    ['waitlist_submitted with a checkout outcome', { ...validEventPayloads.waitlist_submitted, outcome: 'created' }],
    ['checkout_started with the obsolete success outcome', { ...validEventPayloads.checkout_started, outcome: 'success' }],
    ['a non-error outcome with an error category', { ...validEventPayloads.checkout_started, errorCategory: 'unknown' }],
    ['signup_started with an outcome', { ...validEventPayloads.signup_started, outcome: 'success' }],
    ['signup_completed error without an error category', { ...validEventPayloads.signup_completed, outcome: 'error' }],
    ['offer_viewed with a mismatched entity type', { ...validEventPayloads.offer_viewed, entityType: 'guide' }],
    ['offer_viewed without an entity id', (() => {
      const { entityId: _entityId, ...payload } = validEventPayloads.offer_viewed
      return payload
    })()],
    ['offer_claimed with a route key outside the offer taxonomy', { ...validEventPayloads.offer_claimed, routeKey: 'experience_detail' }],
  ])('rejects %s', async (_description, payload) => {
    await expect(
      parseAnalyticsRequest(
        new Request('http://kinnso.test/api/analytics', { method: 'POST', body: JSON.stringify(payload) }),
      ),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_request' })
  })

  it('rejects a measured body over 8 KiB before JSON handling', async () => {
    const request = new Request('http://kinnso.test/api/analytics', {
      method: 'POST',
      body: `${JSON.stringify(validPayload())}${' '.repeat(8_193)}`,
    })

    await expect(parseAnalyticsRequest(request)).rejects.toMatchObject({
      status: 413,
      code: 'payload_too_large',
    })
    expect(serviceClientMock).not.toHaveBeenCalled()
  })

  it('rejects prohibited data before any service write', async () => {
    const request = new Request('http://kinnso.test/api/analytics', {
      method: 'POST',
      body: JSON.stringify(validPayload({ email: 'traveller@example.com' })),
    })

    await expect(parseAnalyticsRequest(request)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    })
    expect(serviceClientMock).not.toHaveBeenCalled()
  })

  it.each([-16 * 60 * 1000, 16 * 60 * 1000])(
    'rejects event timestamps outside the fifteen-minute skew window (%i ms)',
    async (offset) => {
      const request = new Request('http://kinnso.test/api/analytics', {
        method: 'POST',
        body: JSON.stringify(validPayload({ occurredAt: new Date(Date.now() + offset).toISOString() })),
      })

      await expect(parseAnalyticsRequest(request)).rejects.toMatchObject({
        status: 400,
        code: 'invalid_request',
      })
    },
  )
})

describe('persistTravellerAnalyticsEvent', () => {
  it.each([undefined, 'disabled', 'test'])(
    'discards when only the browser-visible mode is production and ingest mode is %s',
    async (ingestMode) => {
      process.env.NEXT_PUBLIC_ANALYTICS_MODE = 'production'
      if (ingestMode === undefined) delete process.env.ANALYTICS_INGEST_MODE
      else process.env.ANALYTICS_INGEST_MODE = ingestMode

      await expect(persistTravellerAnalyticsEvent(validPayload(), null)).resolves.toBe('discarded')
      expect(serviceClientMock).not.toHaveBeenCalled()
    },
  )

  it('discards validated events in test mode without creating a service client', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'test'

    await expect(persistTravellerAnalyticsEvent(validPayload(), null)).resolves.toBe('discarded')
    expect(serviceClientMock).not.toHaveBeenCalled()
  })

  it('upserts a flat, server-linked row idempotently in production', async () => {
    process.env.ANALYTICS_INGEST_MODE = 'production'
    serviceSelectMock.mockResolvedValue({ data: [{ id: 'ledger-row-1' }], error: null })
    serviceUpsertMock.mockReturnValue({ select: serviceSelectMock })
    serviceFromMock.mockReturnValue({ upsert: serviceUpsertMock })
    serviceClientMock.mockReturnValue({ from: serviceFromMock })

    await expect(persistTravellerAnalyticsEvent(validPayload(), '00000000-0000-4000-8000-000000000003')).resolves.toBe('stored')
    expect(serviceFromMock).toHaveBeenCalledWith('traveller_analytics_events')
    expect(serviceUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticated: true,
        account_id: '00000000-0000-4000-8000-000000000003',
        entity_id: 'experience_1',
      }),
      { onConflict: 'journey_id,client_event_id', ignoreDuplicates: true },
    )
  })
})
