import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

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

describe('R12.0 offer claim/redeem RLS + live proof', () => {
  let merchantAId: string
  let merchantBId: string
  let creatorId: string
  let missionId: string
  let offerId: string
  let visitor: Awaited<ReturnType<typeof signedInClient>>
  let staffA: Awaited<ReturnType<typeof signedInClient>>
  let staffB: Awaited<ReturnType<typeof signedInClient>>
  let creatorClient: Awaited<ReturnType<typeof signedInClient>>

  beforeAll(async () => {
    const merchantAUser = randomUUID()
    const merchantBUser = randomUUID()
    const creatorUser = randomUUID()
    const visitorUser = randomUUID()

    staffA = await signedInClient(`merchant-a-${merchantAUser}@test.kinnso.dev`)
    staffB = await signedInClient(`merchant-b-${merchantBUser}@test.kinnso.dev`)
    creatorClient = await signedInClient(`creator-${creatorUser}@test.kinnso.dev`)
    visitor = await signedInClient(`visitor-${visitorUser}@test.kinnso.dev`)

    const { data: { user: staffAUser } } = await staffA.auth.getUser()
    const { data: { user: staffBUser } } = await staffB.auth.getUser()
    const { data: { user: creatorAuthUser } } = await creatorClient.auth.getUser()

    const { data: mA } = await admin.from('merchant_profiles').insert({
      user_id: staffAUser!.id, company_name: `Merchant A ${randomUUID()}`, status: 'active', contact_email: `a@${randomUUID().slice(0, 8)}.test`,
    }).select('id').single()
    merchantAId = mA!.id as string

    const { data: mB } = await admin.from('merchant_profiles').insert({
      user_id: staffBUser!.id, company_name: `Merchant B ${randomUUID()}`, status: 'active', contact_email: `b@${randomUUID().slice(0, 8)}.test`,
    }).select('id').single()
    merchantBId = mB!.id as string

    await admin.from('creators').insert({ id: creatorAuthUser!.id, status: 'active', display_name: 'Test Creator' })
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
      per_visitor_limit: 1, total_cap: 10, status: 'live',
    }).select('id').single()
    offerId = offer!.id as string
  })

  it('full chain: claim -> redeem -> settlement minted with source visit_redemption', async () => {
    const { data: claim, error: claimError } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(claimError).toBeNull()
    const rawToken = (claim as { raw_token: string }).raw_token

    const { data: redemption, error: redeemError } = await staffA.rpc('redeem_offer_claim', {
      p_raw_token: rawToken, p_amount_spent: null,
    })
    expect(redeemError).toBeNull()
    expect((redemption as { already_redeemed: boolean }).already_redeemed).toBe(false)

    const { data: settlement } = await admin
      .from('mission_settlements')
      .select('source, paid_fee_amount, status')
      .eq('mission_id', missionId)
      .eq('source', 'visit_redemption')
      .single()
    expect(settlement?.source).toBe('visit_redemption')
    expect(settlement?.paid_fee_amount).toBe(20)
    expect(settlement?.status).toBe('not_started')
  })

  it('double-scan is idempotent: second redeem returns already_redeemed, not an error', async () => {
    const { data: claim } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    const rawToken = (claim as { raw_token: string }).raw_token

    const first = await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect((first.data as { already_redeemed: boolean }).already_redeemed).toBe(false)

    const second = await staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(second.error).toBeNull()
    expect((second.data as { already_redeemed: boolean }).already_redeemed).toBe(true)
  })

  it('merchant B cannot redeem merchant A\'s claim', async () => {
    const { data: claim } = await visitor.rpc('claim_offer', {
      p_offer_id: offerId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    const rawToken = (claim as { raw_token: string }).raw_token

    const { error } = await staffB.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('forbidden')
  })

  it('a creator cannot call redeem_offer_claim at all', async () => {
    const { data: testOffer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Test offer for creator check', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 20,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 1, total_cap: 10, status: 'live',
    }).select('id').single()
    const testOfferId = testOffer!.id as string

    const creatorVisitor = await signedInClient(`creator-check-visitor-${randomUUID()}@test.kinnso.dev`)
    const { data: claim, error: claimError } = await creatorVisitor.rpc('claim_offer', {
      p_offer_id: testOfferId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(claimError).toBeNull()
    const rawToken = (claim as { raw_token: string }).raw_token

    const { error } = await creatorClient.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('forbidden')
  })

  it('a visitor reads only their own claims, not another visitor\'s', async () => {
    const otherVisitor = await signedInClient(`visitor2-${randomUUID()}@test.kinnso.dev`)
    const { data: mine } = await visitor.from('offer_claims').select('id').eq('creator_id', creatorId)
    const { data: theirs } = await otherVisitor.from('offer_claims').select('id').eq('creator_id', creatorId)
    expect((mine ?? []).length).toBeGreaterThan(0)
    expect(theirs ?? []).toEqual([])
  })

  it('merchant B cannot read merchant A\'s claims', async () => {
    const { data: theirs } = await staffB.from('offer_claims').select('id').eq('offer_id', offerId)
    expect(theirs ?? []).toEqual([])
  })

  it('claiming past total_cap fails cleanly', async () => {
    const { data: cappedOffer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Capped offer', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 10,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 1, total_cap: 1, status: 'live',
    }).select('id').single()

    const firstVisitor = visitor
    const { error: firstError } = await firstVisitor.rpc('claim_offer', {
      p_offer_id: cappedOffer!.id, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(firstError).toBeNull()

    const secondVisitor = await signedInClient(`visitor3-${randomUUID()}@test.kinnso.dev`)
    const { error: secondError } = await secondVisitor.rpc('claim_offer', {
      p_offer_id: cappedOffer!.id, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(secondError).not.toBeNull()
    expect(secondError!.message).toContain('offer_cap_reached')
  })

  it('two truly concurrent claims against a total_cap-1-remaining offer: exactly one wins', async () => {
    const { data: almostFullOffer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Almost full offer', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 10,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 1, total_cap: 1, status: 'live',
    }).select('id').single()

    const visitorA = await signedInClient(`race-a-${randomUUID()}@test.kinnso.dev`)
    const visitorB = await signedInClient(`race-b-${randomUUID()}@test.kinnso.dev`)

    const [resultA, resultB] = await Promise.all([
      visitorA.rpc('claim_offer', { p_offer_id: almostFullOffer!.id, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile' }),
      visitorB.rpc('claim_offer', { p_offer_id: almostFullOffer!.id, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile' }),
    ])

    const successes = [resultA, resultB].filter((r) => r.error === null)
    const failures = [resultA, resultB].filter((r) => r.error !== null)
    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(failures[0].error!.message).toContain('offer_cap_reached')

    const { data: finalOffer } = await admin.from('merchant_offers').select('claimed_count').eq('id', almostFullOffer!.id).single()
    expect(finalOffer?.claimed_count).toBe(1)
  })

  it('two truly concurrent redemptions of the same claim: exactly one debits, the other is idempotent', async () => {
    const { data: raceOffer } = await admin.from('merchant_offers').insert({
      merchant_profile_id: merchantAId, mission_id: missionId,
      title: 'Race offer for concurrent redemption', terms: 'One per visitor',
      discount_kind: 'item', discount_value: 1,
      commission_kind: 'flat', commission_value: 20,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_to: new Date(Date.now() + 3600_000).toISOString(),
      per_visitor_limit: 1, total_cap: 10, status: 'live',
    }).select('id').single()
    const raceOfferId = raceOffer!.id as string

    const raceVisitor = await signedInClient(`race-redeem-visitor-${randomUUID()}@test.kinnso.dev`)
    const { data: claim, error: claimError } = await raceVisitor.rpc('claim_offer', {
      p_offer_id: raceOfferId, p_creator_id: creatorId, p_guide_id: null, p_source: 'profile',
    })
    expect(claimError).toBeNull()
    const rawToken = (claim as { raw_token: string }).raw_token

    const [redeemA, redeemB] = await Promise.all([
      staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null }),
      staffA.rpc('redeem_offer_claim', { p_raw_token: rawToken, p_amount_spent: null }),
    ])

    expect(redeemA.error).toBeNull()
    expect(redeemB.error).toBeNull()
    const alreadyRedeemedFlags = [redeemA, redeemB].map((r) => (r.data as { already_redeemed: boolean }).already_redeemed)
    expect(alreadyRedeemedFlags.sort()).toEqual([false, true])

    const { data: redemptions } = await admin.from('offer_redemptions').select('id').eq('offer_claim_id', (claim as { claim_id: string }).claim_id)
    expect(redemptions ?? []).toHaveLength(1)
  })
})
