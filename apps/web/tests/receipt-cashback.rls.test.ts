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

// Same gate shape as settlement-minting.rls.test.ts / mission-review.rls.test.ts: skip
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

// Per the fixed-UUID-collision gotcha (this repo's *.rls.test.ts files run concurrently
// against the same live stack), every user id here is generated with randomUUID() rather than
// a fixed constant -- there is no fixed block to collide with any sibling file's.
const creatorUser = randomUUID()
const merchantUser = randomUUID()
const opsAdminUser = randomUUID()

d('r12.2 receipt-cashback live proof: repeatable settlements, cap enforcement, taxonomy, paid-mission guarantee', () => {
  let merchantProfileId = ''
  let creatorId = ''

  // Mission A: receipt_cashback, cap = 2 -- scenarios 1 & 2 (repeatable settlements + cap block).
  let missionAId = ''
  // Mission B: receipt_cashback, cap = 1, fresh fixture -- scenario 3 (rejection frees the cap).
  let missionBId = ''
  // Mission C: paid (non-repeatable), two milestones -- scenario 4 (untouched paid guarantee)
  // and half of scenario 5 (non-receipt-cashback taxonomy direction).
  let missionCId = ''
  let missionCParticipantId = ''
  let missionCMilestoneOneId = ''
  let missionCMilestoneTwoId = ''
  // Mission D: receipt_cashback, no cap -- the other half of scenario 5 (receipt taxonomy
  // direction), kept separate from A/B so it never collides with their cap accounting.
  let missionDId = ''

  beforeAll(async () => {
    await runPsql(`
      insert into auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at)
      values
        ('${creatorUser}', 'r12-2-creator-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${merchantUser}', 'r12-2-merchant-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${opsAdminUser}', 'r12-2-ops-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now())
      on conflict (id) do nothing;

      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
      select id, id, id::text, 'email',
             jsonb_build_object('sub', id::text, 'email', email), now()
      from auth.users where id in ('${creatorUser}', '${merchantUser}', '${opsAdminUser}')
      on conflict do nothing;

      update public.creators set status = 'active' where id = '${creatorUser}';
    `)

    const s = svc()
    creatorId = creatorUser

    const ops = await s.from('kinnso_ops_members').insert({
      user_id: opsAdminUser, display_name: `R12.2 Live Proof Ops ${runId}`, role: 'admin', status: 'active',
    }).select('id').single()
    if (ops.error) throw ops.error

    const merchant = await s.from('merchant_profiles').insert({
      user_id: merchantUser, company_name: `R12.2 Live Proof Merchant ${runId}`, contact_email: `r12-2-merchant-${runId}@example.test`,
    }).select('id').single()
    if (merchant.error) throw merchant.error
    merchantProfileId = merchant.data!.id

    // Mission A -- repeatable, cap = 2.
    const missionA = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId, mission_source: 'merchant', mission_type: 'receipt_cashback',
      visibility: 'open', status: 'published', title: `R12.2 Receipt Mission A ${runId}`,
      summary: 'Live-proof mission: repeatable settlements + cap enforcement',
      paid_fee_amount: 35, paid_fee_currency: 'HKD', max_receipts_per_creator: 2,
      published_at: new Date().toISOString(),
    }).select('id').single()
    if (missionA.error) throw missionA.error
    missionAId = missionA.data!.id

    const participantA = await s.from('mission_participants').insert({
      mission_id: missionAId, creator_id: creatorId, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantA.error) throw participantA.error

    // Mission B -- repeatable, cap = 1, deliberately separate from A so scenario 3's rejection/
    // resubmission cap accounting can never be polluted by A's own cap usage.
    const missionB = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId, mission_source: 'merchant', mission_type: 'receipt_cashback',
      visibility: 'open', status: 'published', title: `R12.2 Receipt Mission B ${runId}`,
      summary: 'Live-proof mission: rejection frees the cap, resubmission succeeds',
      paid_fee_amount: 20, paid_fee_currency: 'HKD', max_receipts_per_creator: 1,
      published_at: new Date().toISOString(),
    }).select('id').single()
    if (missionB.error) throw missionB.error
    missionBId = missionB.data!.id

    const participantB = await s.from('mission_participants').insert({
      mission_id: missionBId, creator_id: creatorId, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantB.error) throw participantB.error

    // Mission C -- an ordinary 'paid' mission, own mission_milestones rows inserted manually
    // (paid missions do NOT get Task 1's auto-creation trigger, unlike receipt_cashback).
    const missionC = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId, mission_source: 'merchant', mission_type: 'paid',
      visibility: 'open', status: 'published', title: `R12.2 Paid Mission C ${runId}`,
      summary: 'Live-proof mission: paid settlement guarantee must stay untouched by receipt branch',
      paid_fee_amount: 900, paid_fee_currency: 'HKD',
      published_at: new Date().toISOString(),
    }).select('id').single()
    if (missionC.error) throw missionC.error
    missionCId = missionC.data!.id

    const participantC = await s.from('mission_participants').insert({
      mission_id: missionCId, creator_id: creatorId, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantC.error) throw participantC.error
    missionCParticipantId = participantC.data!.id

    const milestonesC = await s.from('mission_milestones').insert([
      { mission_id: missionCId, title: 'Post proof', description: 'Upload post proof', sort_order: 0 },
      { mission_id: missionCId, title: 'Second deliverable', description: 'Upload second proof', sort_order: 1 },
    ]).select('id')
    if (milestonesC.error) throw milestonesC.error
    missionCMilestoneOneId = milestonesC.data![0].id
    missionCMilestoneTwoId = milestonesC.data![1].id

    // Mission D -- repeatable, no cap, used only for scenario 5's receipt-taxonomy direction so
    // it can never collide with A's or B's cap accounting.
    const missionD = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId, mission_source: 'merchant', mission_type: 'receipt_cashback',
      visibility: 'open', status: 'published', title: `R12.2 Receipt Mission D ${runId}`,
      summary: 'Live-proof mission: mission-type-aware reason taxonomy, receipt direction',
      paid_fee_amount: 15, paid_fee_currency: 'HKD',
      published_at: new Date().toISOString(),
    }).select('id').single()
    if (missionD.error) throw missionD.error
    missionDId = missionD.data!.id

    const participantD = await s.from('mission_participants').insert({
      mission_id: missionDId, creator_id: creatorId, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantD.error) throw participantD.error
  }, hookTimeout)

  afterAll(async () => {
    // admin_review_submission writes an ops_audit_log row keyed to opsAdminUser's
    // kinnso_ops_members row, and ops_audit_log.actor_ops_member_id has no ON DELETE CASCADE
    // (the same permanent-ledger shape documented in mission-review.rls.test.ts) -- so
    // opsAdminUser (and its kinnso_ops_members row) is deliberately left behind, never deleted.
    // Everything else cascades cleanly off creatorUser/merchantUser via auth.users.
    await runPsql(`
      delete from auth.users where id in ('${creatorUser}', '${merchantUser}');
    `)
  }, hookTimeout)

  it('a creator can submit and get approved for more than one receipt, each minting its own settlement', async () => {
    const creator = clientFor(creatorUser)
    const ops = clientFor(opsAdminUser)

    const first = await creator.rpc('submit_receipt', {
      p_mission_id: missionAId,
      p_proof_urls: [`https://example.com/receipts/${randomUUID()}.jpg`],
    })
    expect(first.error).toBeNull()
    const firstSubmissionId = (first.data as { submission_id: string }).submission_id
    expect(firstSubmissionId).toBeTruthy()

    const second = await creator.rpc('submit_receipt', {
      p_mission_id: missionAId,
      p_proof_urls: [`https://example.com/receipts/${randomUUID()}.jpg`],
    })
    expect(second.error).toBeNull()
    const secondSubmissionId = (second.data as { submission_id: string }).submission_id
    expect(secondSubmissionId).toBeTruthy()
    expect(secondSubmissionId).not.toBe(firstSubmissionId)

    const approveFirst = await ops.rpc('admin_review_submission', {
      p_submission_id: firstSubmissionId, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(approveFirst.error).toBeNull()

    const approveSecond = await ops.rpc('admin_review_submission', {
      p_submission_id: secondSubmissionId, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(approveSecond.error).toBeNull()

    const s = svc()
    const settlements = await s.from('mission_settlements')
      .select('id, source, mission_milestone_submission_id')
      .in('mission_milestone_submission_id', [firstSubmissionId, secondSubmissionId])
    if (settlements.error) throw settlements.error

    expect(settlements.data).toHaveLength(2)
    for (const row of settlements.data!) {
      expect(row.source).toBe('receipt_cashback')
    }
    const submissionIds = settlements.data!.map((r) => r.mission_milestone_submission_id).sort()
    expect(submissionIds).toEqual([firstSubmissionId, secondSubmissionId].sort())
  }, testTimeout)

  it('the per-creator cap blocks a further submission once max_receipts_per_creator is reached', async () => {
    // Mission A's cap is 2 and the previous test already minted 2 approved submissions for
    // this same creator -- a third attempt must be rejected before any row is inserted.
    const creator = clientFor(creatorUser)
    const third = await creator.rpc('submit_receipt', {
      p_mission_id: missionAId,
      p_proof_urls: [`https://example.com/receipts/${randomUUID()}.jpg`],
    })
    expect(third.error).not.toBeNull()
    expect(/receipt_cap_reached/i.test(`${third.error?.message}`)).toBe(true)

    const s = svc()
    const count = await s.from('mission_milestone_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('mission_participant_id', (
        await s.from('mission_participants').select('id').eq('mission_id', missionAId).eq('creator_id', creatorUser).single()
      ).data!.id)
    expect(count.count).toBe(2)
  }, testTimeout)

  it('a rejected receipt does not count against the cap, and a resubmission succeeds', async () => {
    const creator = clientFor(creatorUser)
    const ops = clientFor(opsAdminUser)

    const first = await creator.rpc('submit_receipt', {
      p_mission_id: missionBId,
      p_proof_urls: [`https://example.com/receipts/${randomUUID()}.jpg`],
    })
    expect(first.error).toBeNull()
    const firstSubmissionId = (first.data as { submission_id: string }).submission_id

    // Mission B's cap is 1 -- a second submit_receipt call right now must fail, proving the
    // 'submitted' row is currently counted against the cap.
    const blockedWhilePending = await creator.rpc('submit_receipt', {
      p_mission_id: missionBId,
      p_proof_urls: [`https://example.com/receipts/${randomUUID()}.jpg`],
    })
    expect(blockedWhilePending.error).not.toBeNull()
    expect(/receipt_cap_reached/i.test(`${blockedWhilePending.error?.message}`)).toBe(true)

    // Reject using the RECEIPT-specific taxonomy from Task 4, not the old social-proof set.
    const reject = await ops.rpc('admin_review_submission', {
      p_submission_id: firstSubmissionId, p_action: 'reject', p_reason_category: 'unreadable', p_reason_text: 'Blurry photo, cannot read the total',
    })
    expect(reject.error).toBeNull()

    const s = svc()
    const rejected = await s.from('mission_milestone_submissions').select('status').eq('id', firstSubmissionId).single()
    if (rejected.error) throw rejected.error
    expect(rejected.data!.status).toBe('rejected')

    // The cap slot is now free -- a fresh submission must succeed with a NEW submission id.
    const resubmit = await creator.rpc('submit_receipt', {
      p_mission_id: missionBId,
      p_proof_urls: [`https://example.com/receipts/${randomUUID()}.jpg`],
    })
    expect(resubmit.error).toBeNull()
    const resubmitId = (resubmit.data as { submission_id: string }).submission_id
    expect(resubmitId).toBeTruthy()
    expect(resubmitId).not.toBe(firstSubmissionId)
  }, testTimeout)

  it("an existing paid mission's settlement guarantee is completely untouched by the receipt_cashback branch", async () => {
    const s = svc()
    const submission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: missionCMilestoneOneId, mission_participant_id: missionCParticipantId, status: 'submitted',
      proof_urls: [`https://example.com/proof/${randomUUID()}.jpg`], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (submission.error) throw submission.error
    const submissionId = submission.data!.id

    const ops = clientFor(opsAdminUser)
    const approve = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionId, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(approve.error).toBeNull()

    const settlements = await s.from('mission_settlements')
      .select('id, source, paid_fee_amount, mission_milestone_submission_id')
      .eq('mission_participant_id', missionCParticipantId)
    if (settlements.error) throw settlements.error

    expect(settlements.data).toHaveLength(1)
    expect(settlements.data![0].source).toBe('mission_fee')
    expect(Number(settlements.data![0].paid_fee_amount)).toBe(900)
  }, testTimeout)

  it('a receipt_cashback submission rejected with a non-receipt reason fails, and with a real receipt reason succeeds', async () => {
    const creator = clientFor(creatorUser)
    const ops = clientFor(opsAdminUser)

    const submit = await creator.rpc('submit_receipt', {
      p_mission_id: missionDId,
      p_proof_urls: [`https://example.com/receipts/${randomUUID()}.jpg`],
    })
    expect(submit.error).toBeNull()
    const submissionId = (submit.data as { submission_id: string }).submission_id

    // Direction 1: a receipt_cashback submission rejected with a non-receipt (R11.0 social-
    // proof) reason must FAIL.
    const wrongTaxonomy = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionId, p_action: 'reject', p_reason_category: 'format', p_reason_text: 'wrong taxonomy for this mission type',
    })
    expect(wrongTaxonomy.error).not.toBeNull()
    expect(/bad_reason_category/i.test(`${wrongTaxonomy.error?.message}`)).toBe(true)

    const s = svc()
    const stillSubmitted = await s.from('mission_milestone_submissions').select('status').eq('id', submissionId).single()
    if (stillSubmitted.error) throw stillSubmitted.error
    expect(stillSubmitted.data!.status).toBe('submitted')

    // Direction 2 (the other half of the same taxonomy): a receipt_cashback submission
    // rejected with a real receipt reason must SUCCEED.
    const rightTaxonomy = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionId, p_action: 'reject', p_reason_category: 'unreadable', p_reason_text: 'Blurry receipt photo',
    })
    expect(rightTaxonomy.error).toBeNull()

    const nowRejected = await s.from('mission_milestone_submissions').select('status').eq('id', submissionId).single()
    if (nowRejected.error) throw nowRejected.error
    expect(nowRejected.data!.status).toBe('rejected')
  }, testTimeout)

  it('a non-receipt-cashback mission submission rejected with a receipt-specific reason fails, and with the correct taxonomy succeeds', async () => {
    const s = svc()
    const submission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: missionCMilestoneTwoId, mission_participant_id: missionCParticipantId, status: 'submitted',
      proof_urls: [`https://example.com/proof/${randomUUID()}.jpg`], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (submission.error) throw submission.error
    const submissionId = submission.data!.id

    const ops = clientFor(opsAdminUser)

    // Direction 3 (the OTHER pairing this gotcha calls out): a non-receipt-cashback (paid)
    // mission's submission rejected with a receipt-specific reason must FAIL.
    const wrongTaxonomy = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionId, p_action: 'reject', p_reason_category: 'unreadable', p_reason_text: 'wrong taxonomy for a paid mission',
    })
    expect(wrongTaxonomy.error).not.toBeNull()
    expect(/bad_reason_category/i.test(`${wrongTaxonomy.error?.message}`)).toBe(true)

    const stillSubmitted = await s.from('mission_milestone_submissions').select('status').eq('id', submissionId).single()
    if (stillSubmitted.error) throw stillSubmitted.error
    expect(stillSubmitted.data!.status).toBe('submitted')

    // Direction 4: the same mission's submission rejected with the correct (R11.0) existing
    // taxonomy must SUCCEED.
    const rightTaxonomy = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionId, p_action: 'reject', p_reason_category: 'format', p_reason_text: 'Did not follow the post format',
    })
    expect(rightTaxonomy.error).toBeNull()

    const nowRejected = await s.from('mission_milestone_submissions').select('status').eq('id', submissionId).single()
    if (nowRejected.error) throw nowRejected.error
    expect(nowRejected.data!.status).toBe('rejected')
  }, testTimeout)

  it('at most one repeatable milestone is ever allowed per mission, and repeatable can only attach to a receipt_cashback mission', async () => {
    const s = svc()

    // Mission A already has exactly one repeatable milestone (auto-created by Task 1's
    // trigger). A second repeatable=true insert on the SAME mission must be rejected by the
    // partial unique index -- this is the guard submit_receipt's unordered `limit 1` lookup
    // actually depends on.
    const second = await s.from('mission_milestones').insert({
      mission_id: missionAId, title: 'Duplicate repeatable milestone', description: 'Should be rejected', repeatable: true,
    })
    expect(second.error).not.toBeNull()
    expect(/duplicate key value violates unique constraint|mission_milestones_one_repeatable_per_mission/i.test(`${second.error?.message}`)).toBe(true)

    const countA = await s.from('mission_milestones').select('id', { count: 'exact', head: true }).eq('mission_id', missionAId).eq('repeatable', true)
    expect(countA.count).toBe(1)

    // A merchant inserting a repeatable=true milestone on a NON-receipt_cashback mission
    // (Mission C, 'paid') must be rejected by the tightened RLS policy, independent of the
    // uniqueness index above -- defense in depth so a repeatable milestone can never attach to
    // the wrong mission type at all.
    const merchant = clientFor(merchantUser)
    const wrongType = await merchant.from('mission_milestones').insert({
      mission_id: missionCId, title: 'Repeatable on a paid mission', description: 'Should be rejected', repeatable: true,
    })
    expect(wrongType.error).not.toBeNull()

    const countC = await s.from('mission_milestones').select('id', { count: 'exact', head: true }).eq('mission_id', missionCId).eq('repeatable', true)
    expect(countC.count).toBe(0)
  }, testTimeout)
})
