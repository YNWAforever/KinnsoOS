// apps/web/tests/saves-and-reviews.rls.test.ts
//
// db.r6a-saves-and-reviews.test.ts only string-matches the migration file's SQL text.
// That catches a missing clause but not a subtly wrong one (e.g. an operator-precedence
// bug, or `is not distinct from` silently replaced by a plain `=` that still contains the
// same substring elsewhere in the file). This file runs the real reviews_insert RLS
// policy against a live Postgres instance, mirroring the sign-in-as-a-real-user pattern
// established by creator-rls.test.ts / mission.rls.test.ts, and also verifies the
// guide_saves/experience_saves idempotent-upsert claim (D-R6A) against the tables' actual
// unique constraints rather than a mocked-call parameter-shape check.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'missing'
const d = svcKey && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? describe : describe.skip
const hookTimeout = 60000
const testTimeout = 15000

const svc = createClient(url, svcKey ?? 'missing')
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const password = 'Test1234!rls'

const travelerEmail = `r6a-rls-traveler-${runId}@example.test`
const otherTravelerEmail = `r6a-rls-other-traveler-${runId}@example.test`
const merchantEmail = `r6a-rls-merchant-${runId}@example.test`
const creatorEmail = `r6a-rls-creator-${runId}@example.test`
const opsEmail = `r6a-rls-ops-${runId}@example.test`

let travelerId = ''
let otherTravelerId = ''
let merchantUserId = ''
let creatorUserId = ''
let opsUserId = ''
let opsMemberId = ''
let merchantProfileId = ''
let experienceId = ''
let otherExperienceId = ''
let availabilityId = ''
let guideId = ''
let otherGuideId = ''
let completedBookingId = ''
let confirmedBookingId = ''
let guestBookingId = ''
const insertedReviewIds: string[] = []

async function authedClient(email: string) {
  const anon = createClient(url, anonKey)
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull()
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })
}

