import { describe, expect, it } from 'vitest'
import {
  TRAVELLER_ANALYTICS_EVENTS,
  travellerAnalyticsPayloadSchema,
} from '@/lib/analytics/contracts'
import { getAnalyticsMode } from '@/lib/analytics/config'

const validPayload = {
  clientEventId: '2c3d4e5f-6a7b-489c-9def-0123456789ab',
  journeyId: '3d4e5f6a-7b8c-49de-8f01-23456789abcd',
  consentVersion: 'v1' as const,
  event: 'entity_viewed' as const,
  occurredAt: '2026-08-01T12:00:00.000Z',
  locale: 'en' as const,
  routeKey: 'experience_detail',
  entityType: 'experience' as const,
  entityId: 'experience_123',
  bookingState: 'on' as const,
  outcome: 'success' as const,
  errorCategory: 'unknown' as const,
}

describe('traveller analytics contract', () => {
  it('exports the exact event allowlist in order', () => {
    expect(TRAVELLER_ANALYTICS_EVENTS).toEqual([
      'journey_started',
      'entity_viewed',
      'agent_started',
      'booking_cta_clicked',
      'waitlist_submitted',
      'checkout_started',
      'signup_started',
      'signup_completed',
      'offer_viewed',
      'offer_claimed',
    ])
  })

  it('does not include offer_redeemed, which is server-emitted only via redeem_offer_claim', () => {
    expect(TRAVELLER_ANALYTICS_EVENTS).not.toContain('offer_redeemed')
  })

  it('accepts a valid payload with supported enums', () => {
    expect(travellerAnalyticsPayloadSchema.parse(validPayload)).toEqual(validPayload)
  })

  it('accepts every supported locale', () => {
    for (const locale of ['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn']) {
      expect(travellerAnalyticsPayloadSchema.safeParse({ ...validPayload, locale }).success).toBe(true)
    }
  })

  it('rejects arbitrary and prohibited keys', () => {
    expect(travellerAnalyticsPayloadSchema.safeParse({ ...validPayload, metadata: {} }).success).toBe(false)
    expect(travellerAnalyticsPayloadSchema.safeParse({ ...validPayload, email: 'person@example.com' }).success).toBe(false)
  })

  it('rejects invalid route, entity, booking, outcome, and error values', () => {
    expect(travellerAnalyticsPayloadSchema.safeParse({ ...validPayload, routeKey: 'Experience Detail' }).success).toBe(false)
    expect(travellerAnalyticsPayloadSchema.safeParse({ ...validPayload, entityType: 'destination' }).success).toBe(false)
    expect(travellerAnalyticsPayloadSchema.safeParse({ ...validPayload, bookingState: 'maybe' }).success).toBe(false)
    expect(travellerAnalyticsPayloadSchema.safeParse({ ...validPayload, outcome: 'pending' }).success).toBe(false)
    expect(travellerAnalyticsPayloadSchema.safeParse({ ...validPayload, errorCategory: 'network' }).success).toBe(false)
  })
})

describe('getAnalyticsMode', () => {
  it('fails closed to disabled by default and for invalid modes', () => {
    expect(getAnalyticsMode({})).toBe('disabled')
    expect(getAnalyticsMode({ NEXT_PUBLIC_ANALYTICS_MODE: 'enabled' })).toBe('disabled')
  })

  it('accepts only test and production modes', () => {
    expect(getAnalyticsMode({ NEXT_PUBLIC_ANALYTICS_MODE: 'test' })).toBe('test')
    expect(getAnalyticsMode({ ANALYTICS_INGEST_MODE: 'production' })).toBe('production')
  })
})
