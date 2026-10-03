import { z } from 'zod'

export const TRAVELLER_ANALYTICS_EVENTS = [
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
] as const

export type TravellerAnalyticsEventName = (typeof TRAVELLER_ANALYTICS_EVENTS)[number]

export const travellerAnalyticsPayloadSchema = z.object({
  clientEventId: z.string().uuid(),
  journeyId: z.string().uuid(),
  consentVersion: z.literal('v1'),
  event: z.enum(TRAVELLER_ANALYTICS_EVENTS),
  occurredAt: z.string().datetime({ offset: true }),
  locale: z.enum(['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn']),
  routeKey: z.string().regex(/^[a-z0-9_/-]{1,80}$/),
  entityType: z.enum(['guide', 'experience', 'creator', 'article', 'offer']).optional(),
  entityId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/).optional(),
  bookingState: z.enum(['off', 'on']).optional(),
  outcome: z.enum(['created', 'submitted', 'success', 'error']).optional(),
  errorCategory: z.enum(['invalid', 'rate_limited', 'unavailable', 'unknown']).optional(),
}).strict()

export type TravellerAnalyticsPayload = z.infer<typeof travellerAnalyticsPayloadSchema>
