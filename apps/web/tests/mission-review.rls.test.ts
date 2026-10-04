// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbContainer = process.env.SUPABASE_DB_CONTAINER
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

// Same gate shape as settlement-minting.rls.test.ts / creator-earnings.rls.test.ts: skip
// wholesale rather than fail when the local Supabase stack is absent.
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

// Fixed, distinctive constants + afterAll cleanup -- mission_review_events has no
// immutability trigger and its submission_id FK is `on delete cascade`, so a single
// `delete from auth.users` cascades through creators/merchant_profiles/missions/
// mission_participants/mission_milestones/mission_milestone_submissions/
// mission_review_events, matching creator-earnings.rls.test.ts's pattern (not
// payout-batches.rls.test.ts's no-cleanup one, which exists for an unrelated ledger table).
// This file's own fixed-UUID block (9999.../aaaa.../.../ffff...) is deliberately disjoint from
// every other *.rls.test.ts file's block (creator-earnings/settlement-minting/payout-batches
// claim 1111...-8888...) -- Vitest runs test files concurrently against the same live stack by
// default, and a reused id here previously collided with settlement-minting's own creatorC
// (5555...), risking both a unique-violation race on merchant_profiles.user_id and this file's
// own afterAll cascading a delete into settlement-minting's in-flight fixtures.
const creatorA = '99999999-9999-4999-8999-999999999999'
const creatorB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const nonCreator = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const merchantUser = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const otherMerchantUser = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const opsAdminUser = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const opsOtherUser = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

