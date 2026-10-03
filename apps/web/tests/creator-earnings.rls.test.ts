// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbContainer = process.env.SUPABASE_DB_CONTAINER
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

// Same gate shape as mission.rls.test.ts: skip wholesale rather than fail when the local
// Supabase stack is absent, so the suite is safe in an environment without Docker.
const d = svcKey && dbContainer && url && anonKey ? describe : describe.skip

const hookTimeout = 60000
const testTimeout = 15000
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

function runPsql(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', [
      'exec', '-i', dbContainer!, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    ])
    let stderr = ''
    p.stderr.on('data', (c) => { stderr += String(c) })
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr))))
    p.stdin.write(sql)
    p.stdin.end()
  })
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Hand-sign an HS256 access token; this repo never calls signInWithPassword in RLS suites. */
function clientFor(userId: string) {
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const payload = b64({
    sub: userId, role: 'authenticated', aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  const sig = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${header}.${payload}.${sig}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const svc = () => createClient(url!, svcKey!, { auth: { persistSession: false, autoRefreshToken: false } })

const creatorC = randomUUID()
const creatorD = randomUUID()
const traveller = randomUUID()
const merchantUser = randomUUID()

d('creator_earnings_summary', () => {
  let missionId = ''
  let missionSettlementId = ''
  let experienceId = ''
  let bookingId = ''
  let bookingSettlementId = ''
  let affiliateEventId = ''

  beforeAll(async () => {
    // Seeded directly into auth.users AND auth.identities — the Admin API is not used here,
    // matching mission.rls.test.ts. Identifiers are namespaced by runId for isolation.
    await runPsql(`
      insert into auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at)
      values
        ('${creatorC}', 'earn-c-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${creatorD}', 'earn-d-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${traveller}', 'earn-t-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${merchantUser}', 'earn-m-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now())
      on conflict (id) do nothing;

      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
      select id, id, id::text, 'email',
             jsonb_build_object('sub', id::text, 'email', email), now()
      from auth.users where id in ('${creatorC}', '${creatorD}', '${traveller}', '${merchantUser}')
      on conflict do nothing;

      -- handle_new_user() gives every signup a blank creators row; force the states we need.
      update public.creators set status = 'active' where id in ('${creatorC}', '${creatorD}');
      update public.creators set status = 'onboarding' where id = '${traveller}';
    `)

    // Seed C's three money rows through the service client so RLS is not in the way of setup.
    const merchant = await svc()
      .from('merchant_profiles')
      .insert({
        user_id: merchantUser,
        company_name: `Earnings RLS Merchant ${runId}`,
        contact_email: `earn-merchant-${runId}@example.test`,
      })
      .select('id')
      .single()
    if (merchant.error) throw merchant.error
    const merchantProfileId = merchant.data!.id

    // 1. Merchant mission + participant + a mission_settlements row attributed to C.
    const mission = await svc()
      .from('missions')
      .insert({
        merchant_profile_id: merchantProfileId,
        title: 'Earnings RLS Test Mission',
        summary: 'Mission used to prove creator_earnings_summary amounts on a live stack',
        mission_source: 'merchant',
        mission_type: 'coupon_affiliate',
        visibility: 'open',
        status: 'published',
        coupon_code: 'EARNRLS',
        coupon_url: 'https://example.com/earn-rls',
        affiliate_commission_rate: 10,
        kinnso_commission_rate: 4,
        creator_commission_rate: 6,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (mission.error) throw mission.error
    missionId = mission.data!.id

    const participant = await svc()
      .from('mission_participants')
      .insert({ mission_id: missionId, creator_id: creatorC, status: 'active', source: 'open_join' })
      .select('id')
      .single()
    if (participant.error) throw participant.error
    const participantId = participant.data!.id

    const missionSettlement = await svc()
      .from('mission_settlements')
      .insert({
        mission_id: missionId,
        mission_participant_id: participantId,
        status: 'paid',
        amount_currency: 'USD',
        creator_commission_amount: 42.5,
        creator_payout_status: 'paid',
      })
      .select('id')
      .single()
    if (missionSettlement.error) throw missionSettlement.error
    missionSettlementId = missionSettlement.data!.id

    // 2. Experience + availability + a booking with creator_id = C. Inserted as
    // pending_payment then UPDATEd to confirmed, because create_booking_settlement_on_confirm()
    // fires only on exactly that transition.
    const experience = await svc()
      .from('experiences')
      .insert({
        merchant_profile_id: merchantProfileId,
        slug: `earnings-rls-experience-${runId}`,
        title: 'Earnings RLS Experience',
        city: 'Hong Kong',
        price_amount: 800,
        currency: 'USD',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (experience.error) throw experience.error
    experienceId = experience.data!.id

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const availability = await svc()
      .from('experience_availability')
      .insert({ experience_id: experienceId, date: futureDate, capacity: 10, booked_count: 0, status: 'open' })
      .select('id')
      .single()
    if (availability.error) throw availability.error
    const availabilityId = availability.data!.id

    const booking = await svc()
      .from('bookings')
      .insert({
        experience_id: experienceId,
        availability_id: availabilityId,
        guest_email: `earn-guest-${runId}@example.test`,
        qty: 1,
        unit_amount: 800,
        total_amount: 800,
        currency: 'USD',
        status: 'pending_payment',
        creator_id: creatorC,
      })
      .select('id')
      .single()
    if (booking.error) throw booking.error
    bookingId = booking.data!.id

    const confirm = await svc().from('bookings').update({ status: 'confirmed' }).eq('id', bookingId)
    if (confirm.error) throw confirm.error

    const bookingSettlement = await svc()
      .from('booking_settlements')
      .select('id')
      .eq('booking_id', bookingId)
      .single()
    if (bookingSettlement.error) throw bookingSettlement.error
    bookingSettlementId = bookingSettlement.data!.id

    // 3. An affiliate_network_events row with event_state = 'paid', creator_id = C and a
    // positive profit_amount.
    const affiliateEvent = await svc()
      .from('affiliate_network_events')
      .insert({
        network: 'travelpayouts',
        mission_id: missionId,
        creator_id: creatorC,
        external_action_id: `earn-affiliate-${runId}`,
        event_state: 'paid',
        profit_amount: 55.75,
        currency: 'USD',
      })
      .select('id')
      .single()
    if (affiliateEvent.error) throw affiliateEvent.error
    affiliateEventId = affiliateEvent.data!.id
  }, hookTimeout)

  afterAll(async () => {
    // Raw deletes rather than relying purely on cascades, guarded so a partial seed
    // (a beforeAll that threw partway through) still cleans up what did get created.
    // bookings must go first — experiences/experience_availability are RESTRICT-referenced
    // by bookings, so deleting them (via the merchant_profiles cascade below) would fail
    // if a booking still pointed at them.
    await runPsql(`
      delete from public.bookings where creator_id in ('${creatorC}', '${creatorD}');
      delete from public.affiliate_network_events where creator_id in ('${creatorC}', '${creatorD}');
      delete from public.merchant_profiles where user_id = '${merchantUser}';
      delete from auth.users where id in ('${creatorC}', '${creatorD}', '${traveller}', '${merchantUser}');
    `)
  }, hookTimeout)

  it('returns all three streams for the owning creator, with the seeded amounts', async () => {
    const { data, error } = await clientFor(creatorC).rpc('creator_earnings_summary')
    expect(error).toBeNull()
    const payload = data as {
      mission_settlements: Record<string, unknown>[]
      booking_settlements: Record<string, unknown>[]
      tracked_affiliate: Record<string, unknown>[]
    }

    expect(payload.mission_settlements).toHaveLength(1)
    expect(payload.mission_settlements[0]).toMatchObject({
      id: missionSettlementId,
      mission_title: 'Earnings RLS Test Mission',
      mission_type: 'coupon_affiliate',
      mission_source: 'merchant',
      currency: 'USD',
      amount: 42.5,
      payout_status: 'paid',
    })

    expect(payload.booking_settlements).toHaveLength(1)
    expect(payload.booking_settlements[0]).toMatchObject({
      id: bookingSettlementId,
      experience_title: 'Earnings RLS Experience',
      currency: 'USD',
      amount: 80,
      payout_status: 'pending',
    })

    expect(payload.tracked_affiliate).toHaveLength(1)
    expect(payload.tracked_affiliate[0]).toMatchObject({
      id: affiliateEventId,
      mission_title: 'Earnings RLS Test Mission',
      currency: 'USD',
      gross_amount: 55.75,
      event_state: 'paid',
    })
  }, testTimeout)

  it('returns empty arrays — not an error, and not C\'s data — for another creator', async () => {
    const { data, error } = await clientFor(creatorD).rpc('creator_earnings_summary')
    expect(error).toBeNull()
    expect(data).toEqual({ mission_settlements: [], booking_settlements: [], tracked_affiliate: [] })
  }, testTimeout)

  it('rejects a signed-in non-creator', async () => {
    const { error } = await clientFor(traveller).rpc('creator_earnings_summary')
    expect(error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${error?.message} ${error?.code}`)).toBe(true)
  }, testTimeout)

  it('omits an affiliate event that already has a settlement row (anti-double-count)', async () => {
    // The R10.1 anti-double-count rule: point a fresh mission_settlements row at C's
    // affiliate event, then assert the event leaves tracked_affiliate. Run last —
    // this mutates state the earlier assertions depend on.
    const extra = await svc()
      .from('mission_settlements')
      .insert({
        mission_id: missionId,
        affiliate_network_event_id: affiliateEventId,
        status: 'pending',
        amount_currency: 'USD',
        creator_commission_amount: 1,
        creator_payout_status: 'pending',
      })
      .select('id')
      .single()
    expect(extra.error).toBeNull()

    const { data, error } = await clientFor(creatorC).rpc('creator_earnings_summary')
    expect(error).toBeNull()
    const payload = data as { tracked_affiliate: { id: string }[] }
    expect(payload.tracked_affiliate.some((t) => t.id === affiliateEventId)).toBe(false)
  }, testTimeout)
})
