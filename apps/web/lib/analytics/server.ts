import 'server-only'

import { travellerAnalyticsPayloadSchema, type TravellerAnalyticsPayload } from '@/lib/analytics/contracts'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

const MAX_REQUEST_BYTES = 8_192
const MAX_CLOCK_SKEW_MS = 15 * 60 * 1_000

export class AnalyticsRequestError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'payload_too_large',
    readonly status: 400 | 413,
  ) {
    super(code)
  }
}

function declaredBodyIsTooLarge(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (!contentLength) return false
  const parsedLength = Number(contentLength)
  return Number.isFinite(parsedLength) && parsedLength > MAX_REQUEST_BYTES
}

function hasAllowedTimestampSkew(occurredAt: string) {
  return Math.abs(Date.now() - new Date(occurredAt).getTime()) <= MAX_CLOCK_SKEW_MS
}

function isAnalyticsIngestEnabled() {
  return process.env.ANALYTICS_INGEST_MODE === 'production'
}

function hasNoEntityMetadata(payload: TravellerAnalyticsPayload) {
  return payload.entityType === undefined && payload.entityId === undefined
}

function hasNoOutcomeMetadata(payload: TravellerAnalyticsPayload) {
  return payload.outcome === undefined && payload.errorCategory === undefined
}

function hasNoBookingMetadata(payload: TravellerAnalyticsPayload) {
  return payload.bookingState === undefined
}

function hasExperienceEntity(payload: TravellerAnalyticsPayload) {
  return payload.entityType === 'experience' && payload.entityId !== undefined
}

function hasConsistentOutcome(payload: TravellerAnalyticsPayload) {
  return payload.outcome === 'error'
    ? payload.errorCategory !== undefined
    : payload.errorCategory === undefined
}

function hasValidEventSemantics(payload: TravellerAnalyticsPayload) {
  if (!hasConsistentOutcome(payload)) return false

  switch (payload.event) {
    case 'journey_started':
      return (
        payload.routeKey === 'journey' &&
        hasNoEntityMetadata(payload) &&
        hasNoBookingMetadata(payload) &&
        hasNoOutcomeMetadata(payload)
      )
    case 'entity_viewed': {
      const routeEntityTypes = {
        guide_detail: 'guide',
        experience_detail: 'experience',
        creator_profile: 'creator',
        article_detail: 'article',
      } as const
      return (
        payload.routeKey in routeEntityTypes &&
        payload.entityType === routeEntityTypes[payload.routeKey as keyof typeof routeEntityTypes] &&
        payload.entityId !== undefined &&
        hasNoBookingMetadata(payload) &&
        hasNoOutcomeMetadata(payload)
      )
    }
    case 'agent_started':
      return (
        payload.routeKey === 'agent' &&
        hasNoEntityMetadata(payload) &&
        hasNoBookingMetadata(payload) &&
        hasNoOutcomeMetadata(payload)
      )
    case 'offer_viewed':
    case 'offer_claimed': {
      const offerRouteEntityTypes = {
        guide_detail: 'offer',
        creator_profile: 'offer',
      } as const
      return (
        payload.routeKey in offerRouteEntityTypes &&
        payload.entityType === offerRouteEntityTypes[payload.routeKey as keyof typeof offerRouteEntityTypes] &&
        payload.entityId !== undefined &&
        hasNoBookingMetadata(payload) &&
        hasNoOutcomeMetadata(payload)
      )
    }
    case 'booking_cta_clicked':
      return (
        payload.routeKey === 'experience_detail' &&
        hasExperienceEntity(payload) &&
        payload.bookingState !== undefined &&
        hasNoOutcomeMetadata(payload)
      )
    case 'waitlist_submitted':
      return (
        payload.routeKey === 'experience_detail' &&
        hasExperienceEntity(payload) &&
        payload.bookingState === 'off' &&
        (payload.outcome === 'submitted' || payload.outcome === 'error')
      )
    case 'checkout_started':
      return (
        payload.routeKey === 'experience_detail' &&
        hasExperienceEntity(payload) &&
        payload.bookingState === 'on' &&
        (payload.outcome === 'created' || payload.outcome === 'error')
      )
    case 'signup_started':
      return (
        payload.routeKey === 'sign_up' &&
        hasNoEntityMetadata(payload) &&
        hasNoBookingMetadata(payload) &&
        hasNoOutcomeMetadata(payload)
      )
    case 'signup_completed':
      return (
        payload.routeKey === 'sign_up' &&
        hasNoEntityMetadata(payload) &&
        hasNoBookingMetadata(payload) &&
        (payload.outcome === 'success' || payload.outcome === 'error')
      )
  }
}

export async function parseAnalyticsRequest(request: Request): Promise<TravellerAnalyticsPayload> {
  if (declaredBodyIsTooLarge(request)) {
    throw new AnalyticsRequestError('payload_too_large', 413)
  }

  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    throw new AnalyticsRequestError('payload_too_large', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new AnalyticsRequestError('invalid_request', 400)
  }

  const parsed = travellerAnalyticsPayloadSchema.safeParse(body)
  if (!parsed.success || !hasAllowedTimestampSkew(parsed.data.occurredAt) || !hasValidEventSemantics(parsed.data)) {
    throw new AnalyticsRequestError('invalid_request', 400)
  }

  return parsed.data
}

export async function persistTravellerAnalyticsEvent(
  payload: TravellerAnalyticsPayload,
  accountId: string | null,
): Promise<'stored' | 'duplicate' | 'discarded'> {
  if (!isAnalyticsIngestEnabled()) return 'discarded'

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('traveller_analytics_events')
    .upsert(
      {
        client_event_id: payload.clientEventId,
        journey_id: payload.journeyId,
        consent_version: payload.consentVersion,
        event_name: payload.event,
        occurred_at: payload.occurredAt,
        locale: payload.locale,
        route_key: payload.routeKey,
        entity_type: payload.entityType ?? null,
        entity_id: payload.entityId ?? null,
        booking_state: payload.bookingState ?? 'off',
        authenticated: accountId !== null,
        outcome: payload.outcome ?? null,
        error_category: payload.errorCategory ?? null,
        account_id: accountId,
      },
      { onConflict: 'journey_id,client_event_id', ignoreDuplicates: true },
    )
    .select('id')

  if (error) throw new Error('analytics_persistence_failed')
  return data && data.length > 0 ? 'stored' : 'duplicate'
}