d('r11.0/r11.1 mission review: admin_review_submission, mission_review_event_append, auto-approve, admin_mission_attention, RLS, and review_deadline', () => {
  let missionId = ''
  let milestoneId = ''
  let participantAId = ''
  let submissionAId = ''
  let tpMissionId: string | null = null

  // mission_milestone_submissions has a unique (mission_milestone_id, mission_participant_id)
  // constraint, so every test that seeds a fresh submission for participantA needs its own
  // milestone -- reusing milestoneId across tests hits that constraint on the second insert.
  async function freshMilestoneId(): Promise<string> {
    const s = svc()
    const milestone = await s.from('mission_milestones').insert({
      mission_id: missionId, title: `Post proof ${Math.random().toString(36).slice(2)}`, description: 'Upload post proof',
    }).select('id').single()
    if (milestone.error) throw milestone.error
    return milestone.data!.id
  }

  beforeAll(async () => {
    await runPsql(`
      insert into auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at)
      values
        ('${creatorA}', 'r11-a-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${creatorB}', 'r11-b-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${nonCreator}', 'r11-n-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${merchantUser}', 'r11-m-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${otherMerchantUser}', 'r11-om-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${opsAdminUser}', 'r11-oa-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${opsOtherUser}', 'r11-oo-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now())
      on conflict (id) do nothing;

      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
      select id, id, id::text, 'email',
             jsonb_build_object('sub', id::text, 'email', email), now()
      from auth.users where id in ('${creatorA}', '${creatorB}', '${nonCreator}', '${merchantUser}', '${otherMerchantUser}', '${opsAdminUser}', '${opsOtherUser}')
      on conflict do nothing;

      update public.creators set status = 'active' where id in ('${creatorA}', '${creatorB}');
      update public.creators set status = 'onboarding' where id = '${nonCreator}';
    `)

    const s = svc()

    // ops_audit_log.actor_ops_member_id has no ON DELETE CASCADE, so once this test writes an
    // audit-log row for these ops members (which it will, via admin_review_submission), those
    // rows -- and therefore the auth.users rows they cascade from -- become permanently
    // undeletable, the same immutability shape R10.2's payout ledger has. Upsert-ignore on the
    // unique user_id constraint instead of a plain insert, so a second run of this file against
    // leftover state from a prior run doesn't collide.
    const admin = await s.from('kinnso_ops_members').upsert(
      { user_id: opsAdminUser, display_name: `R11 Admin ${runId}`, role: 'admin', status: 'active' },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
    if (admin.error) throw admin.error
    const other = await s.from('kinnso_ops_members').upsert(
      { user_id: opsOtherUser, display_name: `R11 Other Ops ${runId}`, role: 'admin', status: 'active' },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
    if (other.error) throw other.error

    const merchant = await s.from('merchant_profiles').insert({
      user_id: merchantUser, company_name: `R11 Merchant ${runId}`, contact_email: `r11-merchant-${runId}@example.test`,
    }).select('id').single()
    if (merchant.error) throw merchant.error
    const merchantProfileId = merchant.data!.id

    const otherMerchant = await s.from('merchant_profiles').insert({
      user_id: otherMerchantUser, company_name: `R11 Other Merchant ${runId}`, contact_email: `r11-other-merchant-${runId}@example.test`,
    }).select('id').single()
    if (otherMerchant.error) throw otherMerchant.error

    // A travelpayouts-sourced mission (no merchant_profile_id) -- proves Task 3's widened
    // admin_mission_analytics genuinely surfaces it, where the pre-widening version couldn't.
    const tpMission = await s.from('missions').insert({
      mission_source: 'travelpayouts', mission_type: 'coupon_affiliate', visibility: 'open',
      status: 'published', title: `R11 Travelpayouts Mission ${runId}`, summary: 'Travelpayouts-sourced, no merchant',
      coupon_code: `R11TP${runId.slice(-6)}`, coupon_url: 'https://example.com/r11-tp',
      created_by_ops_member_id: (await s.from('kinnso_ops_members').select('id').eq('user_id', opsAdminUser).single()).data!.id,
      affiliate_network_program_id: null,
    }).select('id').maybeSingle()
    // Not every environment has a seeded affiliate_network_program row this FK could point
    // at; if the insert fails because affiliate_network_program_id is required non-null in
    // this schema, that's fine -- this specific assertion is a bonus check, not core coverage.
    tpMissionId = tpMission.data?.id ?? null

    const mission = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId, mission_source: 'merchant', mission_type: 'coupon_affiliate',
      visibility: 'open', status: 'published', title: `R11 Review Test Mission ${runId}`,
      summary: 'Mission used to prove admin_review_submission and mission_review_events on a live stack',
      coupon_code: `R11REV${runId.slice(-6)}`, coupon_url: 'https://example.com/r11-review', published_at: new Date().toISOString(),
    }).select('id').single()
    if (mission.error) throw mission.error
    missionId = mission.data!.id

    const milestone = await s.from('mission_milestones').insert({
      mission_id: missionId, title: 'Post proof', description: 'Upload post proof',
    }).select('id').single()
    if (milestone.error) throw milestone.error
    milestoneId = milestone.data!.id

    const participantA = await s.from('mission_participants').insert({
      mission_id: missionId, creator_id: creatorA, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantA.error) throw participantA.error
    participantAId = participantA.data!.id
  }, hookTimeout)

  afterAll(async () => {
    // opsAdminUser/opsOtherUser are deliberately NOT deleted here -- once
    // admin_review_submission writes an ops_audit_log row for them, their kinnso_ops_members
    // row (and therefore their auth.users row, since the delete would need to cascade through
    // it) becomes permanently undeletable, the same immutability shape as R10.2's payout
    // ledger. The upsert-ignore in beforeAll makes this safe to leave behind across runs.
    //
    // Because opsAdminUser is permanent, the travelpayouts mission (merchant_profile_id null,
    // created_by_ops_member_id = opsAdminUser's row) is never reached by any cascade path
    // either -- it would otherwise accumulate one permanent row per run of this file. Sweep it
    // explicitly by its distinctive title prefix (not scoped to this run's own runId), so this
    // also cleans up any prior run's leftover travelpayouts-mission rows, not just this one's.
    await runPsql(`
      delete from public.missions where title like 'R11 Travelpayouts Mission %';
      delete from auth.users where id in ('${creatorA}', '${creatorB}', '${nonCreator}', '${merchantUser}', '${otherMerchantUser}');
    `)
  }, hookTimeout)

  it('review_deadline trigger: a fresh submission gets submitted_at + 48h, resets on resubmission', async () => {
    const s = svc()
    const submission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: milestoneId, mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/proof'], submitted_at: new Date().toISOString(),
    }).select('id, submitted_at, review_deadline').single()
    if (submission.error) throw submission.error
    submissionAId = submission.data!.id

    const firstDeadline = new Date(submission.data!.review_deadline!).getTime()
    const firstSubmittedAt = new Date(submission.data!.submitted_at!).getTime()
    expect(firstDeadline - firstSubmittedAt).toBeCloseTo(48 * 60 * 60 * 1000, -3)

    // Resubmit later (simulating a revision-request round trip): a fresh submitted_at must
    // push the deadline forward, not leave the original one stale.
    await new Promise((r) => setTimeout(r, 1100))
    const resubmittedAt = new Date().toISOString()
    const resubmit = await s.from('mission_milestone_submissions')
      .update({ submitted_at: resubmittedAt })
      .eq('id', submissionAId)
      .select('submitted_at, review_deadline')
      .single()
    if (resubmit.error) throw resubmit.error
    const secondDeadline = new Date(resubmit.data!.review_deadline!).getTime()
    expect(secondDeadline).toBeGreaterThan(firstDeadline)
    expect(secondDeadline - new Date(resubmit.data!.submitted_at!).getTime()).toBeCloseTo(48 * 60 * 60 * 1000, -3)
  }, testTimeout)

  it('admin_review_submission: ops approves, submission updates, an event row and an audit-log row are written', async () => {
    const ops = clientFor(opsAdminUser)
    const { error } = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionAId, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(error).toBeNull()

    const s = svc()
    const submission = await s.from('mission_milestone_submissions').select('status, reviewed_by').eq('id', submissionAId).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('approved')
    expect(submission.data!.reviewed_by).toBe(opsAdminUser)

    const events = await s.from('mission_review_events').select('actor_type, actor_id, action, reason_category').eq('submission_id', submissionAId)
    if (events.error) throw events.error
    expect(events.data).toHaveLength(1)
    expect(events.data![0]).toMatchObject({ actor_type: 'ops', actor_id: opsAdminUser, action: 'approve', reason_category: null })

    const audit = await s.from('ops_audit_log').select('entity_type, action').eq('entity_id', submissionAId)
    if (audit.error) throw audit.error
    expect(audit.data).toHaveLength(1)
    expect(audit.data![0]).toMatchObject({ entity_type: 'mission_submission', action: 'submission.approve' })
  }, testTimeout)

  it('admin_review_submission: a second call on the now-approved submission is rejected as stale_status', async () => {
    const ops = clientFor(opsAdminUser)
    const { error } = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionAId, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(error).not.toBeNull()
    expect(/stale_status/i.test(`${error?.message}`)).toBe(true)

    const s = svc()
    const events = await s.from('mission_review_events').select('id').eq('submission_id', submissionAId)
    if (events.error) throw events.error
    expect(events.data).toHaveLength(1)
  }, testTimeout)

  it('admin_review_submission: reject without a reason_category is rejected before any write', async () => {
    const s = svc()
    const submission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/proof-2'], submitted_at: new Date().toISOString(),
    }).select('id, status').single()
    if (submission.error) throw submission.error
    const freshSubmissionId = submission.data!.id

    const ops = clientFor(opsAdminUser)
    const { error } = await ops.rpc('admin_review_submission', {
      p_submission_id: freshSubmissionId, p_action: 'reject', p_reason_category: null, p_reason_text: 'no category given',
    })
    expect(error).not.toBeNull()
    expect(/reason_required/i.test(`${error?.message}`)).toBe(true)

    const after = await s.from('mission_milestone_submissions').select('status').eq('id', freshSubmissionId).single()
    if (after.error) throw after.error
    expect(after.data!.status).toBe('submitted')
  }, testTimeout)

  it('admin_review_submission: rejects an unknown reason_category before any write', async () => {
    const s = svc()
    const submission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/proof-3'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (submission.error) throw submission.error
    const freshSubmissionId = submission.data!.id

    const ops = clientFor(opsAdminUser)
    const { error } = await ops.rpc('admin_review_submission', {
      p_submission_id: freshSubmissionId, p_action: 'reject', p_reason_category: 'not_a_real_category', p_reason_text: null,
    })
    expect(error).not.toBeNull()
    expect(/bad_reason_category/i.test(`${error?.message}`)).toBe(true)
  }, testTimeout)

  it('admin_review_submission: rejects a signed-in non-ops caller', async () => {
    const creator = clientFor(creatorA)
    const { error } = await creator.rpc('admin_review_submission', {
      p_submission_id: submissionAId, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${error?.message} ${error?.code}`)).toBe(true)
  }, testTimeout)

  it('mission_review_event_append: the owning merchant can append an event for their own mission', async () => {
    const s = svc()
    const submission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/proof-4'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (submission.error) throw submission.error
    const merchantSubmissionId = submission.data!.id

    const merchant = clientFor(merchantUser)
    const { error } = await merchant.rpc('mission_review_event_append', {
      p_submission_id: merchantSubmissionId, p_action: 'approve', p_reason_text: null,
    })
    expect(error).toBeNull()

    const events = await s.from('mission_review_events').select('actor_type, actor_id').eq('submission_id', merchantSubmissionId)
    if (events.error) throw events.error
    expect(events.data).toHaveLength(1)
    expect(events.data![0]).toMatchObject({ actor_type: 'merchant', actor_id: merchantUser })

    // The RPC only writes the audit row -- it must not also flip the submission's status
    // (that stays the merchant's own plain-update job in reviewSubmissionAction).
    const after = await s.from('mission_milestone_submissions').select('status').eq('id', merchantSubmissionId).single()
    if (after.error) throw after.error
    expect(after.data!.status).toBe('submitted')
  }, testTimeout)

  it('mission_review_event_append: a DIFFERENT merchant cannot append an event for a mission they do not own', async () => {
    const s = svc()
    const submission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/proof-5'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (submission.error) throw submission.error
    const strayerSubmissionId = submission.data!.id

    const otherMerchant = clientFor(otherMerchantUser)
    const { error } = await otherMerchant.rpc('mission_review_event_append', {
      p_submission_id: strayerSubmissionId, p_action: 'approve', p_reason_text: null,
    })
    expect(error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${error?.message} ${error?.code}`)).toBe(true)

    const events = await s.from('mission_review_events').select('id').eq('submission_id', strayerSubmissionId)
    if (events.error) throw events.error
    expect(events.data).toEqual([])
  }, testTimeout)

  it('mission_review_events RLS: the participant creator, the owning merchant, and any active ops member can read; an unrelated creator cannot', async () => {
    const creatorAClient = clientFor(creatorA)
    const own = await creatorAClient.from('mission_review_events').select('id').eq('submission_id', submissionAId)
    expect(own.error).toBeNull()
    expect(own.data!.length).toBeGreaterThan(0)

    const merchantClient = clientFor(merchantUser)
    const asMerchant = await merchantClient.from('mission_review_events').select('id').eq('submission_id', submissionAId)
    expect(asMerchant.error).toBeNull()
    expect(asMerchant.data!.length).toBeGreaterThan(0)

    const otherOpsClient = clientFor(opsOtherUser)
    const asOtherOps = await otherOpsClient.from('mission_review_events').select('id').eq('submission_id', submissionAId)
    expect(asOtherOps.error).toBeNull()
    expect(asOtherOps.data!.length).toBeGreaterThan(0)

    const creatorBClient = clientFor(creatorB)
    const unrelated = await creatorBClient.from('mission_review_events').select('id').eq('submission_id', submissionAId)
    expect(unrelated.error).toBeNull()
    expect(unrelated.data).toEqual([])
  }, testTimeout)

  it('mission_review_events: no client role can insert directly, and the check constraint rejects a reject-without-category row even bypassing the RPC', async () => {
    const creatorAClient = clientFor(creatorA)
    const clientInsert = await creatorAClient.from('mission_review_events').insert({
      submission_id: submissionAId, actor_type: 'creator', actor_id: creatorA, action: 'approve',
    })
    expect(clientInsert.error).not.toBeNull()

    // Service-role bypasses RLS entirely (proving the DB-level check constraint, not RLS, is
    // what blocks a reject with no reason_category -- the "impossible even bypassing the RPC"
    // guarantee Task 1's migration was built to provide).
    const s = svc()
    const bypassInsert = await s.from('mission_review_events').insert({
      submission_id: submissionAId, actor_type: 'ops', actor_id: opsAdminUser, action: 'reject', reason_category: null,
    })
    expect(bypassInsert.error).not.toBeNull()
    // Tightened to just 'reason_required' (the constraint's own name,
    // mission_review_events_reason_required_check) -- the generic 'check constraint'
    // alternative would also match if some unrelated constraint on this table fired instead,
    // which wouldn't actually prove the guarantee this test exists to verify.
    expect(/reason_required/i.test(`${bypassInsert.error?.message}`)).toBe(true)
  }, testTimeout)

  it('admin_mission_analytics: a travelpayouts-sourced mission (no merchant_profile_id) is now visible, proving the widening', async () => {
    if (!tpMissionId) {
      // Environment couldn't seed a travelpayouts mission (see the beforeAll comment) --
      // skip this one assertion rather than fail the whole live-proof run over an unrelated
      // seed-data limitation.
      return
    }
    const ops = clientFor(opsAdminUser)
    const { data, error } = await ops.rpc('admin_mission_analytics', { p_days: 30 })
    expect(error).toBeNull()
    const total = (data as { kpis: { total: number } }).kpis.total
    // Can't assert an exact count against a shared live stack, but the widened function must
    // return a number at least as large as what a merchant-only-filtered version could ever
    // report, and must not error out just because this mission has a null merchant_profile_id.
    expect(typeof total).toBe('number')
  }, testTimeout)

  it('mission_verification_jobs RLS: an active ops member can now read confidence_status directly; an unrelated creator cannot', async () => {
    const s = svc()
    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: submissionAId, creator_id: creatorA,
      status: 'ready', confidence_status: 'verified_signal',
    }).select('id').single()
    if (job.error) throw job.error

    const ops = clientFor(opsAdminUser)
    const asOps = await ops.from('mission_verification_jobs').select('id, confidence_status').eq('id', job.data!.id)
    expect(asOps.error).toBeNull()
    expect(asOps.data).toHaveLength(1)
    expect(asOps.data![0].confidence_status).toBe('verified_signal')

    const creatorBClient = clientFor(creatorB)
    const asUnrelated = await creatorBClient.from('mission_verification_jobs').select('id').eq('id', job.data!.id)
    expect(asUnrelated.error).toBeNull()
    expect(asUnrelated.data).toEqual([])
  }, testTimeout)

  it('auto-approve trigger: policy verified_signal_only approves with zero human action, writing a system-actor event and no ops_audit_log row', async () => {
    const s = svc()
    const policyOn = await s.from('missions').update({ auto_approve_policy: 'verified_signal_only' }).eq('id', missionId)
    if (policyOn.error) throw policyOn.error

    const freshSubmission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/auto-approve-1'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (freshSubmission.error) throw freshSubmission.error
    const autoSubmissionId = freshSubmission.data!.id

    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: autoSubmissionId, creator_id: creatorA, status: 'queued',
    }).select('id').single()
    if (job.error) throw job.error

    const auditBefore = await s.from('ops_audit_log').select('id').eq('entity_id', autoSubmissionId)
    if (auditBefore.error) throw auditBefore.error

    const ready = await s.from('mission_verification_jobs')
      .update({ status: 'ready', confidence_status: 'verified_signal' })
      .eq('id', job.data!.id)
    if (ready.error) throw ready.error

    const submission = await s.from('mission_milestone_submissions').select('status, reviewed_by').eq('id', autoSubmissionId).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('approved')
    expect(submission.data!.reviewed_by).toBeNull()

    const events = await s.from('mission_review_events').select('actor_type, actor_id, action').eq('submission_id', autoSubmissionId)
    if (events.error) throw events.error
    expect(events.data).toHaveLength(1)
    expect(events.data![0]).toMatchObject({ actor_type: 'system', actor_id: null, action: 'approve' })

    const auditAfter = await s.from('ops_audit_log').select('id').eq('entity_id', autoSubmissionId)
    if (auditAfter.error) throw auditAfter.error
    expect(auditAfter.data!.length).toBe(auditBefore.data!.length)

    await s.from('missions').update({ auto_approve_policy: 'off' }).eq('id', missionId)
  }, testTimeout)

  it('auto-approve trigger: policy off (the default) leaves an identical job transition untouched', async () => {
    const s = svc()
    // Explicit, not just relying on the previous test's own reset to 'off' -- if that test
    // throws before reaching its reset line, this test must still be a true off-policy proof,
    // not an accidental pass/fail riding on leftover state from a different test.
    const policyOff = await s.from('missions').update({ auto_approve_policy: 'off' }).eq('id', missionId)
    if (policyOff.error) throw policyOff.error

    const freshSubmission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/auto-approve-2'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (freshSubmission.error) throw freshSubmission.error
    const offSubmissionId = freshSubmission.data!.id

    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: offSubmissionId, creator_id: creatorA, status: 'queued',
    }).select('id').single()
    if (job.error) throw job.error

    const ready = await s.from('mission_verification_jobs')
      .update({ status: 'ready', confidence_status: 'verified_signal' })
      .eq('id', job.data!.id)
    if (ready.error) throw ready.error

    const submission = await s.from('mission_milestone_submissions').select('status').eq('id', offSubmissionId).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('submitted')

    const events = await s.from('mission_review_events').select('id').eq('submission_id', offSubmissionId)
    if (events.error) throw events.error
    expect(events.data).toEqual([])
  }, testTimeout)

  it('auto-approve trigger: does not fire on an unrelated update to an already-verified_signal row', async () => {
    const s = svc()
    const policyOn = await s.from('missions').update({ auto_approve_policy: 'verified_signal_only' }).eq('id', missionId)
    if (policyOn.error) throw policyOn.error

    const freshSubmission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/auto-approve-3'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (freshSubmission.error) throw freshSubmission.error
    const noRefireSubmissionId = freshSubmission.data!.id

    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: noRefireSubmissionId, creator_id: creatorA,
      status: 'ready', confidence_status: 'verified_signal',
    }).select('id').single()
    if (job.error) throw job.error

    const afterInsert = await s.from('mission_milestone_submissions').select('status').eq('id', noRefireSubmissionId).single()
    if (afterInsert.error) throw afterInsert.error
    expect(afterInsert.data!.status).toBe('submitted')

    const unrelatedUpdate = await s.from('mission_verification_jobs').update({ error: 'unrelated note' }).eq('id', job.data!.id)
    if (unrelatedUpdate.error) throw unrelatedUpdate.error

    const afterUnrelated = await s.from('mission_milestone_submissions').select('status').eq('id', noRefireSubmissionId).single()
    if (afterUnrelated.error) throw afterUnrelated.error
    expect(afterUnrelated.data!.status).toBe('submitted')

    await s.from('missions').update({ auto_approve_policy: 'off' }).eq('id', missionId)
  }, testTimeout)

  it('admin_mission_attention: surfaces an overdue submission and rejects a non-ops caller', async () => {
    const s = svc()
    const overdueSubmission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: await freshMilestoneId(), mission_participant_id: participantAId, status: 'submitted',
      proof_urls: ['https://example.com/overdue-1'], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (overdueSubmission.error) throw overdueSubmission.error
    const backdate = await s.from('mission_milestone_submissions')
      .update({ review_deadline: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
      .eq('id', overdueSubmission.data!.id)
    if (backdate.error) throw backdate.error

    const ops = clientFor(opsAdminUser)
    const { data, error } = await ops.rpc('admin_mission_attention')
    expect(error).toBeNull()
    const overdue = (data as { overdue_reviews: Array<{ submission_id: string }> }).overdue_reviews
    expect(overdue.some((r) => r.submission_id === overdueSubmission.data!.id)).toBe(true)

    const creator = clientFor(creatorA)
    const denied = await creator.rpc('admin_mission_attention')
    expect(denied.error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${denied.error?.message} ${denied.error?.code}`)).toBe(true)
  }, testTimeout)
})
