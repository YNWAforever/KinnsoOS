// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbContainer = process.env.SUPABASE_DB_CONTAINER
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

// Same gate shape as creator-earnings.rls.test.ts / payout-batches.rls.test.ts: skip wholesale
// rather than fail when the local Supabase stack is absent, so the suite is safe in an
// environment without Docker.
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

// Fixed, distinctive constants + afterAll cleanup — unlike R10.2's creator_payout_batches
// (permanently undeletable by design: BEFORE UPDATE/DELETE immutability triggers plus NO
// ACTION FKs, see payout-batches.rls.test.ts), this phase's `notifications` table
// (20260817090000_r10_3_notifications_table.sql) has no immutability trigger at all, and its
// creator_id FK is `references public.creators(id) on delete cascade`. creators.id in turn
// `references auth.users(id) on delete cascade`, and every mission/participant/milestone/
// settlement table used below cascades from missions.merchant_profile_id or
// mission_id/mission_participant_id back to merchant_profiles.user_id / creators.id — both
// themselves `on delete cascade` off auth.users. So a single `delete from auth.users` in
// afterAll tears down the entire seed tree, notifications included, exactly like
// creator-earnings.rls.test.ts's pattern (not payout-batches.rls.test.ts's no-cleanup one).
const creatorA = randomUUID()
const creatorB = randomUUID()
const nonCreator = randomUUID()
const merchantUser = randomUUID()
// Distinct from merchantUser: merchant_profiles.user_id is unique, and the fault-injection
// test below needs its own merchant_profiles row alongside the one beforeAll already created
// for merchantUser -- reusing merchantUser here would violate that constraint on every run,
// not just a re-run against leftover state.
const faultMerchantUser = randomUUID()

