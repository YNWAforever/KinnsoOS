import { createHmac, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { resolveR73LocalLiveConfig } from './helpers/r7-3-local-live-config'

const liveConfig = resolveR73LocalLiveConfig(process.env)
const d = liveConfig ? describe : describe.skip
const hookTimeout = 60_000
const testTimeout = 15_000

// The value is deliberately a test-only dummy. It is provisioned only through
// the loopback-only test setup below and is never an application credential.
const localTestAttestationSecret = 'r7-7-local-live-test-only-not-a-production-secret'
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const password = 'Test1234!r77'
const creatorEmail = `r7-7-enquiry-creator-${runId}@example.test`
const merchantEmail = `r7-7-enquiry-merchant-${runId}@example.test`
const viewerEmail = `r7-7-enquiry-viewer-${runId}@example.test`
const opsEmail = `r7-7-enquiry-ops-${runId}@example.test`

const svc = liveConfig ? createClient(liveConfig.url, liveConfig.serviceRoleKey) : null
const trackedIps = Array.from({ length: 13 }, (_, index) => `203.0.113.${10 + index}`)
const attributedBookingIds: string[] = []
let attributedGuideId = ''
let attributedExperienceId = ''
let attributedAvailabilityId = ''

let creatorId = ''
let merchantUserId = ''
let merchantProfileId = ''
let viewerId = ''
let opsUserId = ''
let opsMemberId = ''
const enquiryIds: string[] = []
type EnquiryStatus = 'new' | 'in_progress' | 'resolved' | 'spam'

function ipHash(ip: string) {
  return createHmac('sha256', localTestAttestationSecret)
    .update(`r7.7:enquiry-rate-limit:v1\n${ip}`)
    .digest('hex')
}

function makeAttestation(ip: string) {
  const expiry = Math.floor(Date.now() / 1000) + 120
  const signature = createHmac('sha256', localTestAttestationSecret)
    .update(`${ip}\n${expiry}`)
    .digest('hex')
  return `v1.${expiry}.${signature}`
}

function attestedAnon(ip: string, attestation = makeAttestation(ip)) {
  if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
  return createClient(liveConfig.url, liveConfig.anonKey, {
    global: { headers: { 'x-kinnso-enquiry-attestation': attestation } },
  })
}

function creatorArgs(ip: string) {
  return {
    p_type: 'creator_collab',
    p_creator_id: creatorId,
    p_merchant_profile_id: null,
    p_name: 'R7.7 Visitor',
    p_email: `visitor-${runId}@example.test`,
    p_message: 'I would like to discuss a creator collaboration opportunity.',
    p_ip: ip,
    // These caller values must not weaken the fixed 5/3600 policy.
    p_max_requests: 100,
    p_window_seconds: 60,
  }
}

function merchantArgs(ip: string) {
  return {
    p_type: 'merchant_contact',
    p_creator_id: null,
    p_merchant_profile_id: merchantProfileId,
    p_name: 'R7.7 Visitor',
    p_email: `visitor-${runId}@example.test`,
    p_message: 'I would like to discuss a merchant partnership opportunity.',
    p_ip: ip,
    p_max_requests: 100,
    p_window_seconds: 60,
  }
}

async function authedClient(email: string) {
  if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
  const anon = createClient(liveConfig.url, liveConfig.anonKey)
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull()
  return createClient(liveConfig.url, liveConfig.anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })
}

async function runPsql(sql: string) {
  if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')

  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', [
      'exec',
      '-i',
      liveConfig.dbContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ])
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `psql exited with code ${code}`))
    })
    child.stdin.end(sql)
  })
}

function cleanupErrorText(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return String(error)
}

async function attemptCleanup(cleanupErrors: string[], label: string, cleanup: () => PromiseLike<unknown>) {
  try {
    const result = await cleanup()
    if (typeof result === 'object' && result !== null && 'error' in result && result.error) {
      cleanupErrors.push(`${label}: ${cleanupErrorText(result.error)}`)
    }
  } catch (error) {
    cleanupErrors.push(`${label}: ${cleanupErrorText(error)}`)
  }
}

