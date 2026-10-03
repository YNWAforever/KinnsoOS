import { NextResponse } from 'next/server'
import { isAuthSessionMissingError } from '@supabase/supabase-js'

import {
  AnalyticsRequestError,
  parseAnalyticsRequest,
  persistTravellerAnalyticsEvent,
} from '@/lib/analytics/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/http/client-ip'

const MAX_REQUESTS_PER_WINDOW = 120
const RATE_LIMIT_WINDOW_SECONDS = 600

// The per-journey limit below is keyed on a client-supplied uuid, so it only
// bounds a well-behaved session — a caller minting a fresh journeyId per
// request always gets a fresh bucket. This IP limit is what actually bounds the
// caller, matching every other public write path (checkout, agent, rsvp). It is
// deliberately more generous than the per-journey cap: several genuine
// journeys (tabs, or visitors behind one NAT/corporate egress) can share an IP.
const MAX_REQUESTS_PER_IP_WINDOW = 600

function unavailableResponse() {
  return NextResponse.json({ accepted: false, error: 'unavailable' }, { status: 503 })
}

export async function POST(request: Request) {
  let payload
  try {
    payload = await parseAnalyticsRequest(request)
  } catch (error) {
    if (error instanceof AnalyticsRequestError) {
      const responseError = error.status === 413 ? 'payload_too_large' : 'invalid_request'
      return NextResponse.json({ accepted: false, error: responseError }, { status: error.status })
    }
    return unavailableResponse()
  }

  // Preview/test ingestion is an explicit no-write mode. Keep parsing and
  // semantic validation active, but never create a Supabase client or touch
  // the rate-limit ledger outside production.
  if (process.env.ANALYTICS_INGEST_MODE !== 'production') {
    return NextResponse.json({ accepted: true }, { status: 202 })
  }

  try {
    const supabase = await createSupabaseServerClient()

    const ip = await getClientIp()
    const { data: ipAllowed, error: ipThrottleError } = await supabase.rpc(
      'check_and_increment_traveller_analytics_ip_rate_limit',
      {
        p_ip: ip,
        p_max_requests: MAX_REQUESTS_PER_IP_WINDOW,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )
    if (ipThrottleError) return unavailableResponse()
    if (!ipAllowed) {
      return NextResponse.json({ accepted: false, error: 'rate_limited' }, { status: 429 })
    }

    const { data: allowed, error: throttleError } = await supabase.rpc(
      'check_and_increment_traveller_analytics_rate_limit',
      {
        p_journey_id: payload.journeyId,
        p_max_requests: MAX_REQUESTS_PER_WINDOW,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )

    if (throttleError) return unavailableResponse()
    if (!allowed) {
      return NextResponse.json({ accepted: false, error: 'rate_limited' }, { status: 429 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    // No cookie-backed session is the expected, common case for this route: most
    // analytics events (journey_started, entity_viewed, offer_viewed, ...) fire
    // before the visitor ever signs in, and this app never mints an anonymous
    // Supabase session. getUser() surfaces that as AuthSessionMissingError, not
    // `user: null` with no error -- treating it as a fatal 503 here silently
    // discarded every unauthenticated event. Only a genuine auth-server failure
    // (any other error) should abort the request.
    if (authError && !isAuthSessionMissingError(authError)) return unavailableResponse()

    await persistTravellerAnalyticsEvent(payload, user?.id ?? null)
    return NextResponse.json({ accepted: true }, { status: 202 })
  } catch {
    return unavailableResponse()
  }
}
