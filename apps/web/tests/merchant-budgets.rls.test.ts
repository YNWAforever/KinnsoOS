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

// Same gate shape as mission-review.rls.test.ts / settlement-minting.rls.test.ts: skip
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

// Seed-id rule (per live-proof-fixed-uuid-collision-gotcha): every other *.rls.test.ts file in
// this repo has already claimed a disjoint fixed-digit UUID block (1111...-ffff...), and those
// blocks are now exhausted. Vitest runs *.rls.test.ts files concurrently against the same live
// stack by default, so reusing any of them risks a unique-violation race or a cross-file
// afterAll cascade. Use randomUUID() for every seed id in this file instead -- runId-suffixed
// display names keep them greppable in psql/logs without needing memorable constants.
const creatorUser = randomUUID()
const merchantUser = randomUUID()
const otherMerchantUser = randomUUID()
const opsAdminUser = randomUUID()
const nonAdminOpsUser = randomUUID() // signed-in, non-ops -- used to prove the write RPCs' admin gate

d('r11.2 merchant budgets: funding gate, ledger idempotency, ops RPCs, and RLS', () => {
  let merchantProfileId = ''
  let merchantBudgetId = ''
  let otherMerchantProfileId = ''

  let missionAId = ''
  let missionA3Id = ''
  let missionA4Id = '' // auto_approve_policy = 'verified_signal_only', used only by scenario 8
  let missionBId = ''

  let participantAId = ''
  let participantA3Id = ''
  let participantA4Id = ''
  let participantBId = ''

  let submissionA1Id = ''
  let settlementAId = ''

  // mission_milestone_submissions has a unique (mission_milestone_id, mission_participant_id)
  // constraint, so every fresh submission for a participant needs its own milestone -- reusing
  // a milestone id across inserts hits that constraint on the second insert.
  async function freshMilestone(missionId: string): Promise<string> {
    const s = svc()
    const milestone = await s.from('mission_milestones').insert({
      mission_id: missionId, title: `Budget proof ${Math.random().toString(36).slice(2)}`, description: 'Upload proof',
    }).select('id').single()
    if (milestone.error) throw milestone.error
    return milestone.data!.id
  }

  async function submitFresh(missionId: string, participantId: string, tag: string): Promise<string> {
    const s = svc()
    const milestoneId = await freshMilestone(missionId)
    const submission = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: milestoneId, mission_participant_id: participantId, status: 'submitted',
      proof_urls: [`https://example.com/${tag}`], submitted_at: new Date().toISOString(),
    }).select('id').single()
    if (submission.error) throw submission.error
    return submission.data!.id
  }

  beforeAll(async () => {
    await runPsql(`
      insert into auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at)
      values
        ('${creatorUser}', 'r11-2-creator-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${merchantUser}', 'r11-2-merchant-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${otherMerchantUser}', 'r11-2-other-merchant-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${opsAdminUser}', 'r11-2-ops-admin-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${nonAdminOpsUser}', 'r11-2-non-admin-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now())
      on conflict (id) do nothing;

      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
      select id, id, id::text, 'email',
             jsonb_build_object('sub', id::text, 'email', email), now()
      from auth.users where id in ('${creatorUser}', '${merchantUser}', '${otherMerchantUser}', '${opsAdminUser}', '${nonAdminOpsUser}')
      on conflict do nothing;

      update public.creators set status = 'active' where id = '${creatorUser}';
    `)

    const s = svc()

    // ops_audit_log.actor_ops_member_id has no ON DELETE CASCADE, so once this test writes an
    // audit-log row for opsAdminUser (both write RPCs call ops_audit_log_append), its
    // kinnso_ops_members row -- and therefore its auth.users row -- becomes permanently
    // undeletable, the same immutability shape as R10.2's payout ledger. Upsert-ignore so a
    // second run against leftover state doesn't collide.
    const admin = await s.from('kinnso_ops_members').upsert(
      { user_id: opsAdminUser, display_name: `R11.2 Admin ${runId}`, role: 'admin', status: 'active' },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
    if (admin.error) throw admin.error

    const merchant = await s.from('merchant_profiles').insert({
      user_id: merchantUser, company_name: `R11.2 Merchant ${runId}`, contact_email: `r11-2-merchant-${runId}@example.test`,
    }).select('id').single()
    if (merchant.error) throw merchant.error
    merchantProfileId = merchant.data!.id

    const otherMerchant = await s.from('merchant_profiles').insert({
      user_id: otherMerchantUser, company_name: `R11.2 Other Merchant ${runId}`, contact_email: `r11-2-other-merchant-${runId}@example.test`,
    }).select('id').single()
    if (otherMerchant.error) throw otherMerchant.error
    otherMerchantProfileId = otherMerchant.data!.id

    const missionA = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId, mission_source: 'merchant', mission_type: 'paid',
      visibility: 'open', status: 'published', title: `R11.2 Budget Mission A ${runId}`,
      summary: 'Paid mission used to prove the budget funding gate', paid_fee_amount: 150, paid_fee_currency: 'HKD',
      coupon_code: `R112A${runId.slice(-6)}`, coupon_url: 'https://example.com/r11-2-a', published_at: new Date().toISOString(),
    }).select('id').single()
    if (missionA.error) throw missionA.error
    missionAId = missionA.data!.id

    const missionA3 = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId, mission_source: 'merchant', mission_type: 'paid',
      visibility: 'open', status: 'published', title: `R11.2 Budget Mission A3 ${runId}`,
      summary: 'Second paid mission on the same merchant, used for the unenforced scenario', paid_fee_amount: 60, paid_fee_currency: 'HKD',
      coupon_code: `R112A3${runId.slice(-6)}`, coupon_url: 'https://example.com/r11-2-a3', published_at: new Date().toISOString(),
    }).select('id').single()
    if (missionA3.error) throw missionA3.error
    missionA3Id = missionA3.data!.id

    const missionA4 = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId, mission_source: 'merchant', mission_type: 'paid',
      visibility: 'open', status: 'published', title: `R11.2 Budget Mission A4 ${runId}`,
      summary: 'Auto-approve mission with a fee larger than the budget, used for the R11.1 interaction',
      paid_fee_amount: 200, paid_fee_currency: 'HKD', auto_approve_policy: 'verified_signal_only',
      coupon_code: `R112A4${runId.slice(-6)}`, coupon_url: 'https://example.com/r11-2-a4', published_at: new Date().toISOString(),
    }).select('id').single()
    if (missionA4.error) throw missionA4.error
    missionA4Id = missionA4.data!.id

    const missionB = await s.from('missions').insert({
      merchant_profile_id: otherMerchantProfileId, mission_source: 'merchant', mission_type: 'paid',
      visibility: 'open', status: 'published', title: `R11.2 Budget Mission B ${runId}`,
      summary: 'Paid mission on an unfunded merchant with no budget row at all', paid_fee_amount: 80, paid_fee_currency: 'HKD',
      coupon_code: `R112B${runId.slice(-6)}`, coupon_url: 'https://example.com/r11-2-b', published_at: new Date().toISOString(),
    }).select('id').single()
    if (missionB.error) throw missionB.error
    missionBId = missionB.data!.id

    const participantA = await s.from('mission_participants').insert({
      mission_id: missionAId, creator_id: creatorUser, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantA.error) throw participantA.error
    participantAId = participantA.data!.id

    const participantA3 = await s.from('mission_participants').insert({
      mission_id: missionA3Id, creator_id: creatorUser, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantA3.error) throw participantA3.error
    participantA3Id = participantA3.data!.id

    const participantA4 = await s.from('mission_participants').insert({
      mission_id: missionA4Id, creator_id: creatorUser, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantA4.error) throw participantA4.error
    participantA4Id = participantA4.data!.id

    const participantB = await s.from('mission_participants').insert({
      mission_id: missionBId, creator_id: creatorUser, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participantB.error) throw participantB.error
    participantBId = participantB.data!.id
  }, hookTimeout)

  afterAll(async () => {
    // merchant_budget_transactions.merchant_budget_id has NO on-delete-cascade (Task 1's own
    // migration: `references public.merchant_budgets(id)` with no cascade clause) -- unlike
    // every other FK in this fixture's chain, the auth.users cascade cannot reach through it.
    // Left alone, deleting merchant_profiles below would fail with a foreign-key violation on
    // any budget row that has ledger entries. Clear the ledger and the budget row explicitly
    // first, THEN let the auth.users delete cascade through merchant_profiles -> missions ->
    // mission_participants -> mission_milestones -> mission_milestone_submissions ->
    // mission_settlements as usual.
    //
    // opsAdminUser is deliberately NOT deleted -- once either write RPC writes an
    // ops_audit_log row for it, its kinnso_ops_members row (and therefore its auth.users row)
    // becomes permanently undeletable, the same immutability shape as R10.2's payout ledger.
    // The upsert-ignore in beforeAll makes this safe to leave behind across runs.
    const s = svc()
    if (merchantBudgetId) {
      await s.from('merchant_budget_transactions').delete().eq('merchant_budget_id', merchantBudgetId)
      await s.from('merchant_budgets').delete().eq('id', merchantBudgetId)
    }
    await runPsql(`
      delete from auth.users where id in ('${creatorUser}', '${merchantUser}', '${otherMerchantUser}', '${nonAdminOpsUser}');
    `)
  }, hookTimeout)

  it('roadmap acceptance: an enforced budget below the fee blocks approval atomically', async () => {
    const ops = clientFor(opsAdminUser)
    const s = svc()

    const credit = await ops.rpc('admin_credit_merchant_budget', {
      p_merchant_profile_id: merchantProfileId, p_amount: 100, p_reason: 'Pilot funding',
    })
    expect(credit.error).toBeNull()

    const budgetRow = await s.from('merchant_budgets').select('id').eq('merchant_profile_id', merchantProfileId).single()
    if (budgetRow.error) throw budgetRow.error
    merchantBudgetId = budgetRow.data!.id

    const enforceOn = await ops.rpc('admin_set_budget_enforcement', {
      p_merchant_profile_id: merchantProfileId, p_enforced: true, p_reason: 'Pilot go-live',
    })
    expect(enforceOn.error).toBeNull()

    submissionA1Id = await submitFresh(missionAId, participantAId, 'a1-first-try')

    const approve = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionA1Id, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(approve.error).not.toBeNull()
    expect(/insufficient_budget/i.test(`${approve.error?.message}`)).toBe(true)

    const submission = await s.from('mission_milestone_submissions').select('status').eq('id', submissionA1Id).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('submitted')

    const settlements = await s.from('mission_settlements').select('id').eq('mission_participant_id', participantAId)
    if (settlements.error) throw settlements.error
    expect(settlements.data).toEqual([])

    const budget = await s.from('merchant_budgets').select('balance').eq('id', merchantBudgetId).single()
    if (budget.error) throw budget.error
    expect(Number(budget.data!.balance)).toBe(100)

    const debits = await s.from('merchant_budget_transactions').select('id').eq('merchant_budget_id', merchantBudgetId).eq('kind', 'debit')
    if (debits.error) throw debits.error
    expect(debits.data).toEqual([])
  }, testTimeout)

  it('funded approval debits exactly once', async () => {
    const ops = clientFor(opsAdminUser)
    const s = svc()

    const credit = await ops.rpc('admin_credit_merchant_budget', {
      p_merchant_profile_id: merchantProfileId, p_amount: 100, p_reason: 'Top-up to cover the fee',
    })
    expect(credit.error).toBeNull()

    const approve = await ops.rpc('admin_review_submission', {
      p_submission_id: submissionA1Id, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(approve.error).toBeNull()

    const submission = await s.from('mission_milestone_submissions').select('status').eq('id', submissionA1Id).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('approved')

    const settlement = await s.from('mission_settlements').select('id, paid_fee_amount, amount_currency')
      .eq('mission_participant_id', participantAId).single()
    if (settlement.error) throw settlement.error
    expect(Number(settlement.data!.paid_fee_amount)).toBe(150)
    expect(settlement.data!.amount_currency).toBe('HKD')
    settlementAId = settlement.data!.id

    const budget = await s.from('merchant_budgets').select('balance').eq('id', merchantBudgetId).single()
    if (budget.error) throw budget.error
    expect(Number(budget.data!.balance)).toBe(50)

    const debits = await s.from('merchant_budget_transactions').select('amount, balance_after, source_ref')
      .eq('merchant_budget_id', merchantBudgetId).eq('kind', 'debit')
    if (debits.error) throw debits.error
    expect(debits.data).toHaveLength(1)
    expect(Number(debits.data![0].amount)).toBe(-150)
    expect(Number(debits.data![0].balance_after)).toBe(50)
    expect(debits.data![0].source_ref).toBe(`settlement:${settlementAId}`)
  }, testTimeout)

  it('revision-flap never double-debits: re-approving the same participant mints no second settlement or debit', async () => {
    const ops = clientFor(opsAdminUser)
    const s = svc()

    // mission_settlements_participant_fee_uniq already blocks a second settlement for the same
    // participant (R10.1's own dedupe) -- this proves the budget debit inherits that guarantee
    // for free, because the trigger only fires on an actual INSERT into mission_settlements.
    const flapSubmissionId = await submitFresh(missionAId, participantAId, 'a1-revision-flap')
    const approve = await ops.rpc('admin_review_submission', {
      p_submission_id: flapSubmissionId, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(approve.error).toBeNull()

    const submission = await s.from('mission_milestone_submissions').select('status').eq('id', flapSubmissionId).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('approved')

    const settlements = await s.from('mission_settlements').select('id').eq('mission_participant_id', participantAId)
    if (settlements.error) throw settlements.error
    expect(settlements.data).toHaveLength(1)
    expect(settlements.data![0].id).toBe(settlementAId)

    const debits = await s.from('merchant_budget_transactions').select('id').eq('merchant_budget_id', merchantBudgetId).eq('kind', 'debit')
    if (debits.error) throw debits.error
    expect(debits.data).toHaveLength(1)

    const budget = await s.from('merchant_budgets').select('balance').eq('id', merchantBudgetId).single()
    if (budget.error) throw budget.error
    expect(Number(budget.data!.balance)).toBe(50)
  }, testTimeout)

  it('unenforced behaves as today: an unfunded merchant approves fine, and an existing-but-unenforced budget skips the debit', async () => {
    const ops = clientFor(opsAdminUser)
    const s = svc()

    const enforceOff = await ops.rpc('admin_set_budget_enforcement', {
      p_merchant_profile_id: merchantProfileId, p_enforced: false, p_reason: 'Pause enforcement for the unenforced scenario',
    })
    expect(enforceOff.error).toBeNull()

    // 4a: a merchant with NO merchant_budgets row at all -- the trigger's `for update` select
    // finds nothing and returns early, so the fee mint proceeds exactly as it did before this
    // phase shipped.
    const freshSubmissionB = await submitFresh(missionBId, participantBId, 'b-unfunded')
    const approveB = await ops.rpc('admin_review_submission', {
      p_submission_id: freshSubmissionB, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(approveB.error).toBeNull()

    const submissionB = await s.from('mission_milestone_submissions').select('status').eq('id', freshSubmissionB).single()
    if (submissionB.error) throw submissionB.error
    expect(submissionB.data!.status).toBe('approved')

    const settlementB = await s.from('mission_settlements').select('id').eq('mission_participant_id', participantBId)
    if (settlementB.error) throw settlementB.error
    expect(settlementB.data).toHaveLength(1)

    const otherMerchantBudget = await s.from('merchant_budgets').select('id').eq('merchant_profile_id', otherMerchantProfileId)
    if (otherMerchantBudget.error) throw otherMerchantBudget.error
    expect(otherMerchantBudget.data).toEqual([])

    // 4b: the row exists (merchantProfileId) but enforcement is now off -- a DIFFERENT
    // mission/participant on the same merchant approves and mints a settlement, but the
    // balance and ledger are untouched.
    const freshSubmissionA3 = await submitFresh(missionA3Id, participantA3Id, 'a3-unenforced')
    const approveA3 = await ops.rpc('admin_review_submission', {
      p_submission_id: freshSubmissionA3, p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(approveA3.error).toBeNull()

    const settlementA3 = await s.from('mission_settlements').select('id').eq('mission_participant_id', participantA3Id)
    if (settlementA3.error) throw settlementA3.error
    expect(settlementA3.data).toHaveLength(1)

    const debits = await s.from('merchant_budget_transactions').select('id').eq('merchant_budget_id', merchantBudgetId).eq('kind', 'debit')
    if (debits.error) throw debits.error
    expect(debits.data).toHaveLength(1) // still just the one from the funded-approval test

    const budget = await s.from('merchant_budgets').select('balance').eq('id', merchantBudgetId).single()
    if (budget.error) throw budget.error
    expect(Number(budget.data!.balance)).toBe(50)
  }, testTimeout)

  it('ledger floor: an over-large negative credit is rejected and the balance is unchanged', async () => {
    const ops = clientFor(opsAdminUser)
    const s = svc()

    const clawback = await ops.rpc('admin_credit_merchant_budget', {
      p_merchant_profile_id: merchantProfileId, p_amount: -100000, p_reason: 'Attempted over-large clawback',
    })
    expect(clawback.error).not.toBeNull()
    expect(/insufficient_budget/i.test(`${clawback.error?.message}`)).toBe(true)

    const budget = await s.from('merchant_budgets').select('balance').eq('id', merchantBudgetId).single()
    if (budget.error) throw budget.error
    expect(Number(budget.data!.balance)).toBe(50)
  }, testTimeout)

  it('RLS: the owning merchant reads their budget and ledger; an unrelated merchant reads neither; both write RPCs reject a non-admin caller', async () => {
    // Capture state up front rather than asserting a hardcoded literal afterward -- this
    // test only cares that the denied calls below wrote NOTHING, not what the incoming
    // state happens to be (which the prior test in this file already left as enforced=false;
    // asserting that literal here would silently start passing for the wrong reason if this
    // file's test order or an earlier test's cleanup ever changed).
    const before = await svc().from('merchant_budgets').select('balance, enforced').eq('id', merchantBudgetId).single()
    if (before.error) throw before.error

    const merchantClient = clientFor(merchantUser)
    const ownBudget = await merchantClient.from('merchant_budgets').select('id').eq('id', merchantBudgetId)
    expect(ownBudget.error).toBeNull()
    expect(ownBudget.data).toHaveLength(1)

    const ownLedger = await merchantClient.from('merchant_budget_transactions').select('id').eq('merchant_budget_id', merchantBudgetId)
    expect(ownLedger.error).toBeNull()
    expect(ownLedger.data!.length).toBeGreaterThan(0)

    const otherMerchantClient = clientFor(otherMerchantUser)
    const strayerBudget = await otherMerchantClient.from('merchant_budgets').select('id').eq('id', merchantBudgetId)
    expect(strayerBudget.error).toBeNull()
    expect(strayerBudget.data).toEqual([])

    const strayerLedger = await otherMerchantClient.from('merchant_budget_transactions').select('id').eq('merchant_budget_id', merchantBudgetId)
    expect(strayerLedger.error).toBeNull()
    expect(strayerLedger.data).toEqual([])

    const nonAdmin = clientFor(nonAdminOpsUser)
    const deniedCredit = await nonAdmin.rpc('admin_credit_merchant_budget', {
      p_merchant_profile_id: merchantProfileId, p_amount: 10, p_reason: 'Should be forbidden',
    })
    expect(deniedCredit.error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${deniedCredit.error?.message} ${deniedCredit.error?.code}`)).toBe(true)

    const deniedEnforce = await nonAdmin.rpc('admin_set_budget_enforcement', {
      p_merchant_profile_id: merchantProfileId, p_enforced: true, p_reason: 'Should be forbidden',
    })
    expect(deniedEnforce.error).not.toBeNull()
    expect(/forbidden|42501/i.test(`${deniedEnforce.error?.message} ${deniedEnforce.error?.code}`)).toBe(true)

    // Neither denied call should have written anything -- compare against the state
    // captured at the start of this test, not a hardcoded literal.
    const budget = await svc().from('merchant_budgets').select('balance, enforced').eq('id', merchantBudgetId).single()
    if (budget.error) throw budget.error
    expect(Number(budget.data!.balance)).toBe(Number(before.data!.balance))
    expect(budget.data!.enforced).toBe(before.data!.enforced)
  }, testTimeout)

  it('funded_merchant_profiles: reflects enforcement toggling, and is readable from a plain creator session', async () => {
    const ops = clientFor(opsAdminUser)
    const creator = clientFor(creatorUser)

    const enforceOn = await ops.rpc('admin_set_budget_enforcement', {
      p_merchant_profile_id: merchantProfileId, p_enforced: true, p_reason: 'Re-enable for the funded-profiles check',
    })
    expect(enforceOn.error).toBeNull()

    const whileOn = await creator.rpc('funded_merchant_profiles')
    expect(whileOn.error).toBeNull()
    expect((whileOn.data as string[]).includes(merchantProfileId)).toBe(true)
    expect((whileOn.data as string[]).includes(otherMerchantProfileId)).toBe(false)

    const enforceOff = await ops.rpc('admin_set_budget_enforcement', {
      p_merchant_profile_id: merchantProfileId, p_enforced: false, p_reason: 'Disable again after the funded-profiles check',
    })
    expect(enforceOff.error).toBeNull()

    const whileOff = await creator.rpc('funded_merchant_profiles')
    expect(whileOff.error).toBeNull()
    expect((whileOff.data as string[]).includes(merchantProfileId)).toBe(false)
  }, testTimeout)

  it('unfunded auto-approval leaves the submission in the queue: R11.1s trigger hits the budget gate and downgrades to a warning', async () => {
    const ops = clientFor(opsAdminUser)
    const s = svc()

    // Re-enable enforcement with the balance still at 50 -- missionA4's fee (200) exceeds it,
    // so the R11.1 auto-approve trigger's own inner update-and-mint will hit insufficient_budget.
    const enforceOn = await ops.rpc('admin_set_budget_enforcement', {
      p_merchant_profile_id: merchantProfileId, p_enforced: true, p_reason: 'Re-enable for the auto-approve interaction test',
    })
    expect(enforceOn.error).toBeNull()

    const autoSubmissionId = await submitFresh(missionA4Id, participantA4Id, 'a4-auto-approve-underfunded')

    const job = await s.from('mission_verification_jobs').insert({
      mission_milestone_submission_id: autoSubmissionId, creator_id: creatorUser, status: 'queued',
    }).select('id').single()
    if (job.error) throw job.error

    // The R11.1 trigger's own exception handler (notify_verification_auto_approve, R11.1) wraps
    // its inner update+mint in begin/exception when others -- so this outer UPDATE must succeed
    // even though the debit trigger raises insufficient_budget deep inside it; only the inner
    // work rolls back to the implicit savepoint.
    const ready = await s.from('mission_verification_jobs')
      .update({ status: 'ready', confidence_status: 'verified_signal' })
      .eq('id', job.data!.id)
      .select('status, confidence_status')
      .single()
    if (ready.error) throw ready.error
    expect(ready.data!.status).toBe('ready')
    expect(ready.data!.confidence_status).toBe('verified_signal')

    const submission = await s.from('mission_milestone_submissions').select('status').eq('id', autoSubmissionId).single()
    if (submission.error) throw submission.error
    expect(submission.data!.status).toBe('submitted')

    const settlement = await s.from('mission_settlements').select('id').eq('mission_participant_id', participantA4Id)
    if (settlement.error) throw settlement.error
    expect(settlement.data).toEqual([])

    const budget = await s.from('merchant_budgets').select('balance').eq('id', merchantBudgetId).single()
    if (budget.error) throw budget.error
    expect(Number(budget.data!.balance)).toBe(50)

    const events = await s.from('mission_review_events').select('id').eq('submission_id', autoSubmissionId)
    if (events.error) throw events.error
    expect(events.data).toEqual([]) // the events insert lives inside the same rolled-back block

    await s.from('missions').update({ auto_approve_policy: 'off' }).eq('id', missionA4Id)
  }, testTimeout)
})