d('R6A reviews_insert RLS + saves idempotency (live Postgres)', () => {
  beforeAll(async () => {
    const traveler = await svc.auth.admin.createUser({ email: travelerEmail, password, email_confirm: true })
    expect(traveler.error, `createUser failed: ${traveler.error?.message}`).toBeNull()
    travelerId = traveler.data.user!.id

    const otherTraveler = await svc.auth.admin.createUser({ email: otherTravelerEmail, password, email_confirm: true })
    expect(otherTraveler.error, `createUser failed: ${otherTraveler.error?.message}`).toBeNull()
    otherTravelerId = otherTraveler.data.user!.id

    const merchantUser = await svc.auth.admin.createUser({ email: merchantEmail, password, email_confirm: true })
    expect(merchantUser.error, `createUser failed: ${merchantUser.error?.message}`).toBeNull()
    merchantUserId = merchantUser.data.user!.id

    const creatorUser = await svc.auth.admin.createUser({ email: creatorEmail, password, email_confirm: true })
    expect(creatorUser.error, `createUser failed: ${creatorUser.error?.message}`).toBeNull()
    creatorUserId = creatorUser.data.user!.id

    const opsUser = await svc.auth.admin.createUser({ email: opsEmail, password, email_confirm: true })
    expect(opsUser.error, `createUser failed: ${opsUser.error?.message}`).toBeNull()
    opsUserId = opsUser.data.user!.id

    const opsMember = await svc
      .from('kinnso_ops_members')
      .insert({ user_id: opsUserId, display_name: 'R6A RLS Ops', status: 'active' })
      .select('id')
      .single()
    expect(opsMember.error).toBeNull()
    opsMemberId = opsMember.data!.id

    const merchant = await svc
      .from('merchant_profiles')
      .insert({ user_id: merchantUserId, company_name: 'R6A RLS Merchant', contact_email: merchantEmail })
      .select('id')
      .single()
    expect(merchant.error).toBeNull()
    merchantProfileId = merchant.data!.id

    const experience = await svc
      .from('experiences')
      .insert({
        merchant_profile_id: merchantProfileId, slug: `r6a-rls-experience-${runId}`, title: 'R6A RLS Experience',
        city: 'Hong Kong', price_amount: 100, currency: 'HKD', status: 'published', published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(experience.error).toBeNull()
    experienceId = experience.data!.id

    const otherExperience = await svc
      .from('experiences')
      .insert({
        merchant_profile_id: merchantProfileId, slug: `r6a-rls-other-experience-${runId}`, title: 'R6A RLS Other Experience',
        city: 'Hong Kong', price_amount: 100, currency: 'HKD', status: 'published', published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(otherExperience.error).toBeNull()
    otherExperienceId = otherExperience.data!.id

    const availability = await svc
      .from('experience_availability')
      .insert({ experience_id: experienceId, date: '2026-08-01', capacity: 10 })
      .select('id')
      .single()
    expect(availability.error).toBeNull()
    availabilityId = availability.data!.id

    const guide = await svc
      .from('guides')
      .insert({
        creator_id: creatorUserId, creator_handle: 'r6arlscreator', creator_name: 'R6A RLS Creator',
        slug: `r6a-rls-guide-${runId}`, title: 'R6A RLS Guide', summary: 'A guide used only for RLS verification.',
        cover_url: 'https://example.com/r6a-rls-cover.jpg', city: 'Hong Kong', status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(guide.error).toBeNull()
    guideId = guide.data!.id

    const otherGuide = await svc
      .from('guides')
      .insert({
        creator_id: creatorUserId, creator_handle: 'r6arlscreatorother', creator_name: 'R6A RLS Other Creator',
        slug: `r6a-rls-other-guide-${runId}`, title: 'R6A RLS Other Guide', summary: 'A second guide used only for RLS verification.',
        cover_url: 'https://example.com/r6a-rls-cover.jpg', city: 'Hong Kong', status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(otherGuide.error).toBeNull()
    otherGuideId = otherGuide.data!.id

    const bookingBase = {
      experience_id: experienceId, availability_id: availabilityId, guide_id: guideId,
      qty: 1, unit_amount: 100, total_amount: 100, currency: 'HKD',
    }

    const completedBooking = await svc
      .from('bookings')
      .insert({ ...bookingBase, traveler_user_id: travelerId, status: 'completed' })
      .select('id')
      .single()
    expect(completedBooking.error).toBeNull()
    completedBookingId = completedBooking.data!.id

    const confirmedBooking = await svc
      .from('bookings')
      .insert({ ...bookingBase, traveler_user_id: travelerId, status: 'confirmed' })
      .select('id')
      .single()
    expect(confirmedBooking.error).toBeNull()
    confirmedBookingId = confirmedBooking.data!.id

    const guestBooking = await svc
      .from('bookings')
      .insert({ ...bookingBase, traveler_user_id: null, guest_email: `r6a-rls-guest-${runId}@example.test`, status: 'completed' })
      .select('id')
      .single()
    expect(guestBooking.error).toBeNull()
    guestBookingId = guestBooking.data!.id
  }, hookTimeout)

  afterAll(async () => {
    if (insertedReviewIds.length > 0) {
      await svc.from('reviews').delete().in('id', insertedReviewIds)
    }
    const bookingIds = [completedBookingId, confirmedBookingId, guestBookingId].filter(Boolean)
    if (bookingIds.length > 0) await svc.from('bookings').delete().in('id', bookingIds)
    if (availabilityId) await svc.from('experience_availability').delete().eq('id', availabilityId)
    const experienceIds = [experienceId, otherExperienceId].filter(Boolean)
    if (experienceIds.length > 0) await svc.from('experiences').delete().in('id', experienceIds)
    const guideIds = [guideId, otherGuideId].filter(Boolean)
    if (guideIds.length > 0) await svc.from('guides').delete().in('id', guideIds)
    if (merchantProfileId) await svc.from('merchant_profiles').delete().eq('id', merchantProfileId)
    if (opsMemberId) await svc.from('kinnso_ops_members').delete().eq('id', opsMemberId)
    const userIds = [travelerId, otherTravelerId, merchantUserId, creatorUserId, opsUserId].filter(Boolean)
    for (const id of userIds) await svc.auth.admin.deleteUser(id)
  }, hookTimeout)

  describe('reviews_insert', () => {
    it('rejects a review on a confirmed (not yet completed) booking (D-R6A-1)', async () => {
      const traveler = await authedClient(travelerEmail)
      const { error } = await traveler
        .from('reviews')
        .insert({ booking_id: confirmedBookingId, traveler_user_id: travelerId, experience_id: experienceId, guide_id: guideId, rating: 5 })
      expect(error).not.toBeNull()
    }, testTimeout)

    it("rejects a review submitted by a user who isn't the booking's own traveler", async () => {
      const other = await authedClient(otherTravelerEmail)
      // otherTraveler references travelerA's completed booking. traveler_user_id = auth.uid()
      // is satisfied (it's their own id), but the exists-subquery's b.traveler_user_id =
      // auth.uid() fails because the real booking belongs to travelerA, not otherTraveler.
      const { error } = await other
        .from('reviews')
        .insert({ booking_id: completedBookingId, traveler_user_id: otherTravelerId, experience_id: experienceId, guide_id: guideId, rating: 5 })
      expect(error).not.toBeNull()
    }, testTimeout)

    it("rejects a review whose experience_id has been tampered to not match the booking's own experience_id", async () => {
      const traveler = await authedClient(travelerEmail)
      const { error } = await traveler
        .from('reviews')
        .insert({ booking_id: completedBookingId, traveler_user_id: travelerId, experience_id: otherExperienceId, guide_id: guideId, rating: 5 })
      expect(error).not.toBeNull()
    }, testTimeout)

    it("rejects a review whose guide_id has been tampered to not match the booking's own guide_id", async () => {
      const traveler = await authedClient(travelerEmail)
      const { error } = await traveler
        .from('reviews')
        .insert({ booking_id: completedBookingId, traveler_user_id: travelerId, experience_id: experienceId, guide_id: null, rating: 5 })
      expect(error).not.toBeNull()
    }, testTimeout)

    it('rejects a review on a guest-checkout booking (traveler_user_id is null) for any authenticated caller (D-R6A-4)', async () => {
      const traveler = await authedClient(travelerEmail)
      const { error } = await traveler
        .from('reviews')
        .insert({ booking_id: guestBookingId, traveler_user_id: travelerId, experience_id: experienceId, guide_id: guideId, rating: 5 })
      expect(error).not.toBeNull()
    }, testTimeout)

    it('allows the real traveler to review their own completed booking once every id matches (positive control)', async () => {
      const traveler = await authedClient(travelerEmail)
      const { data, error } = await traveler
        .from('reviews')
        .insert({
          booking_id: completedBookingId, traveler_user_id: travelerId, experience_id: experienceId, guide_id: guideId,
          rating: 5, body: 'Verified by live RLS test.',
        })
        .select('id')
        .single()
      expect(error).toBeNull()
      expect(data!.id).toBeTruthy()
      insertedReviewIds.push(data!.id)
    }, testTimeout)
  })

  // reviews_ops_update is the only thing standing between `grant update on
  // public.reviews to authenticated` and any signed-in traveller rewriting
  // someone else's published review. db.r6a-saves-and-reviews.test.ts only
  // string-matches its `using`/`with check` clauses; this exercises the real
  // policy with a positive control (an ops user can hide a review) and two
  // negative controls (neither the review's own author nor an unrelated
  // non-ops traveller can).
  describe('reviews_ops_update', () => {
    let opsUpdateBookingId = ''
    let opsUpdateReviewId = ''

    beforeAll(async () => {
      const booking = await svc
        .from('bookings')
        .insert({
          experience_id: experienceId, availability_id: availabilityId, guide_id: guideId,
          traveler_user_id: travelerId, qty: 1, unit_amount: 100, total_amount: 100, currency: 'HKD',
          status: 'completed',
        })
        .select('id')
        .single()
      expect(booking.error).toBeNull()
      opsUpdateBookingId = booking.data!.id

      const review = await svc
        .from('reviews')
        .insert({
          booking_id: opsUpdateBookingId, traveler_user_id: travelerId, experience_id: experienceId, guide_id: guideId,
          rating: 3, body: 'Seeded for reviews_ops_update RLS coverage.',
        })
        .select('id')
        .single()
      expect(review.error).toBeNull()
      opsUpdateReviewId = review.data!.id
    }, hookTimeout)

    afterAll(async () => {
      if (opsUpdateReviewId) await svc.from('reviews').delete().eq('id', opsUpdateReviewId)
      if (opsUpdateBookingId) await svc.from('bookings').delete().eq('id', opsUpdateBookingId)
    }, hookTimeout)

    it("rejects an UPDATE from the review's own author (negative control: is_active_ops() is false for them)", async () => {
      const traveler = await authedClient(travelerEmail)
      const denied = await traveler.from('reviews').update({ status: 'hidden' }).eq('id', opsUpdateReviewId).select('id')
      // RLS's `using` clause filters the row out of the update's candidate set
      // rather than raising -- a denied update surfaces as zero affected rows,
      // not necessarily a thrown error (mirrors mission.rls.test.ts's pattern).
      expect(denied.error === null ? denied.data : []).toEqual([])

      const stillPublished = await svc.from('reviews').select('status').eq('id', opsUpdateReviewId).single()
      expect(stillPublished.error).toBeNull()
      expect(stillPublished.data!.status).toBe('published')
    }, testTimeout)

    it('rejects an UPDATE from an unrelated non-ops authenticated traveller', async () => {
      const other = await authedClient(otherTravelerEmail)
      const denied = await other.from('reviews').update({ status: 'hidden' }).eq('id', opsUpdateReviewId).select('id')
      expect(denied.error === null ? denied.data : []).toEqual([])

      const stillPublished = await svc.from('reviews').select('status').eq('id', opsUpdateReviewId).single()
      expect(stillPublished.error).toBeNull()
      expect(stillPublished.data!.status).toBe('published')
    }, testTimeout)

    it('allows an active ops member to hide the review (positive control)', async () => {
      const ops = await authedClient(opsEmail)
      const allowed = await ops.from('reviews').update({ status: 'hidden' }).eq('id', opsUpdateReviewId).select('id')
      expect(allowed.error).toBeNull()
      expect(allowed.data).toEqual([{ id: opsUpdateReviewId }])

      const updated = await svc.from('reviews').select('status').eq('id', opsUpdateReviewId).single()
      expect(updated.error).toBeNull()
      expect(updated.data!.status).toBe('hidden')
    }, testTimeout)
  })

  describe('save idempotency against the real unique constraints', () => {
    it('guide_saves: two real upserts with the app\'s onConflict+ignoreDuplicates shape never raise a duplicate-key error, and leave exactly one row', async () => {
      const traveler = await authedClient(travelerEmail)
      const first = await traveler.from('guide_saves').upsert({ guide_id: guideId, traveler_user_id: travelerId }, { onConflict: 'guide_id,traveler_user_id', ignoreDuplicates: true })
      expect(first.error).toBeNull()
      const second = await traveler.from('guide_saves').upsert({ guide_id: guideId, traveler_user_id: travelerId }, { onConflict: 'guide_id,traveler_user_id', ignoreDuplicates: true })
      expect(second.error).toBeNull()

      const rows = await svc.from('guide_saves').select('id').eq('guide_id', guideId).eq('traveler_user_id', travelerId)
      expect(rows.error).toBeNull()
      expect((rows.data ?? []).length).toBe(1)

      await svc.from('guide_saves').delete().eq('guide_id', guideId).eq('traveler_user_id', travelerId)
    }, testTimeout)

    it('experience_saves: two real upserts with the app\'s onConflict+ignoreDuplicates shape never raise a duplicate-key error, and leave exactly one row', async () => {
      const traveler = await authedClient(travelerEmail)
      const first = await traveler.from('experience_saves').upsert({ experience_id: experienceId, traveler_user_id: travelerId }, { onConflict: 'experience_id,traveler_user_id', ignoreDuplicates: true })
      expect(first.error).toBeNull()
      const second = await traveler.from('experience_saves').upsert({ experience_id: experienceId, traveler_user_id: travelerId }, { onConflict: 'experience_id,traveler_user_id', ignoreDuplicates: true })
      expect(second.error).toBeNull()

      const rows = await svc.from('experience_saves').select('id').eq('experience_id', experienceId).eq('traveler_user_id', travelerId)
      expect(rows.error).toBeNull()
      expect((rows.data ?? []).length).toBe(1)

      await svc.from('experience_saves').delete().eq('experience_id', experienceId).eq('traveler_user_id', travelerId)
    }, testTimeout)

    it('confirms the underlying constraint is real: a raw duplicate INSERT without onConflict is rejected 23505', async () => {
      const traveler = await authedClient(travelerEmail)
      const first = await traveler.from('guide_saves').insert({ guide_id: guideId, traveler_user_id: travelerId })
      expect(first.error).toBeNull()
      const duplicate = await traveler.from('guide_saves').insert({ guide_id: guideId, traveler_user_id: travelerId })
      expect(duplicate.error).not.toBeNull()
      expect(duplicate.error!.code).toBe('23505')

      await svc.from('guide_saves').delete().eq('guide_id', guideId).eq('traveler_user_id', travelerId)
    }, testTimeout)

    it('rejects a direct REST-API UPDATE of an existing save row (no UPDATE grant, and the count triggers are INSERT/DELETE-only, so this closes the saves_count inflation path)', async () => {
      const traveler = await authedClient(travelerEmail)
      const inserted = await traveler.from('guide_saves').insert({ guide_id: guideId, traveler_user_id: travelerId }).select('id').single()
      expect(inserted.error).toBeNull()

      const reassigned = await traveler.from('guide_saves').update({ guide_id: otherGuideId }).eq('id', inserted.data!.id)
      expect(reassigned.error).not.toBeNull()

      await svc.from('guide_saves').delete().eq('guide_id', guideId).eq('traveler_user_id', travelerId)
    }, testTimeout)

    it('rejects a direct REST-API UPDATE of an existing experience_saves row for the same reason', async () => {
      const traveler = await authedClient(travelerEmail)
      const inserted = await traveler.from('experience_saves').insert({ experience_id: experienceId, traveler_user_id: travelerId }).select('id').single()
      expect(inserted.error).toBeNull()

      const reassigned = await traveler.from('experience_saves').update({ experience_id: otherExperienceId }).eq('id', inserted.data!.id)
      expect(reassigned.error).not.toBeNull()

      await svc.from('experience_saves').delete().eq('experience_id', experienceId).eq('traveler_user_id', travelerId)
    }, testTimeout)
  })

  // The final review flagged that saves_count's count-sync triggers -- R6A's own
  // headline deliverable -- were only verified by string-matching the migration text.
  // This exercises the real triggers against a live Postgres instance.
  describe('saves_count triggers actually fire (not just present in the migration text)', () => {
    it('guide_saves: an insert increments guides.saves_count by 1, and a delete decrements it back', async () => {
      const before = await svc.from('guides').select('saves_count').eq('id', guideId).single()
      expect(before.error).toBeNull()
      const baseline = before.data!.saves_count as number

      const traveler = await authedClient(travelerEmail)
      const inserted = await traveler.from('guide_saves').insert({ guide_id: guideId, traveler_user_id: travelerId }).select('id').single()
      expect(inserted.error).toBeNull()

      const afterInsert = await svc.from('guides').select('saves_count').eq('id', guideId).single()
      expect(afterInsert.error).toBeNull()
      expect(afterInsert.data!.saves_count).toBe(baseline + 1)

      await svc.from('guide_saves').delete().eq('id', inserted.data!.id)

      const afterDelete = await svc.from('guides').select('saves_count').eq('id', guideId).single()
      expect(afterDelete.error).toBeNull()
      expect(afterDelete.data!.saves_count).toBe(baseline)
    }, testTimeout)

    it('experience_saves: an insert increments experiences.saves_count by 1, and a delete decrements it back', async () => {
      const before = await svc.from('experiences').select('saves_count').eq('id', experienceId).single()
      expect(before.error).toBeNull()
      const baseline = before.data!.saves_count as number

      const traveler = await authedClient(travelerEmail)
      const inserted = await traveler.from('experience_saves').insert({ experience_id: experienceId, traveler_user_id: travelerId }).select('id').single()
      expect(inserted.error).toBeNull()

      const afterInsert = await svc.from('experiences').select('saves_count').eq('id', experienceId).single()
      expect(afterInsert.error).toBeNull()
      expect(afterInsert.data!.saves_count).toBe(baseline + 1)

      await svc.from('experience_saves').delete().eq('id', inserted.data!.id)

      const afterDelete = await svc.from('experiences').select('saves_count').eq('id', experienceId).single()
      expect(afterDelete.error).toBeNull()
      expect(afterDelete.data!.saves_count).toBe(baseline)
    }, testTimeout)
  })

  // D-R6A-6: saves require sign-in, no anon path. revoke all ... from anon means anon
  // has zero grant at the table level (rejected before RLS even evaluates); confirm
  // this holds live rather than trusting only the migration text.
  describe('guide_saves/experience_saves reject anon access entirely (D-R6A-6)', () => {
    const anon = createClient(url, anonKey)

    it('anon cannot select guide_saves', async () => {
      const { error } = await anon.from('guide_saves').select('id').limit(1)
      expect(error).not.toBeNull()
    }, testTimeout)

    it('anon cannot insert into guide_saves', async () => {
      const { error } = await anon.from('guide_saves').insert({ guide_id: guideId, traveler_user_id: travelerId })
      expect(error).not.toBeNull()
    }, testTimeout)

    it('anon cannot select experience_saves', async () => {
      const { error } = await anon.from('experience_saves').select('id').limit(1)
      expect(error).not.toBeNull()
    }, testTimeout)

    it('anon cannot insert into experience_saves', async () => {
      const { error } = await anon.from('experience_saves').insert({ experience_id: experienceId, traveler_user_id: travelerId })
      expect(error).not.toBeNull()
    }, testTimeout)
  })

  // guide_saves_owner_all / experience_saves_owner_all pin traveler_user_id =
  // auth.uid() -- confirm the real policy actually isolates two real travellers from
  // each other, not just that the policy text exists.
  describe('guide_saves/experience_saves isolate savers from each other', () => {
    it("otherTraveler cannot see or delete travelerA's guide_saves row", async () => {
      const traveler = await authedClient(travelerEmail)
      const inserted = await traveler.from('guide_saves').insert({ guide_id: guideId, traveler_user_id: travelerId }).select('id').single()
      expect(inserted.error).toBeNull()

      const other = await authedClient(otherTravelerEmail)
      const seen = await other.from('guide_saves').select('id').eq('id', inserted.data!.id)
      expect(seen.error === null ? seen.data : []).toEqual([])

      const deleted = await other.from('guide_saves').delete().eq('id', inserted.data!.id).select('id')
      expect(deleted.error === null ? deleted.data : []).toEqual([])

      const stillThere = await svc.from('guide_saves').select('id').eq('id', inserted.data!.id).single()
      expect(stillThere.error).toBeNull()

      await svc.from('guide_saves').delete().eq('id', inserted.data!.id)
    }, testTimeout)

    it("otherTraveler cannot see or delete travelerA's experience_saves row", async () => {
      const traveler = await authedClient(travelerEmail)
      const inserted = await traveler.from('experience_saves').insert({ experience_id: experienceId, traveler_user_id: travelerId }).select('id').single()
      expect(inserted.error).toBeNull()

      const other = await authedClient(otherTravelerEmail)
      const seen = await other.from('experience_saves').select('id').eq('id', inserted.data!.id)
      expect(seen.error === null ? seen.data : []).toEqual([])

      const deleted = await other.from('experience_saves').delete().eq('id', inserted.data!.id).select('id')
      expect(deleted.error === null ? deleted.data : []).toEqual([])

      const stillThere = await svc.from('experience_saves').select('id').eq('id', inserted.data!.id).single()
      expect(stillThere.error).toBeNull()

      await svc.from('experience_saves').delete().eq('id', inserted.data!.id)
    }, testTimeout)
  })
})
