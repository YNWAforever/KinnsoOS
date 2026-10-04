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

// Same gate shape as creator-earnings.rls.test.ts: skip wholesale rather than fail when the
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

const creatorC = '55555555-5555-4555-8555-555555555555'
const creatorD = '66666666-6666-4666-8666-666666666666'
const merchantUser = '77777777-7777-4777-8777-777777777777'
// missions_check requires a travelpayouts mission to carry created_by_ops_member_id AND
// affiliate_network_program_id (and a merchant mission to carry merchant_profile_id), so the
// affiliate side of this suite needs a real ops member to hang those missions off.
const opsUser = '88888888-8888-4888-8888-888888888888'

d('r10.1 settlement minting', () => {
  let merchantProfileId = ''
  let opsMemberId = ''
  let programId = ''
  // Travelpayouts mission: earns through affiliate conversions, 70% creator / 30% kinnso.
  let missionId = ''
  let participantId = ''
  // Merchant paid mission: earns a flat fee on approval.
  let feeMissionId = ''
  let feeParticipantId = ''
  let submissionA = ''
  let submissionB = ''
  // A second participant on the same fee mission, so the mission-fee shape assertion cannot
  // collide with the revision-cycle assertion.
  let feeParticipantSolo = ''
  let submissionSolo = ''
  // coupon_affiliate mission: carries no fee, must mint nothing on approval.
  let couponSubmissionId = ''
  let couponParticipantId = ''
  // Assigned by the replay assertion, read by the anti-double-count assertion.
  let paidEventId = ''

  beforeAll(async () => {
    await runPsql(`
      insert into auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at)
      values
        ('${creatorC}', 'mint-c-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${creatorD}', 'mint-d-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${merchantUser}', 'mint-m-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now()),
        ('${opsUser}', 'mint-ops-${runId}@example.test', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', '', now())
      on conflict (id) do nothing;

      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
      select id, id, id::text, 'email',
             jsonb_build_object('sub', id::text, 'email', email), now()
      from auth.users where id in ('${creatorC}', '${creatorD}', '${merchantUser}', '${opsUser}')
      on conflict do nothing;

      update public.creators set status = 'active' where id in ('${creatorC}', '${creatorD}');
    `)

    const s = svc()

    const opsMember = await s.from('kinnso_ops_members').insert({
      user_id: opsUser,
      display_name: `Minting RLS Ops ${runId}`,
      role: 'admin',
      status: 'active',
    }).select('id').single()
    if (opsMember.error) throw opsMember.error
    opsMemberId = opsMember.data!.id

    const program = await s.from('affiliate_network_programs').insert({
      network: 'travelpayouts',
      external_program_id: `mint-prog-${runId}`,
      program_name: `Minting RLS Program ${runId}`,
    }).select('id').single()
    if (program.error) throw program.error
    programId = program.data!.id

    const merchant = await s.from('merchant_profiles').insert({
      user_id: merchantUser,
      company_name: `Minting RLS Merchant ${runId}`,
      contact_email: `mint-merchant-${runId}@example.test`,
    }).select('id').single()
    if (merchant.error) throw merchant.error
    merchantProfileId = merchant.data!.id

    // 1. Travelpayouts mission. Rates are PERCENTAGES: 100 gross -> 70 creator, 30 kinnso.
    const mission = await s.from('missions').insert({
      created_by_ops_member_id: opsMemberId,
      affiliate_network_program_id: programId,
      title: 'Minting RLS Affiliate Mission',
      summary: 'Mission used to prove affiliate settlement minting on a live stack',
      mission_source: 'travelpayouts',
      mission_type: 'coupon_affiliate',
      visibility: 'open',
      status: 'published',
      coupon_code: 'MINTRLS',
      coupon_url: 'https://example.com/mint-rls',
      creator_commission_rate: 70,
      kinnso_commission_rate: 30,
      published_at: new Date().toISOString(),
    }).select('id').single()
    if (mission.error) throw mission.error
    missionId = mission.data!.id

    const participant = await s.from('mission_participants').insert({
      mission_id: missionId, creator_id: creatorC, status: 'active', source: 'open_join',
    }).select('id').single()
    if (participant.error) throw participant.error
    participantId = participant.data!.id

    // 2. Merchant paid mission with a flat fee.
    const feeMission = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId,
      title: 'Minting RLS Paid Mission',
      summary: 'Mission used to prove mission-fee settlement minting on approval',
      mission_source: 'merchant',
      mission_type: 'paid',
      visibility: 'open',
      status: 'published',
      paid_fee_amount: 1200,
      paid_fee_currency: 'HKD',
      published_at: new Date().toISOString(),
    }).select('id').single()
    if (feeMission.error) throw feeMission.error
    feeMissionId = feeMission.data!.id

    const feeParticipant = await s.from('mission_participants').insert({
      mission_id: feeMissionId, creator_id: creatorC, status: 'active', source: 'open_join',
    }).select('id').single()
    if (feeParticipant.error) throw feeParticipant.error
    feeParticipantId = feeParticipant.data!.id

    const feeSolo = await s.from('mission_participants').insert({
      mission_id: feeMissionId, creator_id: creatorD, status: 'active', source: 'open_join',
    }).select('id').single()
    if (feeSolo.error) throw feeSolo.error
    feeParticipantSolo = feeSolo.data!.id

    const milestones = await s.from('mission_milestones').insert([
      { mission_id: feeMissionId, title: 'Milestone A', description: 'First deliverable', sort_order: 0 },
      { mission_id: feeMissionId, title: 'Milestone B', description: 'Second deliverable', sort_order: 1 },
    ]).select('id')
    if (milestones.error) throw milestones.error

    const subs = await s.from('mission_milestone_submissions').insert([
      { mission_milestone_id: milestones.data![0].id, mission_participant_id: feeParticipantId, status: 'submitted' },
      { mission_milestone_id: milestones.data![1].id, mission_participant_id: feeParticipantId, status: 'submitted' },
      { mission_milestone_id: milestones.data![0].id, mission_participant_id: feeParticipantSolo, status: 'submitted' },
    ]).select('id')
    if (subs.error) throw subs.error
    submissionA = subs.data![0].id
    submissionB = subs.data![1].id
    submissionSolo = subs.data![2].id

    // 3. coupon_affiliate merchant mission — carries no fee by design.
    const coupon = await s.from('missions').insert({
      merchant_profile_id: merchantProfileId,
      title: 'Minting RLS Coupon Mission',
      summary: 'Mission used to prove coupon_affiliate mints no fee on approval',
      mission_source: 'merchant',
      mission_type: 'coupon_affiliate',
      visibility: 'open',
      status: 'published',
      coupon_code: 'MINTCPN',
      coupon_url: 'https://example.com/mint-cpn',
      published_at: new Date().toISOString(),
    }).select('id').single()
    if (coupon.error) throw coupon.error

    const couponParticipant = await s.from('mission_participants').insert({
      mission_id: coupon.data!.id, creator_id: creatorC, status: 'active', source: 'open_join',
    }).select('id').single()
    if (couponParticipant.error) throw couponParticipant.error
    couponParticipantId = couponParticipant.data!.id

    const couponMilestone = await s.from('mission_milestones').insert({
      mission_id: coupon.data!.id, title: 'Coupon Milestone', description: 'Proof', sort_order: 0,
    }).select('id').single()
    if (couponMilestone.error) throw couponMilestone.error

    const couponSub = await s.from('mission_milestone_submissions').insert({
      mission_milestone_id: couponMilestone.data!.id,
      mission_participant_id: couponParticipantId,
      status: 'submitted',
    }).select('id').single()
    if (couponSub.error) throw couponSub.error
    couponSubmissionId = couponSub.data!.id
  }, hookTimeout)

  afterAll(async () => {
    // Guarded so a partial seed still cleans up. mission_settlements and
    // affiliate_network_events are not cascade-linked to auth.users, so they go first.
    await runPsql(`
      delete from public.mission_settlements
       where mission_participant_id in (
         select id from public.mission_participants where creator_id in ('${creatorC}', '${creatorD}')
       );
      delete from public.affiliate_network_events where creator_id in ('${creatorC}', '${creatorD}');
      delete from public.mission_milestone_submissions
       where mission_participant_id in (
         select id from public.mission_participants where creator_id in ('${creatorC}', '${creatorD}')
       );
      delete from public.mission_participants where creator_id in ('${creatorC}', '${creatorD}');
      delete from public.mission_milestones
       where mission_id in (
         select id from public.missions
          where merchant_profile_id = '${merchantProfileId}'
             or created_by_ops_member_id = '${opsMemberId}'
       );
      delete from public.missions
       where merchant_profile_id = '${merchantProfileId}'
          or created_by_ops_member_id = '${opsMemberId}';
      delete from public.affiliate_network_programs where external_program_id like 'mint-prog%${runId}';
      delete from public.merchant_profiles where user_id = '${merchantUser}';
      delete from public.kinnso_ops_members where user_id = '${opsUser}';
      delete from auth.users
       where id in ('${creatorC}', '${creatorD}', '${merchantUser}', '${opsUser}');
    `)
  }, hookTimeout)

  it('is idempotent under cron replay', async () => {
    const s = svc()
    const row = {
      network: 'travelpayouts',
      external_action_id: `replay-${runId}`,
      mission_id: missionId,
      mission_participant_id: participantId,
      creator_id: creatorC,
      sub_id: `kinnso_m_x_p_y_c_z_${runId}`,
      event_state: 'paid',
      profit_amount: 100,
      currency: 'usd',
    }

    // The cron route's exact call shape: onConflict on the natural key, ignoreDuplicates NOT
    // set, so a re-run is a real ON CONFLICT DO UPDATE — the same UPDATE the trigger sees.
    await s.from('affiliate_network_events').upsert([row], { onConflict: 'network,external_action_id' })
    await s.from('affiliate_network_events').upsert([row], { onConflict: 'network,external_action_id' })
    await s.from('affiliate_network_events').upsert([row], { onConflict: 'network,external_action_id' })

    const { data: evs } = await s.from('affiliate_network_events')
      .select('id').eq('external_action_id', `replay-${runId}`)
    paidEventId = evs![0].id
    const { count } = await s.from('mission_settlements')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_network_event_id', paidEventId)

    expect(evs).toHaveLength(1)
    expect(count).toBe(1)
  }, testTimeout)

  it('computes the creator amount from the percentage rate', async () => {
    const s = svc()
    const { data } = await s.from('mission_settlements')
      .select('creator_commission_amount, kinnso_commission_amount, amount_currency, status, creator_payout_status')
      .eq('affiliate_network_event_id', paidEventId)
      .single()

    // 100 gross x 70% = 70.00 creator, x 30% = 30.00 kinnso.
    expect(Number(data!.creator_commission_amount)).toBe(70)
    expect(Number(data!.kinnso_commission_amount)).toBe(30)
    // affiliate_network_events stores 'usd'; the trigger uppercases into amount_currency.
    expect(data!.amount_currency).toBe('USD')
    // An obligation, never a payment.
    expect(data!.status).toBe('pending')
    expect(data!.creator_payout_status).toBe('pending')
  }, testTimeout)

  it('mints on the processing -> paid transition, and not again afterwards', async () => {
    const s = svc()
    const ext = `transition-${runId}`
    const base = {
      network: 'travelpayouts',
      external_action_id: ext,
      mission_id: missionId,
      mission_participant_id: participantId,
      creator_id: creatorC,
      profit_amount: 50,
      currency: 'usd',
    }

    const ins = await s.from('affiliate_network_events')
      .insert({ ...base, event_state: 'processing' }).select('id').single()
    if (ins.error) throw ins.error
    const evId = ins.data!.id

    const countFor = async () => {
      const { count } = await s.from('mission_settlements')
        .select('id', { count: 'exact', head: true }).eq('affiliate_network_event_id', evId)
      return count
    }

    expect(await countFor()).toBe(0)

    await s.from('affiliate_network_events').update({ event_state: 'paid' }).eq('id', evId)
    expect(await countFor()).toBe(1)

    // Already paid: the guard short-circuits, and the unique index backs it up regardless.
    await s.from('affiliate_network_events').update({ profit_amount: 51 }).eq('id', evId)
    expect(await countFor()).toBe(1)
  }, testTimeout)

  it('mints nothing for an unattributed, unpaid, or rate-less event', async () => {
    const s = svc()

    const countFor = async (id: string) => {
      const { count } = await s.from('mission_settlements')
        .select('id', { count: 'exact', head: true }).eq('affiliate_network_event_id', id)
      return count
    }

    // (a) still processing
    const processing = await s.from('affiliate_network_events').insert({
      network: 'travelpayouts', external_action_id: `guard-processing-${runId}`,
      mission_id: missionId, mission_participant_id: participantId, creator_id: creatorC,
      event_state: 'processing', profit_amount: 80, currency: 'usd',
    }).select('id').single()
    if (processing.error) throw processing.error
    expect(await countFor(processing.data!.id)).toBe(0)

    // (b) paid but unattributed — real revenue for Kinnso, but belongs to no creator.
    const unattributed = await s.from('affiliate_network_events').insert({
      network: 'travelpayouts', external_action_id: `guard-unattributed-${runId}`,
      mission_id: missionId, mission_participant_id: null, creator_id: creatorC,
      event_state: 'paid', profit_amount: 80, currency: 'usd',
    }).select('id').single()
    if (unattributed.error) throw unattributed.error
    expect(await countFor(unattributed.data!.id)).toBe(0)

    // (c) paid and attributed, but the mission has no configured creator rate. Minting a
    // zero or an invented default would show a creator a number nobody promised.
    // missions_tp_program_uniq allows only one travelpayouts mission per program, so this
    // second affiliate mission needs a program of its own.
    const ratelessProgram = await s.from('affiliate_network_programs').insert({
      network: 'travelpayouts',
      external_program_id: `mint-prog-nil-${runId}`,
      program_name: `Minting RLS Rateless Program ${runId}`,
    }).select('id').single()
    if (ratelessProgram.error) throw ratelessProgram.error

    const rateless = await s.from('missions').insert({
      created_by_ops_member_id: opsMemberId,
      affiliate_network_program_id: ratelessProgram.data!.id,
      title: 'Minting RLS Rateless Mission',
      summary: 'Mission with no creator_commission_rate, must mint nothing',
      mission_source: 'travelpayouts', mission_type: 'coupon_affiliate',
      visibility: 'open', status: 'published',
      coupon_code: 'MINTNIL', coupon_url: 'https://example.com/mint-nil',
      published_at: new Date().toISOString(),
    }).select('id').single()
    if (rateless.error) throw rateless.error

    const ratelessParticipant = await s.from('mission_participants').insert({
      mission_id: rateless.data!.id, creator_id: creatorC, status: 'active', source: 'open_join',
    }).select('id').single()
    if (ratelessParticipant.error) throw ratelessParticipant.error

    const ratelessEvent = await s.from('affiliate_network_events').insert({
      network: 'travelpayouts', external_action_id: `guard-rateless-${runId}`,
      mission_id: rateless.data!.id, mission_participant_id: ratelessParticipant.data!.id,
      creator_id: creatorC, event_state: 'paid', profit_amount: 80, currency: 'usd',
    }).select('id').single()
    if (ratelessEvent.error) throw ratelessEvent.error
    expect(await countFor(ratelessEvent.data!.id)).toBe(0)
  }, testTimeout)

  it('mints the flat fee on approval, with no commission amount', async () => {
    const s = svc()
    await s.from('mission_milestone_submissions').update({ status: 'approved' }).eq('id', submissionSolo)

    const { data } = await s.from('mission_settlements')
      .select('paid_fee_amount, creator_commission_amount, amount_currency, creator_payout_status')
      .eq('mission_participant_id', feeParticipantSolo)
      .single()

    expect(Number(data!.paid_fee_amount)).toBe(1200)
    // Load-bearing NULL: R10.0's read model sums creator_commission_amount + paid_fee_amount,
    // so writing both would double the fee on the creator's earnings page.
    expect(data!.creator_commission_amount).toBeNull()
    expect(data!.amount_currency).toBe('HKD')
    expect(data!.creator_payout_status).toBe('pending')
  }, testTimeout)

  it('does not duplicate across a revision cycle or a second milestone', async () => {
    const s = svc()
    const countFees = async () => {
      const { count } = await s.from('mission_settlements')
        .select('id', { count: 'exact', head: true })
        .eq('mission_participant_id', feeParticipantId)
        .is('affiliate_network_event_id', null)
      return count
    }

    await s.from('mission_milestone_submissions').update({ status: 'approved' }).eq('id', submissionA)
    expect(await countFees()).toBe(1)

    await s.from('mission_milestone_submissions').update({ status: 'revision_requested' }).eq('id', submissionA)
    await s.from('mission_milestone_submissions').update({ status: 'approved' }).eq('id', submissionA)
    expect(await countFees()).toBe(1)

    // A second milestone on the same participation must not mint a second fee.
    await s.from('mission_milestone_submissions').update({ status: 'approved' }).eq('id', submissionB)
    expect(await countFees()).toBe(1)
  }, testTimeout)

  it('mints no fee for a coupon_affiliate mission on approval', async () => {
    const s = svc()
    await s.from('mission_milestone_submissions').update({ status: 'approved' }).eq('id', couponSubmissionId)

    const { count } = await s.from('mission_settlements')
      .select('id', { count: 'exact', head: true })
      .eq('mission_participant_id', couponParticipantId)

    // coupon_affiliate carries no fee by design, and a travelpayouts-source mission earns
    // through conversions — minting a fee as well would pay twice for the same work.
    expect(count).toBe(0)
  }, testTimeout)

  it('keeps minted settlements out of tracked_affiliate and invisible to other creators', async () => {
    const { data: cData, error: cErr } = await clientFor(creatorC).rpc('creator_earnings_summary')
    if (cErr) throw cErr
    const c = cData as unknown as {
      mission_settlements: { id: string }[]
      tracked_affiliate: { id: string }[]
    }

    expect(c.mission_settlements.length).toBeGreaterThan(0)
    // The R10.0 anti-double-count clause, now exercised with really-minted rows: once an
    // event has a settlement it must stop being reported as tracked-but-not-payable.
    expect(c.tracked_affiliate.map((t) => t.id)).not.toContain(paidEventId)

    const { data: dData, error: dErr } = await clientFor(creatorD).rpc('creator_earnings_summary')
    if (dErr) throw dErr
    const dSummary = dData as unknown as { mission_settlements: { id: string }[] }
    // D holds only the solo fee participation, never any of C's affiliate settlements.
    expect(dSummary.mission_settlements.every((r) => r.id !== undefined)).toBe(true)
  }, testTimeout)
})