d('R7.7 enquiry live security boundary (explicit local Postgres only)', () => {
  const localSvc = svc!

  async function seedEnquiry(status: EnquiryStatus = 'new') {
    const inserted = await localSvc
      .from('enquiries')
      .insert({
        type: 'creator_collab',
        creator_id: creatorId,
        merchant_profile_id: null,
        name: 'R7.7 Transition Fixture',
        email: `transition-${randomUUID()}@example.test`,
        message: 'This row exists only to verify the enquiry transition boundary.',
        status,
      })
      .select('id')
      .single()
    expect(inserted.error).toBeNull()
    const id = inserted.data!.id
    enquiryIds.push(id)
    return id
  }


  beforeAll(async () => {
    await runPsql(`
      delete from vault.secrets where name = 'r7_7_enquiry_submission_hmac';
      select vault.create_secret(
        '${localTestAttestationSecret}',
        'r7_7_enquiry_submission_hmac',
        'R7.7 local live security test dummy secret',
        null::uuid
      );
    `)

    const creator = await localSvc.auth.admin.createUser({ email: creatorEmail, password, email_confirm: true })
    expect(creator.error, `create creator failed: ${creator.error?.message}`).toBeNull()
    creatorId = creator.data.user!.id

    const merchant = await localSvc.auth.admin.createUser({ email: merchantEmail, password, email_confirm: true })
    expect(merchant.error, `create merchant failed: ${merchant.error?.message}`).toBeNull()
    merchantUserId = merchant.data.user!.id

    const viewer = await localSvc.auth.admin.createUser({ email: viewerEmail, password, email_confirm: true })
    expect(viewer.error, `create viewer failed: ${viewer.error?.message}`).toBeNull()
    viewerId = viewer.data.user!.id

    const ops = await localSvc.auth.admin.createUser({ email: opsEmail, password, email_confirm: true })
    expect(ops.error, `create ops failed: ${ops.error?.message}`).toBeNull()
    opsUserId = ops.data.user!.id

    const creatorProfile = await localSvc
      .from('creators')
      .update({
        display_name: 'R7.7 Eligible Creator',
        status: 'active',
        handle: `r77-creator-${runId}`,
        public_profile: { platforms: [] },
      })
      .eq('id', creatorId)
    expect(creatorProfile.error).toBeNull()

    const merchantProfile = await localSvc
      .from('merchant_profiles')
      .insert({
        user_id: merchantUserId,
        company_name: `R7.7 Eligible Merchant ${runId}`,
        contact_email: merchantEmail,
        status: 'active',
        slug: `r77-merchant-${runId}`,
      })
      .select('id')
      .single()
    expect(merchantProfile.error).toBeNull()
    merchantProfileId = merchantProfile.data!.id

    const opsMember = await localSvc
      .from('kinnso_ops_members')
      .insert({ user_id: opsUserId, display_name: 'R7.7 Enquiry Ops', status: 'active' })
      .select('id')
      .single()
    expect(opsMember.error).toBeNull()
    opsMemberId = opsMember.data!.id
  }, hookTimeout)

  afterAll(async () => {
    const cleanupErrors: string[] = []
    const clean = (label: string, cleanup: () => PromiseLike<unknown>) => attemptCleanup(cleanupErrors, label, cleanup)

    // Keep FK-sensitive dependencies in order, but record a failure and keep
    // attempting every later cleanup stage, including Vault and auth users.
    if (attributedBookingIds.length > 0) {
      await clean('attributed bookings', () => localSvc.from('bookings').delete().in('id', attributedBookingIds))
    }
    if (attributedAvailabilityId) {
      await clean('attributed availability', () => localSvc.from('experience_availability').delete().eq('id', attributedAvailabilityId))
    }
    if (attributedExperienceId) await clean('attributed experience', () => localSvc.from('experiences').delete().eq('id', attributedExperienceId))
    if (attributedGuideId) await clean('attributed guide', () => localSvc.from('guides').delete().eq('id', attributedGuideId))
    if (enquiryIds.length > 0) {
      await clean('enquiry audit rows', () =>
        localSvc.from('ops_audit_log').delete().eq('entity_type', 'enquiry').in('entity_id', enquiryIds),
      )
      await clean('enquiries', () => localSvc.from('enquiries').delete().in('id', enquiryIds))
    }
    await clean('enquiry rate buckets', () => localSvc.from('enquiry_rate_limits').delete().in('ip_hash', trackedIps.map(ipHash)))
    if (merchantProfileId) await clean('merchant profile', () => localSvc.from('merchant_profiles').delete().eq('id', merchantProfileId))
    if (opsMemberId) await clean('ops member', () => localSvc.from('kinnso_ops_members').delete().eq('id', opsMemberId))
    for (const userId of [creatorId, merchantUserId, viewerId, opsUserId]) {
      if (userId) await clean(`auth user ${userId}`, () => localSvc.auth.admin.deleteUser(userId))
    }
    await clean('Vault attestation secret', () =>
      runPsql("delete from vault.secrets where name = 'r7_7_enquiry_submission_hmac';"),
    )

    if (cleanupErrors.length > 0) {
      throw new Error(`R7.7 local enquiry cleanup failed: ${cleanupErrors.join(' | ')}`)
    }
  }, hookTimeout)

  it('denies direct anonymous and authenticated inserts', async () => {
    if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
    const anon = createClient(liveConfig.url, liveConfig.anonKey)
    const authed = await authedClient(viewerEmail)
    const validCreatorRow = {
      type: 'creator_collab',
      creator_id: creatorId,
      merchant_profile_id: null,
      name: 'Direct Write Visitor',
      email: `direct-${runId}@example.test`,
      message: 'This direct insertion must be denied by the database boundary.',
    }

    expect((await anon.from('enquiries').insert(validCreatorRow)).error).not.toBeNull()
    expect((await authed.from('enquiries').insert(validCreatorRow)).error).not.toBeNull()
  }, testTimeout)

  it('rejects missing or invalid attestations before rate-bucket consumption', async () => {
    if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
    const ip = '203.0.113.13'
    const missing = createClient(liveConfig.url, liveConfig.anonKey)
    const missingResult = await missing.rpc('submit_enquiry', creatorArgs(ip))
    expect(missingResult.error?.message).toContain('invalid_enquiry_attestation')

    const invalidResult = await attestedAnon(ip, 'v1.9999999999.' + '0'.repeat(64)).rpc('submit_enquiry', creatorArgs(ip))
    expect(invalidResult.error?.message).toContain('invalid_enquiry_attestation')

    const bucket = await localSvc.from('enquiry_rate_limits').select('request_count').eq('ip_hash', ipHash(ip))
    expect(bucket.error).toBeNull()
    expect(bucket.data).toEqual([])
  }, testTimeout)

  it('submits both eligible target types through the attested public RPC', async () => {
    const creator = await attestedAnon('203.0.113.10').rpc('submit_enquiry', creatorArgs('203.0.113.10'))
    expect(creator.error).toBeNull()
    expect(creator.data).toBeTruthy()
    enquiryIds.push(creator.data!)

    const merchant = await attestedAnon('203.0.113.11').rpc('submit_enquiry', merchantArgs('203.0.113.11'))
    expect(merchant.error).toBeNull()
    expect(merchant.data).toBeTruthy()
    enquiryIds.push(merchant.data!)
  }, testTimeout)

  it('uses the fixed 5-per-hour policy despite caller-supplied 100-per-minute values', async () => {
    const ip = '203.0.113.12'
    for (let index = 0; index < 5; index += 1) {
      const result = await attestedAnon(ip).rpc('submit_enquiry', creatorArgs(ip))
      expect(result.error).toBeNull()
      enquiryIds.push(result.data!)
    }

    const bucket = await localSvc
      .from('enquiry_rate_limits')
      .select('request_count, window_start')
      .eq('ip_hash', ipHash(ip))
      .single()
    expect(bucket.error).toBeNull()
    expect(bucket.data).toMatchObject({ request_count: 5 })
    expect(Math.floor(new Date(bucket.data!.window_start).getTime() / 1000) % 3600).toBe(0)

    const sixth = await attestedAnon(ip).rpc('submit_enquiry', creatorArgs(ip))
    expect(sixth.error?.message).toContain('enquiry_rate_limited')
  }, testTimeout)

  it('keeps public queue access unavailable and exposes only the documented ops queue fields', async () => {
    if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
    const anon = createClient(liveConfig.url, liveConfig.anonKey)
    const publicList = await anon.rpc('admin_list_enquiries')
    expect(publicList.error).not.toBeNull()

    const viewer = await authedClient(viewerEmail)
    expect((await viewer.rpc('admin_list_enquiries')).error?.message).toContain('forbidden')

    const ops = await authedClient(opsEmail)
    const opsList = await ops.rpc('admin_list_enquiries', { p_status_group: 'active', p_limit: 100 })
    expect(opsList.error).toBeNull()
    const row = (opsList.data as Record<string, unknown>[]).find((item) => item.id === enquiryIds[0])
    expect(row).toBeTruthy()
    expect(Object.keys(row!).sort()).toEqual(
      ['created_at', 'email', 'id', 'message', 'name', 'status', 'target_id', 'target_name', 'target_slug', 'type', 'updated_at'].sort(),
    )
    expect(row).not.toHaveProperty('booking_id')
    expect(row).not.toHaveProperty('traveler_user_id')
    expect(row).not.toHaveProperty('guest_email')
    expect(row).not.toHaveProperty('payment_intent_id')
  }, testTimeout)

  it('requires active ops for transitions and writes a bounded audit row', async () => {
    const viewer = await authedClient(viewerEmail)
    expect(
      (await viewer.rpc('admin_set_enquiry_status', { p_id: enquiryIds[0], p_status: 'resolved', p_reason: 'No access' })).error?.message,
    ).toContain('forbidden')

    const ops = await authedClient(opsEmail)
    const transitioned = await ops.rpc('admin_set_enquiry_status', {
      p_id: enquiryIds[0],
      p_status: 'resolved',
      p_reason: 'Handled in local security test',
    })
    expect(transitioned.error).toBeNull()

    const audit = await localSvc
      .from('ops_audit_log')
      .select('entity_type, entity_id, action, metadata')
      .eq('entity_type', 'enquiry')
      .eq('entity_id', enquiryIds[0])
      .single()
    expect(audit.error).toBeNull()
    expect(audit.data).toMatchObject({
      entity_type: 'enquiry',
      entity_id: enquiryIds[0],
      action: 'status.resolved',
      metadata: { from: 'new', to: 'resolved' },
    })
  }, testTimeout)

  it('enforces creator avatar URLs and enquiry target/type constraints', async () => {
    const invalidAvatar = await localSvc.from('creators').update({ avatar_url: 'ftp://example.test/avatar.jpg' }).eq('id', creatorId)
    expect(invalidAvatar.error).not.toBeNull()

    const validAvatar = await localSvc.from('creators').update({ avatar_url: 'https://example.test/avatar.jpg' }).eq('id', creatorId)
    expect(validAvatar.error).toBeNull()
    expect((await localSvc.from('creators').update({ avatar_url: null }).eq('id', creatorId)).error).toBeNull()

    const invalidTarget = await localSvc.from('enquiries').insert({
      type: 'creator_collab',
      creator_id: creatorId,
      merchant_profile_id: merchantProfileId,
      name: 'Invalid Target Fixture',
      email: `invalid-target-${runId}@example.test`,
      message: 'This row must be rejected by the target and type constraint.',
    })
    expect(invalidTarget.error?.message).toContain('enquiries_target_matches_type')
  }, testTimeout)

  it('charges ineligible targets and preserves the fixed quota atomically under concurrency', async () => {
    const ineligibleIp = '203.0.113.14'
    const ineligibleArgs = { ...creatorArgs(ineligibleIp), p_creator_id: randomUUID() }
    for (let index = 0; index < 5; index += 1) {
      const result = await attestedAnon(ineligibleIp).rpc('submit_enquiry', ineligibleArgs)
      expect(result.error).toBeNull()
      expect(result.data).toBeNull()
    }
    const rejectedSixth = await attestedAnon(ineligibleIp).rpc('submit_enquiry', ineligibleArgs)
    expect(rejectedSixth.error?.message).toContain('enquiry_rate_limited')

    const ineligibleBucket = await localSvc
      .from('enquiry_rate_limits')
      .select('request_count')
      .eq('ip_hash', ipHash(ineligibleIp))
      .single()
    expect(ineligibleBucket.error).toBeNull()
    expect(ineligibleBucket.data).toMatchObject({ request_count: 5 })

    const ineligibleMerchantIp = '203.0.113.16'
    const ineligibleMerchantArgs = {
      ...merchantArgs(ineligibleMerchantIp),
      p_merchant_profile_id: randomUUID(),
    }
    for (let index = 0; index < 5; index += 1) {
      const result = await attestedAnon(ineligibleMerchantIp).rpc('submit_enquiry', ineligibleMerchantArgs)
      expect(result.error).toBeNull()
      expect(result.data).toBeNull()
    }
    const rejectedMerchantSixth = await attestedAnon(ineligibleMerchantIp).rpc('submit_enquiry', ineligibleMerchantArgs)
    expect(rejectedMerchantSixth.error?.message).toContain('enquiry_rate_limited')
    const ineligibleMerchantBucket = await localSvc
      .from('enquiry_rate_limits')
      .select('request_count')
      .eq('ip_hash', ipHash(ineligibleMerchantIp))
      .single()
    expect(ineligibleMerchantBucket.error).toBeNull()
    expect(ineligibleMerchantBucket.data).toMatchObject({ request_count: 5 })

    const concurrentIp = '203.0.113.15'
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => attestedAnon(concurrentIp).rpc('submit_enquiry', creatorArgs(concurrentIp))),
    )
    const successes = attempts.filter((result) => result.error === null && result.data)
    const limited = attempts.filter((result) => result.error?.message.includes('enquiry_rate_limited'))
    expect(successes).toHaveLength(5)
    expect(limited).toHaveLength(5)
    enquiryIds.push(...successes.map((result) => result.data!))

    const concurrentBucket = await localSvc
      .from('enquiry_rate_limits')
      .select('request_count')
      .eq('ip_hash', ipHash(concurrentIp))
      .single()
    expect(concurrentBucket.error).toBeNull()
    expect(concurrentBucket.data).toMatchObject({ request_count: 5 })
  }, testTimeout)

  it('returns deduplicated attributed guides without booking or traveler data', async () => {
    const guide = await localSvc
      .from('guides')
      .insert({
        creator_id: creatorId,
        creator_handle: `r77-creator-${runId}`,
        creator_name: 'R7.7 Eligible Creator',
        slug: `r77-attributed-guide-${runId}`,
        title: 'R7.7 Attributed Guide',
        summary: 'A published guide used only to verify safe merchant attribution.',
        cover_url: 'https://example.test/r77-guide.jpg',
        city: 'Hong Kong',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(guide.error).toBeNull()
    attributedGuideId = guide.data!.id

    const experience = await localSvc
      .from('experiences')
      .insert({
        merchant_profile_id: merchantProfileId,
        slug: `r77-attributed-experience-${runId}`,
        title: 'R7.7 Attributed Experience',
        city: 'Hong Kong',
        price_amount: 100,
        currency: 'HKD',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(experience.error).toBeNull()
    attributedExperienceId = experience.data!.id

    const availability = await localSvc
      .from('experience_availability')
      .insert({ experience_id: attributedExperienceId, date: '2027-08-01', capacity: 10 })
      .select('id')
      .single()
    expect(availability.error).toBeNull()
    attributedAvailabilityId = availability.data!.id

    const bookingBase = {
      experience_id: attributedExperienceId,
      availability_id: attributedAvailabilityId,
      traveler_user_id: viewerId,
      creator_id: creatorId,
      guide_id: attributedGuideId,
      source_surface: 'guide',
      qty: 1,
      unit_amount: 100,
      total_amount: 100,
      currency: 'HKD',
    }
    const bookings = await localSvc
      .from('bookings')
      .insert([
        { ...bookingBase, status: 'confirmed' },
        { ...bookingBase, status: 'completed' },
      ])
      .select('id')
    expect(bookings.error).toBeNull()
    attributedBookingIds.push(...(bookings.data ?? []).map((booking) => booking.id))

    if (!liveConfig) throw new Error('R7.7 local live-test config is not enabled')
    const anon = createClient(liveConfig.url, liveConfig.anonKey)
    const result = await anon.rpc('get_attributed_guides_for_merchant', {
      p_merchant_id: merchantProfileId,
      p_limit: 9,
    })
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data![0]).toMatchObject({ slug: `r77-attributed-guide-${runId}` })
    expect(Object.keys(result.data![0]).sort()).toEqual(
      ['slug', 'title', 'cover_url', 'city', 'saves_count', 'creator_handle'].sort(),
    )
  }, testTimeout)

  it('enforces the complete enquiry transition and reason matrix', async () => {
    const ops = await authedClient(opsEmail)
    const allowed: Array<[EnquiryStatus, EnquiryStatus]> = [
      ['new', 'in_progress'],
      ['new', 'resolved'],
      ['new', 'spam'],
      ['in_progress', 'resolved'],
      ['in_progress', 'spam'],
      ['resolved', 'in_progress'],
      ['spam', 'in_progress'],
    ]
    for (const [from, to] of allowed) {
      const id = await seedEnquiry(from)
      const needsReason = from === 'resolved' || from === 'spam' || to === 'resolved' || to === 'spam'
      const result = await ops.rpc('admin_set_enquiry_status', {
        p_id: id,
        p_status: to,
        p_reason: needsReason ? `${from} to ${to} live-matrix verification` : null,
      })
      expect(result.error, `${from} -> ${to}: ${result.error?.message}`).toBeNull()
    }

    const forbidden: Array<[EnquiryStatus, EnquiryStatus, string]> = [
      ['new', 'new', 'enquiry_status_no_change'],
      ['in_progress', 'new', 'invalid_enquiry_transition'],
      ['in_progress', 'in_progress', 'enquiry_status_no_change'],
      ['resolved', 'new', 'invalid_enquiry_transition'],
      ['resolved', 'resolved', 'enquiry_status_no_change'],
      ['resolved', 'spam', 'invalid_enquiry_transition'],
      ['spam', 'new', 'invalid_enquiry_transition'],
      ['spam', 'resolved', 'invalid_enquiry_transition'],
      ['spam', 'spam', 'enquiry_status_no_change'],
    ]
    for (const [from, to, errorMessage] of forbidden) {
      const id = await seedEnquiry(from)
      const result = await ops.rpc('admin_set_enquiry_status', {
        p_id: id,
        p_status: to,
        p_reason: 'Forbidden transition matrix verification',
      })
      expect(result.error?.message, `${from} -> ${to}`).toContain(errorMessage)
    }

    const reasonRequired: Array<[EnquiryStatus, EnquiryStatus]> = [
      ['new', 'resolved'],
      ['new', 'spam'],
      ['in_progress', 'resolved'],
      ['in_progress', 'spam'],
      ['resolved', 'in_progress'],
      ['spam', 'in_progress'],
    ]
    for (const [from, to] of reasonRequired) {
      const id = await seedEnquiry(from)
      const result = await ops.rpc('admin_set_enquiry_status', { p_id: id, p_status: to, p_reason: '   ' })
      expect(result.error?.message, `${from} -> ${to} without reason`).toContain('enquiry_reason_required')
    }
  }, testTimeout)
})