d('r10.3 notifications: triggers, RLS isolation, mark-read, and the fault-injection guarantee', () => {
  let normalMissionId = ''
  let milestoneAId = ''
  let participantAId = ''
  let participantBId = ''
  let submissionAId = ''
  let settlementId = ''
  let approvedNotificationId = ''

  beforeAll(async () => {
    await runPsql(`
      insert into auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at)
      values
        ('${creatorA}', 'notif-a-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${creatorB}', 'notif-b-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${nonCreator}', 'notif-n-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${merchantUser}', 'notif-m-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${faultMerchantUser}', 'notif-fm-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now())
      on conflict (id) do nothing;

      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
      select id, id, id::text, 'email',
             jsonb_build_object('sub', id::text, 'email', email), now()
      from auth.users where id in ('${creatorA}', '${creatorB}', '${nonCreator}', '${merchantUser}', '${faultMerchantUser}')
      on conflict do nothing;

      -- handle_new_user() gives every signup a blank creators row; force the states we need.
      update public.creators set status = 'active' where id in ('${creatorA}', '${creatorB}');
      update public.creators set status = 'onboarding' where id = '${nonCreator}';
    `)

    const s = svc()

    const merchant = await s
      .from('merchant_profiles')
      .insert({
        user_id: merchantUser,
        company_name: `Notifications RLS Merchant ${runId}`,
        contact_email: `notif-merchant-${runId}@example.test`,
      })
      .select('id')
      .single()
    if (merchant.error) throw merchant.error
    const merchantProfileId = merchant.data!.id

    const mission = await s
      .from('missions')
      .insert({
        merchant_profile_id: merchantProfileId,
        title: 'Notifications RLS Test Mission',
        summary: 'Mission used to prove notification triggers and RLS on a live stack',
        mission_source: 'merchant',
        mission_type: 'coupon_affiliate',
        visibility: 'open',
        status: 'published',
        coupon_code: 'NOTIFRLS',
        coupon_url: 'https://example.com/notif-rls',
        published_at: new Date().toISOString(),
      })
      .select('id, title')
      .single()
    if (mission.error) throw mission.error
    normalMissionId = mission.data!.id

    const milestone = await s
      .from('mission_milestones')
      .insert({ mission_id: normalMissionId, title: 'Post proof', description: 'Upload post proof' })
      .select('id')
      .single()
    if (milestone.error) throw milestone.error
    milestoneAId = milestone.data!.id

    const participantA = await s
      .from('mission_participants')
      .insert({ mission_id: normalMissionId, creator_id: creatorA, status: 'active', source: 'open_join' })
      .select('id')
      .single()
    if (participantA.error) throw participantA.error
    participantAId = participantA.data!.id

    const participantB = await s
      .from('mission_participants')
      .insert({ mission_id: normalMissionId, creator_id: creatorB, status: 'active', source: 'open_join' })
      .select('id')
      .single()
    if (participantB.error) throw participantB.error
    participantBId = participantB.data!.id
  }, hookTimeout)

  afterAll(async () => {
    // A single delete off auth.users cascades through creators, merchant_profiles, missions,
    // mission_participants/milestones/submissions, mission_settlements, and notifications --
    // see the long comment above the id constants for the exact chain. Guarded so a partial
    // seed (a beforeAll that threw partway through) still cleans up what did get created.
    await runPsql(`
      delete from auth.users where id in ('${creatorA}', '${creatorB}', '${nonCreator}', '${merchantUser}', '${faultMerchantUser}');
    `)
  }, hookTimeout)

  it('fires submission.approved / rejected / revision_requested as one submission moves through those statuses, in order', async () => {
    const s = svc()

    const submission = await s
      .from('mission_milestone_submissions')
      .insert({
        mission_milestone_id: milestoneAId,
        mission_participant_id: participantAId,
        status: 'submitted',
        proof_urls: ['https://example.com/proof'],
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (submission.error) throw submission.error
    submissionAId = submission.data!.id

    // Each update below is a real status change, so the trigger's own no-op guard
    // (`new.status is not distinct from old.status`) never short-circuits it -- three genuine
    // AFTER UPDATE firings, three notification types, same entity (the mission).
    for (const status of ['approved', 'rejected', 'revision_requested'] as const) {
      const updated = await s.from('mission_milestone_submissions').update({ status }).eq('id', submissionAId)
      if (updated.error) throw updated.error
    }

    const mine = await clientFor(creatorA).rpc('notifications_mine')
    if (mine.error) throw mine.error
    const rows = mine.data as {
      id: string
      notificationType: string
      entityType: string
      entityId: string
      payload: { mission_title?: string }
      readAt: string | null
    }[]

    const mineForThisMission = rows.filter((r) => r.entityId === normalMissionId)
    expect(mineForThisMission).toHaveLength(3)
    expect(mineForThisMission.map((r) => r.notificationType).sort()).toEqual(
      ['submission.approved', 'submission.rejected', 'submission.revision_requested'].sort(),
    )
    for (const row of mineForThisMission) {
      expect(row.entityType).toBe('mission')
      expect(row.payload.mission_title).toBe('Notifications RLS Test Mission')
      expect(row.readAt).toBeNull()
    }

    approvedNotificationId = mineForThisMission.find((r) => r.notificationType === 'submission.approved')!.id
    expect(approvedNotificationId).toBeTruthy()
  }, testTimeout)

  it('fires settlement.created for the settlement participant when a mission_settlements row is inserted', async () => {
    const settlement = await svc()
      .from('mission_settlements')
      .insert({
        mission_id: normalMissionId,
        mission_participant_id: participantBId,
        status: 'pending',
        amount_currency: 'usd',
        creator_commission_amount: 12.34,
        creator_payout_status: 'pending',
      })
      .select('id')
      .single()
    if (settlement.error) throw settlement.error
    settlementId = settlement.data!.id

    const mine = await clientFor(creatorB).rpc('notifications_mine')
    if (mine.error) throw mine.error
    const rows = mine.data as {
      id: string
      notificationType: string
      entityType: string
      entityId: string
      payload: { mission_title?: string; currency?: string }
    }[]

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      notificationType: 'settlement.created',
      entityType: 'mission_settlement',
      entityId: settlementId,
    })
    expect(rows[0].payload.mission_title).toBe('Notifications RLS Test Mission')
    expect(rows[0].payload.currency).toBe('USD')
  }, testTimeout)

  it('isolates notifications_mine() to the calling creator only (RLS)', async () => {
    const mineA = await clientFor(creatorA).rpc('notifications_mine')
    if (mineA.error) throw mineA.error
    const rowsA = mineA.data as { entityType: string; entityId: string }[]
    // creatorA sees only their own three submission-status notifications, never creatorB's
    // settlement.created row.
    expect(rowsA.every((r) => r.entityType === 'mission' && r.entityId === normalMissionId)).toBe(true)
    expect(rowsA.some((r) => r.entityId === settlementId)).toBe(false)

    const mineB = await clientFor(creatorB).rpc('notifications_mine')
    if (mineB.error) throw mineB.error
    const rowsB = mineB.data as { entityType: string; entityId: string }[]
    // creatorB sees only their own settlement.created row, never creatorA's submission
    // notifications.
    expect(rowsB).toHaveLength(1)
    expect(rowsB[0].entityType).toBe('mission_settlement')
    expect(rowsB.some((r) => r.entityId === normalMissionId)).toBe(false)
  }, testTimeout)

  it('rejects a signed-in non-creator from notifications_mine() and notifications_unread_count()', async () => {
    const nonCreatorClient = clientFor(nonCreator)

    const mine = await nonCreatorClient.rpc('notifications_mine')
    expect(mine.error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${mine.error?.message} ${mine.error?.code}`)).toBe(true)

    const unread = await nonCreatorClient.rpc('notifications_unread_count')
    expect(unread.error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${unread.error?.message} ${unread.error?.code}`)).toBe(true)
  }, testTimeout)

  it('marks a notification read (mirroring markNotificationReadAction) and reflects it in notifications_unread_count()', async () => {
    const creatorAClient = clientFor(creatorA)

    // creatorA has exactly three unread notifications from the first test (settlement.created
    // belongs to creatorB, not counted here).
    const before = await creatorAClient.rpc('notifications_unread_count')
    if (before.error) throw before.error
    expect(before.data).toBe(3)

    // The client-facing action (markNotificationReadAction) does a direct table update, not an
    // RPC -- RLS's notifications_update_own policy plus the column-scoped
    // `grant update (read_at) on notifications to authenticated` from Task 1 are what make
    // this legal for the owning creator and nobody else.
    const marked = await creatorAClient
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', approvedNotificationId)
      .select('id, read_at')
      .single()
    if (marked.error) throw marked.error
    expect(marked.data!.read_at).not.toBeNull()

    const after = await creatorAClient.rpc('notifications_unread_count')
    if (after.error) throw after.error
    expect(after.data).toBe(2)
  }, testTimeout)

  it('the fault-injection guarantee: an over-8KiB resolved payload fails the insert silently, without rolling back the submission update', async () => {
    const s = svc()

    // pg_column_size() reports the on-disk (possibly TOAST-compressed) size, so an easily
    // compressible title (e.g. one repeated character) risks staying under the 8192-byte
    // notifications_payload_size cap even at huge lengths. Random hex is effectively
    // incompressible, so this reliably blows past the cap with room to spare.
    const hugeTitle = randomBytes(6000).toString('hex') // 12,000 bytes of high-entropy text

    const merchant = await s
      .from('merchant_profiles')
      .insert({
        user_id: faultMerchantUser,
        company_name: `Notifications RLS Fault Merchant ${runId}`,
        contact_email: `notif-fault-merchant-${runId}@example.test`,
      })
      .select('id')
      .single()
    if (merchant.error) throw merchant.error
    const faultMerchantProfileId = merchant.data!.id

    const faultMission = await s
      .from('missions')
      .insert({
        merchant_profile_id: faultMerchantProfileId,
        title: hugeTitle,
        summary: 'Mission whose title is deliberately too large to notify about',
        mission_source: 'merchant',
        mission_type: 'coupon_affiliate',
        visibility: 'open',
        status: 'published',
        coupon_code: 'NOTIFFAULT',
        coupon_url: 'https://example.com/notif-fault',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (faultMission.error) throw faultMission.error
    const faultMissionId = faultMission.data!.id

    const faultMilestone = await s
      .from('mission_milestones')
      .insert({ mission_id: faultMissionId, title: 'Post proof', description: 'Upload post proof' })
      .select('id')
      .single()
    if (faultMilestone.error) throw faultMilestone.error

    const faultParticipant = await s
      .from('mission_participants')
      .insert({ mission_id: faultMissionId, creator_id: creatorA, status: 'active', source: 'open_join' })
      .select('id')
      .single()
    if (faultParticipant.error) throw faultParticipant.error

    const faultSubmission = await s
      .from('mission_milestone_submissions')
      .insert({
        mission_milestone_id: faultMilestone.data!.id,
        mission_participant_id: faultParticipant.data!.id,
        status: 'submitted',
        proof_urls: ['https://example.com/fault-proof'],
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (faultSubmission.error) throw faultSubmission.error
    const faultSubmissionId = faultSubmission.data!.id

    // The status change itself must succeed -- the trigger's inner begin/exception block
    // (Task 2) wraps only the notification insert, so a notifications_payload_size check
    // violation there must never bubble up and roll back this UPDATE.
    const approve = await s
      .from('mission_milestone_submissions')
      .update({ status: 'approved' })
      .eq('id', faultSubmissionId)
      .select('status')
      .single()
    if (approve.error) throw approve.error
    expect(approve.data!.status).toBe('approved')

    // And the exception must actually be swallowing a real failure, not silently expanding
    // into a valid-but-wrong row: no notification row exists for this entity at all.
    const orphanedNotifications = await s.from('notifications').select('id').eq('entity_id', faultMissionId)
    if (orphanedNotifications.error) throw orphanedNotifications.error
    expect(orphanedNotifications.data).toEqual([])
  }, testTimeout)

  // Payout-batch-triggered notifications (payout_batch.created/paid/cancelled) are
  // deliberately NOT covered here. R10.2 (PR #111, which ships creator_payout_batches) is
  // still open as of this branch, so that table does not exist here -- the
  // 20260817090150_r10_3_notification_trigger_payout_batch.sql trigger is written and
  // text-tested, but its live verification stays pending R10.2's merge, per the plan's own
  // amendment. This is expected, not a gap this task needs to fill.
})
