import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
// Real route handler under test for the client-emitted-analytics live proof
// below -- imported statically like `api.analytics.test.ts` does, but here
// with `@/lib/supabase/server` and `@/lib/supabase/service` left unmocked so
// it exercises the real Supabase clients against the real local stack.
import { POST } from '@/app/api/analytics/route'

// Only `next/headers` is stubbed here, and only because `cookies()`/`headers()`
// require Next's request-scoped AsyncLocalStorage, which does not exist when a
// route handler is invoked directly from a test (outside real Next.js request
// handling) -- this throws even for a plain anonymous request. Nothing about
// Supabase or the analytics business logic is mocked: `@/lib/supabase/server`,
// `@/lib/supabase/service`, and `@/lib/analytics/server` all run for real
// against the live local stack below, exactly like the rest of this file.
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
  headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1' }),
}))

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient<Database>(url, serviceKey)

async function signedInClient(email: string) {
  const password = 'test-password-12345!'
  await admin.auth.admin.createUser({ email, password, email_confirm: true })
  const client = createClient<Database>(url, anonKey)
  await client.auth.signInWithPassword({ email, password })
  return client
}

describe('R12.1 journey attribution + visits_driven live proof', () => {
  let merchantAId: string
  let creatorId: string
  let missionId: string
  let offerId: string
  let visitor: Awaited<ReturnType<typeof signedInClient>>
  let staffA: Awaited<ReturnType<typeof signedInClient>>
  let creatorClient: Awaited<ReturnType<typeof signedInClient>>

  beforeAll(async () => {
    const merchantAUser = randomUUID()
    const creatorUser = randomUUID()
    const visitorUser = randomUUID()

    staffA = await signedInClient(`merchant-a-${merchantAUser}@test.kinnso.dev`)
    creatorClient = await signedInClient(`creator-${creatorUser}@test.kinnso.dev`)
    visitor = await signedInClient(`visitor-${visitorUser}@test.kinnso.dev`)

    const { data: { user: staffAUser } } = await staffA.auth.getUser()
    const { data: { user: creatorAuthUser } } = await creatorClient.auth.getUser()

    const { data: mA } = await admin.from('merchant_profiles').insert({
      user_id: staffAUser!.id, company_name: `Merchant A ${randomUUID()}`, status: 'active', contact_email: `a@${randomUUID().slice(0, 8)}.test`,
    }).select('id').single()
    merchantAId = mA!.id as string

    // handle_new_user() (auth.users trigger) already auto-inserted a `creators` row for
    // this new user at status 'onboarding' (on conflict do nothing) by the time
    // signedInClient() returns -- a plain insert here would violate the id primary key.
    // creator_insights() requires status = 'active', so upsert to flip it rather than
    // insert.
    await admin.from('creators').upsert(
      { id: creatorAuthUser!.id, status: 'active', display_name: 'Test Creator' },
      { onConflict: 'id' },
    )
    creatorId = creatorAuthUser!.id

    const { data: mission, error: missionError } = await admin.from('missions').insert({
      merchant_profile_id: merchantAId, title: `Mission ${randomUUID()}`,
      summary: 'Test mission', mission_source: 'merchant',
      mission_type: 'paid', status: 'published', visibility: 'open', auto_approve_policy: 'off',
    }).select('id').single()
    if (missionError) throw new Error(`Failed to create mission: ${missionError.message}`)
    missionId = mission!.id as string

    await admin.from('mission_participants').insert({
      mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join',
    })

    const { data: offer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Free dessert', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 20,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 10, total_cap: 100, status: 'live',
    }).select('id').single()
    offerId = offer!.id as string
  })

  it('a consented claim + redemption emits exactly one offer_redeemed event with the right journey_id', async () => {
    const journeyId = randomUUID()
    const { data: claim, error: claimError } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
      p_journey_id: journeyId, p_locale: 'en',
    })
    expect(claimError).toBeNull()
    const rawToken = (claim as { raw_token: string }).raw_token

    const { error: redeemError } = await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(redeemError).toBeNull()

    const { data: events } = await admin
      .from('traveller_analytics_events')
      .select('event_name, journey_id, entity_type, entity_id')
      .eq('journey_id', journeyId)
      .eq('event_name', 'offer_redeemed')
    expect(events ?? []).toHaveLength(1)
    expect(events![0].entity_type).toBe('offer')
    expect(events![0].entity_id).toBe(offerId)
  })

  it('an unconsented claim (no journey_id) + redemption emits no analytics event', async () => {
    const { data: claim, error: claimError } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(claimError).toBeNull()
    const rawToken = (claim as { raw_token: string }).raw_token

    const { error: redeemError } = await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(redeemError).toBeNull()

    const { data: redemption } = await admin
      .from('offer_redemptions')
      .select('id, offer_claim_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const { data: thisClaim } = await admin
      .from('offer_claims')
      .select('analytics_journey_id')
      .eq('id', redemption!.offer_claim_id)
      .single()
    // Authoritative check: this specific unconsented claim never got a journey_id, so
    // redeem_offer_claim's `if v_claim.analytics_journey_id is not null` guard must have
    // skipped the event insert for it.
    expect(thisClaim!.analytics_journey_id).toBeNull()
  })

  it('merchant_insights visits_driven reports separate redemption and attributed-booking counts', async () => {
    const { data, error } = await staffA.rpc('merchant_insights')
    expect(error).toBeNull()
    const payload = data as { visits_driven: { creator_id: string; redemptions: number; attributed_bookings: number }[] }
    const row = payload.visits_driven.find((r) => r.creator_id === creatorId)
    expect(row).toBeDefined()
    expect(row!.redemptions).toBeGreaterThan(0)

    // The redemptions channel above comes entirely from offer_claims/offer_redemptions
    // (the two earlier `it`s in this file). attributed_bookings must come from an
    // independent channel: public.bookings joined to public.experiences, using
    // bookings.creator_id/guide_id directly -- NOT gated behind offer_claims at all (see
    // 2449ac8, which fixed a real undercount where a booking whose visitor never claimed
    // a merchant offer was silently dropped). Capture the pre-booking baseline first so
    // this assertion holds regardless of how many redemptions the earlier tests produced.
    const baselineRedemptions = row!.redemptions
    const baselineAttributedBookings = row!.attributed_bookings

    const { data: experience, error: experienceError } = await admin
      .from('experiences')
      .insert({
        merchant_profile_id: merchantAId,
        slug: `visits-driven-rls-${randomUUID()}`,
        title: 'Visits Driven RLS Experience',
        city: 'Hong Kong',
        price_amount: 500,
        currency: 'USD',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(experienceError).toBeNull()
    const experienceId = experience!.id as string

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: availability, error: availabilityError } = await admin
      .from('experience_availability')
      .insert({ experience_id: experienceId, date: futureDate, capacity: 10, booked_count: 0, status: 'open' })
      .select('id')
      .single()
    expect(availabilityError).toBeNull()
    const availabilityId = availability!.id as string

    // Exactly two bookings, attributed to the same creator, with status = 'confirmed' --
    // and no offer_claims row in sight -- to specifically prove the "no offer_claims
    // gating" fix holds and that the FULL OUTER JOIN in merchant_insights() does not
    // cross-multiply the two channels.
    for (let i = 0; i < 2; i += 1) {
      const { error: bookingError } = await admin.from('bookings').insert({
        experience_id: experienceId,
        availability_id: availabilityId,
        guest_email: `visits-driven-guest-${randomUUID()}@example.test`,
        qty: 1,
        unit_amount: 500,
        total_amount: 500,
        currency: 'USD',
        status: 'confirmed',
        creator_id: creatorId,
      })
      expect(bookingError).toBeNull()
    }

    const { data: data2, error: error2 } = await staffA.rpc('merchant_insights')
    expect(error2).toBeNull()
    const payload2 = data2 as { visits_driven: { creator_id: string; redemptions: number; attributed_bookings: number }[] }
    const row2 = payload2.visits_driven.find((r) => r.creator_id === creatorId)
    expect(row2).toBeDefined()

    // Not cross-multiplied: adding two independent bookings changes attributed_bookings
    // by exactly 2 and leaves redemptions completely untouched.
    expect(row2!.redemptions).toBe(baselineRedemptions)
    expect(row2!.attributed_bookings).toBe(baselineAttributedBookings + 2)
    expect(row2!.attributed_bookings).toBeGreaterThan(0)
  })

  it("creator_insights visits_driven total counts this creator's own redemptions", async () => {
    const { data, error } = await creatorClient.rpc('creator_insights')
    expect(error).toBeNull()
    const payload = data as { visits_driven: number }
    expect(payload.visits_driven).toBeGreaterThan(0)
  })

  describe('client-emitted analytics ingest (offer_viewed) -- real route handler, real DB', () => {
    // This block proves the CLIENT-emitted half of journey attribution end-to-end:
    // a real POST body, through the real `POST` handler exported by
    // app/api/analytics/route.ts, through the real `parseAnalyticsRequest` /
    // `persistTravellerAnalyticsEvent` in lib/analytics/server.ts, landing a real
    // row in `traveller_analytics_events` via a real local Postgres. The `it`s
    // above already prove the SERVER-emitted half (claim_offer ->
    // redeem_offer_claim -> offer_redeemed) the same way. Together they close
    // the gap the R12.1 final review flagged: 6ce0603's regression tests for
    // the offer_viewed/offer_claimed 400 bug run the same route handler but
    // against a MOCKED Supabase client, which proves request/response shape,
    // not that a row actually lands in a real database.
    const originalMode = process.env.ANALYTICS_INGEST_MODE

    afterEach(() => {
      if (originalMode === undefined) delete process.env.ANALYTICS_INGEST_MODE
      else process.env.ANALYTICS_INGEST_MODE = originalMode
    })

    function analyticsRequest(body: unknown) {
      return new Request('http://kinnso.test/api/analytics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    it('POSTing a real offer_viewed payload persists a matching traveller_analytics_events row', async () => {
      process.env.ANALYTICS_INGEST_MODE = 'production'

      const journeyId = randomUUID()
      const clientEventId = randomUUID()

      const response = await POST(
        analyticsRequest({
          clientEventId,
          journeyId,
          consentVersion: 'v1',
          event: 'offer_viewed',
          occurredAt: new Date().toISOString(),
          locale: 'en',
          routeKey: 'creator_profile',
          entityType: 'offer',
          // Reuses the `offerId` fixture created in the outer beforeAll -- a
          // real merchant_offers row, not a synthetic id -- so this exercises
          // the ingest path with realistic data instead of duplicating the
          // creator/merchant/offer setup boilerplate.
          entityId: offerId,
        }),
      )

      expect(response.status).toBe(202)
      await expect(response.json()).resolves.toEqual({ accepted: true })

      const { data: events, error } = await admin
        .from('traveller_analytics_events')
        .select('event_name, journey_id, entity_type, entity_id, route_key')
        .eq('journey_id', journeyId)
        .eq('client_event_id', clientEventId)
      expect(error).toBeNull()
      expect(events ?? []).toHaveLength(1)
      expect(events![0].event_name).toBe('offer_viewed')
      expect(events![0].entity_type).toBe('offer')
      expect(events![0].entity_id).toBe(offerId)
      expect(events![0].route_key).toBe('creator_profile')
    })
  })
})
