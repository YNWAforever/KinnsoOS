// @vitest-environment node
import { describe, expect, it, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbContainer = process.env.SUPABASE_DB_CONTAINER
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

// Same gate shape as settlement-minting.rls.test.ts: skip wholesale rather than fail when the
// local Supabase stack is absent, so the suite is safe in an environment without Docker.
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

// Unlike the sibling RLS suites, these ids are generated fresh per process rather than
// hardcoded distinctive constants. That is a deliberate consequence of what this migration
// set actually does (verified against the live stack with a throwaway ROLLBACK'd transaction
// before writing this file, not assumed): creator_payout_decisions carries unconditional
// BEFORE UPDATE / BEFORE DELETE triggers that raise 'decision_immutable' for every caller,
// including service_role and postgres itself (20260816090000_r10_2_payout_batches_and_decisions.sql).
// Every payout batch created via admin_create_payout_batch always gets a decision row
// alongside it, and creator_payout_decisions.payout_batch_id -> creator_payout_batches(id)
// carries no ON DELETE clause (default NO ACTION), so once a decision exists its batch can
// never be deleted either. That lock cascades further: creator_payout_batches.creator_id and
// .created_by_ops_member_id are also plain NO ACTION foreign keys, so the seeded creators and
// kinnso_ops_members rows below -- and therefore their auth.users rows, since
// creators.id / kinnso_ops_members.user_id -> auth.users is ON DELETE CASCADE and a cascade
// that reaches a NO ACTION-blocked child fails the whole statement -- are permanently
// undeletable too, by design, once any test below runs to completion. There is therefore no
// afterAll cleanup in this file (see the comment below the describe block); every id must be
// unique per process so a second run never collides with the previous run's permanently
// orphaned rows.
const creatorA = randomUUID()
const creatorB = randomUUID()
const opsAdminUser = randomUUID()
const opsAnalystUser = randomUUID()

d('r10.2 payout batch lifecycle, idempotency, and RLS isolation', () => {
  // creatorA/USD: created in the create+replay+conflict test, cancelled in the cancel+recreate
  // test, then replaced there by a fresh pending batch in the same currency.
  let batchUsdId = ''
  let batchUsdRecreatedId = ''
  // creatorA/EUR: dedicated to the mark-paid CAS test so it never collides with the USD
  // one-pending-per-currency constraint exercised by the other tests.
  let batchEurId = ''
  // creatorB/USD: exists purely to prove creator isolation against creatorA's own USD batches.
  let batchCreatorBId = ''

  beforeAll(async () => {
    await runPsql(`
      insert into auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at)
      values
        ('${creatorA}', 'payout-a-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${creatorB}', 'payout-b-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${opsAdminUser}', 'payout-admin-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${opsAnalystUser}', 'payout-analyst-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now())
      on conflict (id) do nothing;

      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
      select id, id, id::text, 'email',
             jsonb_build_object('sub', id::text, 'email', email), now()
      from auth.users where id in ('${creatorA}', '${creatorB}', '${opsAdminUser}', '${opsAnalystUser}')
      on conflict do nothing;

      update public.creators set status = 'active' where id in ('${creatorA}', '${creatorB}');
    `)

    const s = svc()

    // Neither ops member's internal kinnso_ops_members.id is needed anywhere below -- every
    // RPC call authenticates as the auth.users id via clientFor(), and there is no afterAll
    // cleanup to scope by internal id (see the comment above this describe block) -- so only
    // the insert's success is checked, not its returned row.
    const admin = await s.from('kinnso_ops_members').insert({
      user_id: opsAdminUser,
      display_name: `Payout RLS Admin ${runId}`,
      role: 'admin',
      status: 'active',
    })
    if (admin.error) throw admin.error

    const analyst = await s.from('kinnso_ops_members').insert({
      user_id: opsAnalystUser,
      display_name: `Payout RLS Analyst ${runId}`,
      role: 'analyst',
      status: 'active',
    })
    if (analyst.error) throw analyst.error
  }, hookTimeout)

  // No afterAll here -- deliberately. Every row this suite creates (creator_payout_batches,
  // creator_payout_decisions, the seeded kinnso_ops_members rows, and even the seeded
  // auth.users/creators rows once a batch references them) is permanently undeletable by the
  // schema's own design; see the long comment above the id constants for the exact mechanism,
  // confirmed empirically against this stack rather than assumed. Attempting deletes here
  // would only add statements that are guaranteed to fail on every run. The per-process
  // randomUUID() ids above are what make repeated runs of this file safe instead: each run
  // seeds entities no previous run has ever touched, so there is nothing to collide with.

  it('creates a batch, replays an identical call, and rejects a conflicting replay', async () => {
    const admin = clientFor(opsAdminUser)
    const key = `pb-create-${runId}`

    const first = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorA,
      p_currency: 'USD',
      p_amount: 100,
      p_idempotency_key: key,
      p_reason: 'initial payout batch',
    })
    if (first.error) throw first.error
    const firstBody = first.data as { batch_id: string; decision_id: string; replayed: boolean }
    expect(firstBody.replayed).toBe(false)
    expect(firstBody.batch_id).toBeTruthy()
    batchUsdId = firstBody.batch_id

    // Identical replay: same key, same payload -> same batch, replayed: true.
    const replay = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorA,
      p_currency: 'USD',
      p_amount: 100,
      p_idempotency_key: key,
      p_reason: 'initial payout batch',
    })
    if (replay.error) throw replay.error
    const replayBody = replay.data as { batch_id: string; decision_id: string; replayed: boolean }
    expect(replayBody.replayed).toBe(true)
    expect(replayBody.batch_id).toBe(batchUsdId)

    // Conflicting replay: same key, different amount -> rejected, no new batch.
    const conflict = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorA,
      p_currency: 'USD',
      p_amount: 200,
      p_idempotency_key: key,
      p_reason: 'initial payout batch',
    })
    expect(conflict.error?.message).toContain('idempotency_conflict')
  }, testTimeout)

  it('rejects a second pending batch for the same creator+currency', async () => {
    const admin = clientFor(opsAdminUser)
    const second = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorA,
      p_currency: 'USD',
      p_amount: 50,
      p_idempotency_key: `pb-pending-${runId}`,
      p_reason: 'should collide with the still-pending batch',
    })
    expect(second.error?.message).toContain('batch_already_pending')
  }, testTimeout)

  it('marks a pending batch paid exactly once (clean CAS)', async () => {
    const admin = clientFor(opsAdminUser)
    const created = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorA,
      p_currency: 'EUR',
      p_amount: 80,
      p_idempotency_key: `pb-markpaid-${runId}`,
      p_reason: 'batch to be marked paid',
    })
    if (created.error) throw created.error
    batchEurId = (created.data as { batch_id: string }).batch_id

    const paid = await admin.rpc('admin_mark_payout_paid', {
      p_batch_id: batchEurId,
      p_reason: 'paid via bank transfer',
    })
    expect(paid.error).toBeNull()

    // Already paid: the CAS must refuse a second transition.
    const repeat = await admin.rpc('admin_mark_payout_paid', {
      p_batch_id: batchEurId,
      p_reason: 'attempting to pay again',
    })
    expect(repeat.error?.message).toContain('bad_transition')
  }, testTimeout)

  it('cancels a pending batch, frees the slot, and allows a fresh create', async () => {
    const admin = clientFor(opsAdminUser)

    const cancelled = await admin.rpc('admin_cancel_payout', {
      p_batch_id: batchUsdId,
      p_idempotency_key: `pb-cancel-${runId}`,
      p_reason: 'cancelling the original USD batch',
    })
    if (cancelled.error) throw cancelled.error
    expect((cancelled.data as { replayed: boolean }).replayed).toBe(false)

    const recreated = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorA,
      p_currency: 'USD',
      p_amount: 60,
      p_idempotency_key: `pb-recreate-${runId}`,
      p_reason: 'new USD batch after cancellation',
    })
    if (recreated.error) throw recreated.error
    const recreatedBody = recreated.data as { batch_id: string; replayed: boolean }
    expect(recreatedBody.replayed).toBe(false)
    expect(recreatedBody.batch_id).not.toBe(batchUsdId)
    batchUsdRecreatedId = recreatedBody.batch_id
  }, testTimeout)

  it('lets an analyst list batches but forbids creating one', async () => {
    const analyst = clientFor(opsAnalystUser)

    const list = await analyst.rpc('admin_list_payout_batches', { p_status: null })
    expect(list.error).toBeNull()
    expect(Array.isArray(list.data)).toBe(true)

    const attempt = await analyst.rpc('admin_create_payout_batch', {
      p_creator_id: creatorA,
      p_currency: 'GBP',
      p_amount: 10,
      p_idempotency_key: `pb-analyst-forbidden-${runId}`,
      p_reason: 'analyst tier should not be able to do this',
    })
    expect(attempt.error?.message).toContain('forbidden')
  }, testTimeout)

  it('isolates each creator to only their own batches', async () => {
    const admin = clientFor(opsAdminUser)
    const createdB = await admin.rpc('admin_create_payout_batch', {
      p_creator_id: creatorB,
      p_currency: 'USD',
      p_amount: 40,
      p_idempotency_key: `pb-creatorb-${runId}`,
      p_reason: 'creator B batch for isolation check',
    })
    if (createdB.error) throw createdB.error
    batchCreatorBId = (createdB.data as { batch_id: string }).batch_id

    const mineA = await clientFor(creatorA).rpc('creator_payout_batches_mine')
    if (mineA.error) throw mineA.error
    const idsA = (mineA.data as { id: string }[]).map((b) => b.id)
    // creatorA holds all three of its own batches regardless of status (cancelled, paid,
    // pending) -- and, same currency as creatorB's batch, never creatorB's.
    expect(idsA).toEqual(expect.arrayContaining([batchUsdId, batchEurId, batchUsdRecreatedId]))
    expect(idsA).not.toContain(batchCreatorBId)

    const mineB = await clientFor(creatorB).rpc('creator_payout_batches_mine')
    if (mineB.error) throw mineB.error
    const idsB = (mineB.data as { id: string }[]).map((b) => b.id)
    expect(idsB).toEqual([batchCreatorBId])
    expect(idsB).not.toContain(batchUsdId)
    expect(idsB).not.toContain(batchEurId)
    expect(idsB).not.toContain(batchUsdRecreatedId)
  }, testTimeout)
})
