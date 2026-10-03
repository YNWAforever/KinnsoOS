import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbContainer = process.env.SUPABASE_DB_CONTAINER
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'missing'
const d = svcKey && dbContainer && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? describe : describe.skip
const hookTimeout = 60000
const testTimeout = 15000
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

const anon = createClient(url, anonKey)
const svc = createClient(url, svcKey ?? 'missing')
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const userIdsByEmail = new Map<string, string>()

const creatorEmail = `mission-creator-${runId}@example.test`
const otherCreatorEmail = `mission-other-creator-${runId}@example.test`
const snapshotCreatorEmail = `mission-snapshot-creator-${runId}@example.test`
const partnerCreatorEmail = `mission-partner-creator-${runId}@example.test`
const merchantEmail = `mission-merchant-${runId}@example.test`
const opsEmail = `mission-ops-${runId}@example.test`

let creatorId = ''
let otherCreatorId = ''
let snapshotCreatorId = ''
let partnerCreatorId = ''
let merchantUserId = ''
let opsUserId = ''
let merchantProfileId = ''
let opsMemberId = ''
let missionId = ''
let targetedMissionId = ''
let travelpayoutsMissionId = ''
let affiliateProgramId = ''

const missionTableNames = [
  'merchant_profiles',
  'merchant_applications',
  'kinnso_ops_members',
  'affiliate_network_programs',
  'missions',
  'mission_participants',
  'mission_milestones',
  'mission_milestone_submissions',
  'mission_social_snapshots',
  'affiliate_partner_links',
  'affiliate_network_events',
  'mission_settlements',
  'bookings',
  'booking_settlements',
]

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function signTestJwt(userId: string, email: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64Url(
    JSON.stringify({
      aud: 'authenticated',
      exp: now + 3600,
      iat: now,
      iss: `${url}/auth/v1`,
      sub: userId,
      email,
      role: 'authenticated',
      aal: 'aal1',
      session_id: randomUUID(),
    }),
  )
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

async function runPsql(sql: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', dbContainer!, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'])
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

async function createTestUser(email: string) {
  const userId = randomUUID()

  await runPsql(`
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      ${sqlString(userId)},
      'authenticated',
      'authenticated',
      ${sqlString(email)},
      '',
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false,
      now(),
      now()
    );

    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      ${sqlString(userId)},
      ${sqlString(userId)},
      jsonb_build_object('sub', ${sqlString(userId)}, 'email', ${sqlString(email)}),
      'email',
      now(),
      now(),
      now()
    );
  `)

  userIdsByEmail.set(email, userId)
  return userId
}

async function authed(email: string) {
  const userId = userIdsByEmail.get(email)
  expect(userId).toBeTruthy()

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${signTestJwt(userId!, email)}` } },
  })
}

d('mission schema RLS', () => {
  beforeAll(async () => {
    creatorId = await createTestUser(creatorEmail)
    otherCreatorId = await createTestUser(otherCreatorEmail)
    snapshotCreatorId = await createTestUser(snapshotCreatorEmail)
    partnerCreatorId = await createTestUser(partnerCreatorEmail)
    merchantUserId = await createTestUser(merchantEmail)
    opsUserId = await createTestUser(opsEmail)

    const merchant = await svc
      .from('merchant_profiles')
      .insert({ user_id: merchantUserId, company_name: 'Kinnso Test Merchant', contact_email: merchantEmail })
      .select('id')
      .single()
    expect(merchant.error).toBeNull()
    merchantProfileId = merchant.data!.id

    const ops = await svc
      .from('kinnso_ops_members')
      .insert({ user_id: opsUserId, display_name: 'Ops Test', status: 'active' })
      .select('id')
      .single()
    expect(ops.error).toBeNull()
    opsMemberId = ops.data!.id

    const affiliateProgram = await svc
      .from('affiliate_network_programs')
      .upsert(
        {
          network: 'travelpayouts',
          external_program_id: 'tp-rls-program',
          program_name: 'Travelpayouts RLS Program',
          status: 'active',
        },
        { onConflict: 'network,external_program_id' },
      )
      .select('id')
      .single()
    expect(affiliateProgram.error).toBeNull()
    affiliateProgramId = affiliateProgram.data!.id

    const mission = await svc
      .from('missions')
      .insert({
        merchant_profile_id: merchantProfileId,
        title: 'RLS coupon mission',
        summary: 'Creator can see this after publish',
        mission_source: 'merchant',
        mission_type: 'coupon_affiliate',
        visibility: 'open',
        status: 'published',
        coupon_code: 'RLS10',
        coupon_url: 'https://example.com/rls',
        affiliate_commission_rate: 10,
        kinnso_commission_rate: 4,
        creator_commission_rate: 6,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(mission.error).toBeNull()
    missionId = mission.data!.id

    const targetedMission = await svc
      .from('missions')
      .insert({
        merchant_profile_id: merchantProfileId,
        title: 'Targeted paid mission',
        summary: 'Only invited creators should see this',
        mission_source: 'merchant',
        mission_type: 'paid',
        visibility: 'targeted',
        status: 'published',
        paid_fee_amount: 500,
        paid_fee_currency: 'HKD',
        application_instructions: 'Invite only',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(targetedMission.error).toBeNull()
    targetedMissionId = targetedMission.data!.id

    const travelpayoutsMission = await svc
      .from('missions')
      .insert({
        created_by_ops_member_id: opsMemberId,
        affiliate_network_program_id: affiliateProgramId,
        title: 'Travelpayouts affiliate mission',
        summary: 'Creators can auto-join and create tracked links',
        mission_source: 'travelpayouts',
        mission_type: 'coupon_affiliate',
        visibility: 'open',
        status: 'published',
        affiliate_commission_rate: 10,
        kinnso_commission_rate: 4,
        creator_commission_rate: 6,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(travelpayoutsMission.error).toBeNull()
    travelpayoutsMissionId = travelpayoutsMission.data!.id
  }, hookTimeout)

  afterAll(async () => {
    const missionIds = [missionId, targetedMissionId, travelpayoutsMissionId].filter(Boolean)
    if (missionIds.length > 0) await runPsql(`delete from public.missions where id in (${missionIds.map(sqlString).join(',')});`)

    const ids = [creatorId, otherCreatorId, snapshotCreatorId, partnerCreatorId, merchantUserId, opsUserId].filter(Boolean)
    if (ids.length > 0) await runPsql(`delete from auth.users where id in (${ids.map(sqlString).join(',')});`)
  }, hookTimeout)

  it('anon cannot read mission tables', async () => {
    for (const tableName of missionTableNames) {
      const { data, error } = await anon.from(tableName).select('id').limit(1)
      expect(error === null ? (data ?? []).length === 0 : /permission denied|42501/i.test(error.message)).toBe(
        true,
      )
    }
  }, testTimeout)

  it('merchant can read and update own mission', async () => {
    const merchant = await authed(merchantEmail)
    const { data, error } = await merchant.from('missions').select('id, title').eq('id', missionId).single()
    expect(error).toBeNull()
    expect(data!.title).toBe('RLS coupon mission')

    const update = await merchant.from('missions').update({ title: 'RLS coupon mission updated' }).eq('id', missionId)
    expect(update.error).toBeNull()
  }, testTimeout)

  it('creator can see published open missions and join once', async () => {
    const creator = await authed(creatorEmail)
    const visible = await creator.from('missions').select('id').eq('id', missionId).single()
    expect(visible.error).toBeNull()

    const joined = await creator
      .from('mission_participants')
      .insert({ mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join' })
      .select('id, status')
      .single()
    expect(joined.error).toBeNull()
    expect(joined.data!.status).toBe('active')

    const duplicate = await creator
      .from('mission_participants')
      .insert({ mission_id: missionId, creator_id: creatorId, status: 'active', source: 'open_join' })
    expect(duplicate.error).not.toBeNull()

    const selfApproved = await creator
      .from('mission_participants')
      .update({ status: 'completed', merchant_review_note: 'self-approved' })
      .eq('id', joined.data!.id)
      .select('id')
    expect(selfApproved.error === null ? selfApproved.data : []).toEqual([])

    const unchanged = await svc
      .from('mission_participants')
      .select('status, merchant_review_note')
      .eq('id', joined.data!.id)
      .single()
    expect(unchanged.error).toBeNull()
    expect(unchanged.data!.status).toBe('active')
    expect(unchanged.data!.merchant_review_note).toBeNull()
  }, testTimeout)

  it('targeted published missions are visible only to invited creators', async () => {
    const creator = await authed(creatorEmail)
    const hiddenBeforeInvite = await creator.from('missions').select('id').eq('id', targetedMissionId)
    expect(hiddenBeforeInvite.error).toBeNull()
    expect(hiddenBeforeInvite.data).toEqual([])

    const merchant = await authed(merchantEmail)
    const invite = await merchant
      .from('mission_participants')
      .insert({
        mission_id: targetedMissionId,
        creator_id: creatorId,
        status: 'invited',
        source: 'merchant_invite',
      })
      .select('id, status')
      .single()
    expect(invite.error).toBeNull()
    expect(invite.data!.status).toBe('invited')

    const visibleAfterInvite = await creator.from('missions').select('id').eq('id', targetedMissionId).single()
    expect(visibleAfterInvite.error).toBeNull()
    expect(visibleAfterInvite.data!.id).toBe(targetedMissionId)

    const rejected = await merchant
      .from('mission_participants')
      .update({ status: 'rejected' })
      .eq('id', invite.data!.id)
    expect(rejected.error).toBeNull()

    const hiddenAfterRejected = await creator.from('missions').select('id').eq('id', targetedMissionId)
    expect(hiddenAfterRejected.error).toBeNull()
    expect(hiddenAfterRejected.data).toEqual([])

    const otherCreator = await authed(otherCreatorEmail)
    const hiddenFromOtherCreator = await otherCreator.from('missions').select('id').eq('id', targetedMissionId)
    expect(hiddenFromOtherCreator.error).toBeNull()
    expect(hiddenFromOtherCreator.data).toEqual([])
  }, testTimeout)

  it('creator can read active affiliate network programs', async () => {
    const creator = await authed(creatorEmail)
    const { data, error } = await creator
      .from('affiliate_network_programs')
      .select('id, program_name')
      .eq('id', affiliateProgramId)
      .single()

    expect(error).toBeNull()
    expect(data!.program_name).toBe('Travelpayouts RLS Program')
  }, testTimeout)

  it('creator can create tracked links only for the joined Travelpayouts mission program', async () => {
    const creator = await authed(partnerCreatorEmail)
    const travelpayoutsParticipant = await creator
      .from('mission_participants')
      .insert({
        mission_id: travelpayoutsMissionId,
        creator_id: partnerCreatorId,
        status: 'active',
        source: 'affiliate_network_join',
      })
      .select('id')
      .single()
    expect(travelpayoutsParticipant.error).toBeNull()
    const travelpayoutsParticipantId = travelpayoutsParticipant.data!.id

    const trackedLink = await creator
      .from('affiliate_partner_links')
      .insert({
        affiliate_network_program_id: affiliateProgramId,
        mission_id: travelpayoutsMissionId,
        mission_participant_id: travelpayoutsParticipantId,
        creator_id: partnerCreatorId,
        network: 'travelpayouts',
        original_url: 'https://example.com/travel',
        partner_url: 'https://tp.example/partner',
        sub_id: 'partner-good-link',
        external_status: 'success',
      })
      .select('id, external_status, partner_url, sub_id')
      .single()
    expect(trackedLink.error).toBeNull()
    expect(trackedLink.data!.external_status).toBe('pending')
    expect(trackedLink.data!.partner_url).toBe('https://example.com/travel')
    expect(trackedLink.data!.sub_id).toMatch(/^pending:/)
    expect(trackedLink.data!.sub_id).not.toBe('partner-good-link')

    const expectedSubId = `kinnso_m_${travelpayoutsMissionId.replaceAll('-', '')}_p_${travelpayoutsParticipantId.replaceAll('-', '')}_c_${partnerCreatorId.replaceAll('-', '')}`
    const originalUrl = 'https://example.com/travel-rpc'
    const validPartnerUrl = `https://brand.tp.st/link?sub_id=${expectedSubId}`
    const rpcArgs = {
      p_affiliate_network_program_id: affiliateProgramId,
      p_mission_id: travelpayoutsMissionId,
      p_mission_participant_id: travelpayoutsParticipantId,
      p_original_url: originalUrl,
      p_partner_url: validPartnerUrl,
      p_sub_id: expectedSubId,
    }

    const anonAttempt = await anon.rpc('create_travelpayouts_partner_link', rpcArgs)
    expect(anonAttempt.error).not.toBeNull()

    const wrongOwner = await authed(otherCreatorEmail)
    const wrongOwnerSubId = `kinnso_m_${travelpayoutsMissionId.replaceAll('-', '')}_p_${travelpayoutsParticipantId.replaceAll('-', '')}_c_${otherCreatorId.replaceAll('-', '')}`
    const wrongOwnerAttempt = await wrongOwner.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_original_url: 'https://example.com/travel-rpc-wrong-owner',
      p_partner_url: `https://brand.tp.st/link?sub_id=${wrongOwnerSubId}`,
      p_sub_id: wrongOwnerSubId,
    })
    expect(wrongOwnerAttempt.error).not.toBeNull()

    const mismatchedMissionSubId = `kinnso_m_${missionId.replaceAll('-', '')}_p_${travelpayoutsParticipantId.replaceAll('-', '')}_c_${partnerCreatorId.replaceAll('-', '')}`
    const mismatchedMission = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_mission_id: missionId,
      p_original_url: 'https://example.com/travel-rpc-mismatched-mission',
      p_partner_url: `https://brand.tp.st/link?sub_id=${mismatchedMissionSubId}`,
      p_sub_id: mismatchedMissionSubId,
    })
    expect(mismatchedMission.error).not.toBeNull()

    const wrongSubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: 'https://brand.tp.st/link?sub_id=wrong',
      p_sub_id: 'wrong',
    })
    expect(wrongSubId.error).not.toBeNull()

    const offDomain = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: `https://example.net/link?sub_id=${expectedSubId}`,
    })
    expect(offDomain.error).not.toBeNull()

    const missingQuerySubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: 'https://brand.tp.st/link',
    })
    expect(missingQuerySubId.error).not.toBeNull()

    const transactionRpcOriginalUrl = 'https://example.com/travel-rpc-same-transaction'
    const transactionDirectOriginalUrl = 'https://example.com/travel-direct-same-transaction'
    await runPsql(`
      begin;
      select set_config('request.jwt.claim.sub', ${sqlString(partnerCreatorId)}, true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', ${sqlString(partnerCreatorId)}, 'role', 'authenticated')::text,
        true
      );
      set local role authenticated;

      do $test$
      declare
        v_rpc_id uuid;
        v_rpc_partner_url text;
        v_direct_status text;
        v_direct_partner_url text;
        v_direct_sub_id text;
      begin
        select created.id, created.partner_url
        into v_rpc_id, v_rpc_partner_url
        from public.create_travelpayouts_partner_link(
          ${sqlString(affiliateProgramId)}::uuid,
          ${sqlString(travelpayoutsMissionId)}::uuid,
          ${sqlString(travelpayoutsParticipantId)}::uuid,
          ${sqlString(transactionRpcOriginalUrl)},
          ${sqlString(validPartnerUrl)},
          ${sqlString(expectedSubId)}
        ) created;

        if v_rpc_id is null or v_rpc_partner_url <> ${sqlString(validPartnerUrl)} then
          raise exception 'same-transaction RPC did not persist the audited link';
        end if;

        if current_setting('app.bypass_partner_link_prepare', true) = 'on' then
          raise exception 'partner-link prepare bypass leaked past the RPC';
        end if;

        insert into public.affiliate_partner_links (
          affiliate_network_program_id,
          mission_id,
          mission_participant_id,
          creator_id,
          network,
          original_url,
          partner_url,
          sub_id,
          external_status
        )
        values (
          ${sqlString(affiliateProgramId)}::uuid,
          ${sqlString(travelpayoutsMissionId)}::uuid,
          ${sqlString(travelpayoutsParticipantId)}::uuid,
          ${sqlString(partnerCreatorId)}::uuid,
          'travelpayouts',
          ${sqlString(transactionDirectOriginalUrl)},
          'https://brand.tp.st/direct-should-be-rewritten',
          'direct-should-be-rewritten',
          'success'
        )
        returning external_status, partner_url, sub_id
        into v_direct_status, v_direct_partner_url, v_direct_sub_id;

        if v_direct_status <> 'pending'
          or v_direct_partner_url <> ${sqlString(transactionDirectOriginalUrl)}
          or v_direct_sub_id !~ '^pending:' then
          raise exception 'ordinary insert after RPC was not rewritten to pending';
        end if;
      end
      $test$;

      rollback;
    `)

    const fragmentOnlySubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: `https://brand.tp.st/link#sub_id=${expectedSubId}`,
    })
    expect(fragmentOnlySubId.error).not.toBeNull()

    const fragmentContainingSubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: `${validPartnerUrl}#details`,
    })
    expect(fragmentContainingSubId.error).not.toBeNull()

    const duplicateQuerySubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: `${validPartnerUrl}&sub_id=${expectedSubId}`,
    })
    expect(duplicateQuerySubId.error).not.toBeNull()

    const conflictingQuerySubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_partner_url: `${validPartnerUrl}&sub_id=wrong`,
    })
    expect(conflictingQuerySubId.error).not.toBeNull()

    const smuggledQuerySubId = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_original_url: 'https://example.com/travel-rpc-smuggled-sub-id',
      p_partner_url: `https://brand.tp.st/link?x=?sub_id=${expectedSubId}`,
    })
    expect(smuggledQuerySubId.error).not.toBeNull()

    const participantDisabled = await svc
      .from('mission_participants')
      .update({ status: 'rejected' })
      .eq('id', travelpayoutsParticipantId)
    const inactiveParticipantAttempt = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_original_url: 'https://example.com/travel-rpc-inactive-participant',
    })
    const participantRestored = await svc
      .from('mission_participants')
      .update({ status: 'active' })
      .eq('id', travelpayoutsParticipantId)
    expect(participantDisabled.error).toBeNull()
    expect(participantRestored.error).toBeNull()
    expect(inactiveParticipantAttempt.error).not.toBeNull()

    const missionUnpublished = await svc
      .from('missions')
      .update({ status: 'draft' })
      .eq('id', travelpayoutsMissionId)
    const unpublishedMissionAttempt = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_original_url: 'https://example.com/travel-rpc-unpublished-mission',
    })
    const missionRepublished = await svc
      .from('missions')
      .update({ status: 'published' })
      .eq('id', travelpayoutsMissionId)
    expect(missionUnpublished.error).toBeNull()
    expect(missionRepublished.error).toBeNull()
    expect(unpublishedMissionAttempt.error).not.toBeNull()

    const programPaused = await svc
      .from('affiliate_network_programs')
      .update({ status: 'paused' })
      .eq('id', affiliateProgramId)
    const inactiveProgramAttempt = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_original_url: 'https://example.com/travel-rpc-inactive-program',
    })
    const programRestored = await svc
      .from('affiliate_network_programs')
      .update({ status: 'active' })
      .eq('id', affiliateProgramId)
    expect(programPaused.error).toBeNull()
    expect(programRestored.error).toBeNull()
    expect(inactiveProgramAttempt.error).not.toBeNull()

    const wrongProgram = await svc
      .from('affiliate_network_programs')
      .insert({
        network: 'travelpayouts',
        external_program_id: `tp-rls-wrong-program-${runId}`,
        program_name: 'Wrong Travelpayouts RLS Program',
        status: 'active',
      })
      .select('id')
      .single()
    expect(wrongProgram.error).toBeNull()
    const wrongProgramAttempt = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_affiliate_network_program_id: wrongProgram.data!.id,
      p_original_url: 'https://example.com/travel-rpc-wrong-program',
    })
    const wrongProgramCleanup = await svc
      .from('affiliate_network_programs')
      .delete()
      .eq('id', wrongProgram.data!.id)
    expect(wrongProgramCleanup.error).toBeNull()
    expect(wrongProgramAttempt.error).not.toBeNull()

    const nonDefaultPortAttempt = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_original_url: 'https://example.com/travel-rpc-non-default-port',
      p_partner_url: `https://tp.st:8443/link?sub_id=${expectedSubId}`,
    })
    expect(nonDefaultPortAttempt.error).not.toBeNull()

    for (const malformedHost of [
      '.tp.st',
      'a..tp.st',
      'foo_bar.tp.st',
      '-edge.tp.st',
      'edge-.tp.st',
    ]) {
      const malformedHostAttempt = await creator.rpc('create_travelpayouts_partner_link', {
        ...rpcArgs,
        p_original_url: `https://example.com/travel-rpc-malformed-${malformedHost}`,
        p_partner_url: `https://${malformedHost}/link?sub_id=${expectedSubId}`,
      })
      expect(malformedHostAttempt.error).not.toBeNull()
    }

    const otherNetworkInsert = await svc
      .from('affiliate_partner_links')
      .insert({
        affiliate_network_program_id: affiliateProgramId,
        mission_id: travelpayoutsMissionId,
        mission_participant_id: travelpayoutsParticipantId,
        creator_id: partnerCreatorId,
        network: 'other-network',
        original_url: 'https://example.com/travel-rpc-other-network',
        partner_url: `https://brand.tp.st/link?sub_id=${expectedSubId}`,
        sub_id: expectedSubId,
        external_status: 'success',
      })
      .select('id')
    expect(otherNetworkInsert.error).not.toBeNull()
    expect(otherNetworkInsert.error?.code).toBe('23514')
    const nestedOriginalUrl = 'https://example.com/travel-rpc-nested-host'
    const nestedPartnerUrl = `https://valid-label.deep-host.tp.st/link?sub_id=${expectedSubId}`
    const nestedRpc = await creator.rpc('create_travelpayouts_partner_link', {
      ...rpcArgs,
      p_original_url: nestedOriginalUrl,
      p_partner_url: nestedPartnerUrl,
    })
    expect(nestedRpc.error).toBeNull()
    expect(nestedRpc.data).toHaveLength(1)
    expect(nestedRpc.data![0].partner_url).toBe(nestedPartnerUrl)

    const storedNestedLink = await svc
      .from('affiliate_partner_links')
      .select('id, original_url, partner_url')
      .eq('id', nestedRpc.data![0].id)
      .single()
    expect(storedNestedLink.error).toBeNull()
    expect(storedNestedLink.data).toMatchObject({
      original_url: nestedOriginalUrl,
      partner_url: nestedPartnerUrl,
    })

    const nestedCleanup = await svc
      .from('affiliate_partner_links')
      .delete()
      .eq('id', nestedRpc.data![0].id)
    expect(nestedCleanup.error).toBeNull()
    const validRpc = await creator.rpc('create_travelpayouts_partner_link', rpcArgs)
    expect(validRpc.error).toBeNull()
    expect(validRpc.data).toHaveLength(1)
    expect(validRpc.data![0].partner_url).toBe(validPartnerUrl)

    const duplicateRpc = await creator.rpc('create_travelpayouts_partner_link', rpcArgs)
    expect(duplicateRpc.error).toBeNull()
    expect(duplicateRpc.data).toEqual(validRpc.data)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const concurrentArgs = {
        ...rpcArgs,
        p_original_url: `https://example.com/travel-rpc-concurrent-${attempt}`,
      }
      const [concurrentRpcA, concurrentRpcB] = await Promise.all([
        creator.rpc('create_travelpayouts_partner_link', concurrentArgs),
        creator.rpc('create_travelpayouts_partner_link', concurrentArgs),
      ])
      expect(concurrentRpcA.error).toBeNull()
      expect(concurrentRpcB.error).toBeNull()
      expect(concurrentRpcA.data).toHaveLength(1)
      expect(concurrentRpcB.data).toHaveLength(1)
      expect(concurrentRpcB.data).toEqual(concurrentRpcA.data)
    }
    const storedRpcLink = await creator
      .from('affiliate_partner_links')
      .select('id, external_status, partner_url, sub_id')
      .eq('id', validRpc.data![0].id)
      .single()
    expect(storedRpcLink.error).toBeNull()
    expect(storedRpcLink.data).toMatchObject({
      external_status: 'success',
      partner_url: validPartnerUrl,
      sub_id: expectedSubId,
    })

    const merchantParticipant = await creator
      .from('mission_participants')
      .insert({
        mission_id: missionId,
        creator_id: partnerCreatorId,
        status: 'active',
        source: 'open_join',
      })
      .select('id')
      .single()
    expect(merchantParticipant.error).toBeNull()

    const blockedMerchantMissionLink = await creator
      .from('affiliate_partner_links')
      .insert({
        affiliate_network_program_id: affiliateProgramId,
        mission_id: missionId,
        mission_participant_id: merchantParticipant.data!.id,
        creator_id: partnerCreatorId,
        network: 'travelpayouts',
        original_url: 'https://example.com/not-travelpayouts',
        partner_url: 'https://tp.example/bad',
        sub_id: 'partner-bad-link',
      })
      .select('id')
    expect(blockedMerchantMissionLink.error === null ? blockedMerchantMissionLink.data : []).toEqual([])
  }, testTimeout)

  it('partner-link RPC execute ACL allows authenticated but not service-role callers', async () => {
    await runPsql(`
      do $test$
      begin
        if has_function_privilege(
          'service_role',
          'public.create_travelpayouts_partner_link(uuid,uuid,uuid,text,text,text)',
          'EXECUTE'
        ) then
          raise exception 'service_role can execute create_travelpayouts_partner_link';
        end if;

        if not has_function_privilege(
          'authenticated',
          'public.create_travelpayouts_partner_link(uuid,uuid,uuid,text,text,text)',
          'EXECUTE'
        ) then
          raise exception 'authenticated cannot execute create_travelpayouts_partner_link';
        end if;
      end
      $test$;
    `)
  }, testTimeout)

  it('creator milestone submissions cannot forge review state or cross missions', async () => {
    const participant = await svc
      .from('mission_participants')
      .upsert(
        {
          mission_id: missionId,
          creator_id: creatorId,
          status: 'active',
          source: 'open_join',
        },
        { onConflict: 'mission_id,creator_id' },
      )
      .select('id')
      .single()
    expect(participant.error).toBeNull()

    const milestone = await svc
      .from('mission_milestones')
      .insert({ mission_id: missionId, title: 'Post proof', description: 'Upload post proof' })
      .select('id')
      .single()
    expect(milestone.error).toBeNull()

    const otherMissionMilestone = await svc
      .from('mission_milestones')
      .insert({ mission_id: travelpayoutsMissionId, title: 'Wrong mission', description: 'Different mission' })
      .select('id')
      .single()
    expect(otherMissionMilestone.error).toBeNull()

    const creator = await authed(creatorEmail)
    const approvedInsert = await creator
      .from('mission_milestone_submissions')
      .insert({
        mission_milestone_id: milestone.data!.id,
        mission_participant_id: participant.data!.id,
        status: 'approved',
        merchant_feedback: 'self-reviewed',
        reviewed_at: new Date().toISOString(),
        reviewed_by: merchantUserId,
      })
      .select('id')
    expect(approvedInsert.error).not.toBeNull()

    const mismatchedMission = await creator
      .from('mission_milestone_submissions')
      .insert({
        mission_milestone_id: otherMissionMilestone.data!.id,
        mission_participant_id: participant.data!.id,
        status: 'submitted',
        proof_urls: ['https://example.com/wrong-mission-proof'],
      })
      .select('id')
    expect(mismatchedMission.error).not.toBeNull()

    const validSubmission = await creator
      .from('mission_milestone_submissions')
      .insert({
        mission_milestone_id: milestone.data!.id,
        mission_participant_id: participant.data!.id,
        status: 'submitted',
        proof_urls: ['https://example.com/proof'],
        notes: 'Proof submitted',
        submitted_at: new Date().toISOString(),
      })
      .select('id, status, merchant_feedback, reviewed_at, reviewed_by')
      .single()
    expect(validSubmission.error).toBeNull()
    expect(validSubmission.data!.status).toBe('submitted')
    expect(validSubmission.data!.merchant_feedback).toBeNull()
    expect(validSubmission.data!.reviewed_at).toBeNull()
    expect(validSubmission.data!.reviewed_by).toBeNull()

    const forgedReviewUpdate = await creator
      .from('mission_milestone_submissions')
      .update({ merchant_feedback: 'creator review' })
      .eq('id', validSubmission.data!.id)
      .select('id')
    expect(forgedReviewUpdate.error === null ? forgedReviewUpdate.data : []).toEqual([])

    const unchanged = await svc
      .from('mission_milestone_submissions')
      .select('merchant_feedback, reviewed_at, reviewed_by')
      .eq('id', validSubmission.data!.id)
      .single()
    expect(unchanged.error).toBeNull()
    expect(unchanged.data!.merchant_feedback).toBeNull()
    expect(unchanged.data!.reviewed_at).toBeNull()
    expect(unchanged.data!.reviewed_by).toBeNull()

    const merchant = await authed(merchantEmail)
    const merchantReview = await merchant
      .from('mission_milestone_submissions')
      .update({
        status: 'approved',
        merchant_feedback: 'Approved by merchant',
        reviewed_at: new Date().toISOString(),
        reviewed_by: merchantUserId,
      })
      .eq('id', validSubmission.data!.id)
      .select('status, merchant_feedback, reviewed_by')
      .single()
    expect(merchantReview.error).toBeNull()
    expect(merchantReview.data!.status).toBe('approved')
    expect(merchantReview.data!.merchant_feedback).toBe('Approved by merchant')
    expect(merchantReview.data!.reviewed_by).toBe(merchantUserId)

    const reopenedByCreator = await creator
      .from('mission_milestone_submissions')
      .update({
        status: 'submitted',
        notes: 'Changed after approval',
        proof_urls: ['https://example.com/changed-proof'],
      })
      .eq('id', validSubmission.data!.id)
      .select('id')
    expect(reopenedByCreator.error === null ? reopenedByCreator.data : []).toEqual([])

    const stillApproved = await svc
      .from('mission_milestone_submissions')
      .select('status, notes, proof_urls')
      .eq('id', validSubmission.data!.id)
      .single()
    expect(stillApproved.error).toBeNull()
    expect(stillApproved.data!.status).toBe('approved')
    expect(stillApproved.data!.notes).toBe('Proof submitted')
    expect(stillApproved.data!.proof_urls).toEqual(['https://example.com/proof'])
  }, testTimeout)

  it('social snapshots are visible to the creator, owning merchant, and ops only', async () => {
    const participant = await svc
      .from('mission_participants')
      .upsert(
        {
          mission_id: missionId,
          creator_id: snapshotCreatorId,
          status: 'active',
          source: 'open_join',
        },
        { onConflict: 'mission_id,creator_id' },
      )
      .select('id')
      .single()
    expect(participant.error).toBeNull()

    const snapshot = await svc
      .from('mission_social_snapshots')
      .insert({
        mission_id: missionId,
        mission_participant_id: participant.data!.id,
        platform: 'instagram',
        handle: 'snapshot_creator',
        follower_count: 1234,
        confidence_status: 'verified_signal',
      })
      .select('id')
      .single()
    expect(snapshot.error).toBeNull()

    const snapshotCreator = await authed(snapshotCreatorEmail)
    const creatorVisible = await snapshotCreator
      .from('mission_social_snapshots')
      .select('id, follower_count')
      .eq('id', snapshot.data!.id)
      .single()
    expect(creatorVisible.error).toBeNull()
    expect(creatorVisible.data!.follower_count).toBe(1234)

    const merchant = await authed(merchantEmail)
    const merchantVisible = await merchant
      .from('mission_social_snapshots')
      .select('id')
      .eq('id', snapshot.data!.id)
      .single()
    expect(merchantVisible.error).toBeNull()

    const opsClient = await authed(opsEmail)
    const opsVisible = await opsClient
      .from('mission_social_snapshots')
      .select('id')
      .eq('id', snapshot.data!.id)
      .single()
    expect(opsVisible.error).toBeNull()

    const otherCreator = await authed(otherCreatorEmail)
    const hiddenFromOtherCreator = await otherCreator
      .from('mission_social_snapshots')
      .select('id')
      .eq('id', snapshot.data!.id)
    expect(hiddenFromOtherCreator.error).toBeNull()
    expect(hiddenFromOtherCreator.data).toEqual([])
  }, testTimeout)

  it('non-ops cannot update settlement while ops can', async () => {
    const settlement = await svc
      .from('mission_settlements')
      .insert({ mission_id: missionId, status: 'pending' })
      .select('id')
      .single()
    expect(settlement.error).toBeNull()

    const merchant = await authed(merchantEmail)
    const denied = await merchant
      .from('mission_settlements')
      .update({ status: 'paid' })
      .eq('id', settlement.data!.id)
      .select('id')
    expect(denied.error === null ? denied.data : []).toEqual([])

    const unchanged = await svc
      .from('mission_settlements')
      .select('status')
      .eq('id', settlement.data!.id)
      .single()
    expect(unchanged.error).toBeNull()
    expect(unchanged.data!.status).toBe('pending')

    const opsClient = await authed(opsEmail)
    const allowed = await opsClient
      .from('mission_settlements')
      .update({ status: 'paid', updated_by_ops_member_id: opsMemberId })
      .eq('id', settlement.data!.id)
    expect(allowed.error).toBeNull()
  }, testTimeout)

  it('merchant can delete an empty own mission for rollback', async () => {
    let rollbackMissionId = ''

    try {
      const mission = await svc
        .from('missions')
        .insert({
          merchant_profile_id: merchantProfileId,
          title: 'Empty rollback mission',
          summary: 'Mission created only to validate rollback deletes',
          mission_source: 'merchant',
          mission_type: 'coupon_affiliate',
          visibility: 'open',
          status: 'draft',
          coupon_code: 'EMPTY',
          coupon_url: 'https://example.com/empty-rollback',
          affiliate_commission_rate: 10,
          kinnso_commission_rate: 4,
          creator_commission_rate: 6,
        })
        .select('id')
        .single()
      expect(mission.error).toBeNull()
      rollbackMissionId = mission.data!.id

      const merchant = await authed(merchantEmail)
      const deleted = await merchant.from('missions').delete().eq('id', rollbackMissionId).select('id')
      expect(deleted.error).toBeNull()
      expect(deleted.data).toEqual([{ id: rollbackMissionId }])

      const remaining = await svc.from('missions').select('id').eq('id', rollbackMissionId)
      expect(remaining.error).toBeNull()
      expect(remaining.data).toEqual([])
    } finally {
      if (rollbackMissionId) {
        await runPsql(`delete from public.missions where id = ${sqlString(rollbackMissionId)};`)
      }
    }
  }, testTimeout)

  it('merchant cannot see affiliate events or delete own mission when affiliate events exist', async () => {
    let blockedMissionId = ''
    let eventId = ''

    try {
      const mission = await svc
        .from('missions')
        .insert({
          merchant_profile_id: merchantProfileId,
          title: 'Blocked rollback mission',
          summary: 'Mission should not delete after affiliate events exist',
          mission_source: 'merchant',
          mission_type: 'coupon_affiliate',
          visibility: 'open',
          status: 'draft',
          coupon_code: 'BLOCKED',
          coupon_url: 'https://example.com/blocked-rollback',
          affiliate_commission_rate: 10,
          kinnso_commission_rate: 4,
          creator_commission_rate: 6,
        })
        .select('id')
        .single()
      expect(mission.error).toBeNull()
      blockedMissionId = mission.data!.id

      const event = await svc
        .from('affiliate_network_events')
        .insert({
          network: 'travelpayouts',
          mission_id: blockedMissionId,
          external_action_id: `rollback-block-${runId}`,
          event_state: 'processing',
          profit_amount: 12.34,
          currency: 'HKD',
        })
        .select('id')
        .single()
      expect(event.error).toBeNull()
      eventId = event.data!.id

      const merchant = await authed(merchantEmail)
      const merchantEventVisible = await merchant
        .from('affiliate_network_events')
        .select('id, profit_amount')
        .eq('id', eventId)
      expect(merchantEventVisible.error).toBeNull()
      expect(merchantEventVisible.data).toEqual([])

      const blockedDelete = await merchant.from('missions').delete().eq('id', blockedMissionId).select('id')
      expect(blockedDelete.error).toBeNull()
      expect(blockedDelete.data).toEqual([])

      const remaining = await svc.from('missions').select('id').eq('id', blockedMissionId).single()
      expect(remaining.error).toBeNull()
      expect(remaining.data!.id).toBe(blockedMissionId)
    } finally {
      if (eventId) {
        await runPsql(`delete from public.affiliate_network_events where id = ${sqlString(eventId)};`)
      }
      if (blockedMissionId) {
        await runPsql(`delete from public.missions where id = ${sqlString(blockedMissionId)};`)
      }
    }
  }, testTimeout)

  it('ops can delete an empty Travelpayouts mission for rollback', async () => {
    let opsRollbackMissionId = ''

    // `missions_tp_program_uniq` is a partial unique index allowing ONE
    // travelpayouts mission per affiliate program, and the suite fixture
    // already holds that slot for `affiliateProgramId`. This case therefore
    // needs a program of its own — reusing the shared one can never insert.
    const rollbackProgram = await svc
      .from('affiliate_network_programs')
      .upsert(
        {
          network: 'travelpayouts',
          external_program_id: 'tp-rls-rollback-program',
          program_name: 'Travelpayouts RLS Rollback Program',
          status: 'active',
        },
        { onConflict: 'network,external_program_id' },
      )
      .select('id')
      .single()
    expect(rollbackProgram.error).toBeNull()
    const rollbackProgramId = rollbackProgram.data!.id

    try {
      const mission = await svc
        .from('missions')
        .insert({
          created_by_ops_member_id: opsMemberId,
          affiliate_network_program_id: rollbackProgramId,
          title: 'Ops rollback Travelpayouts mission',
          summary: 'Ops can roll back empty Travelpayouts missions',
          mission_source: 'travelpayouts',
          mission_type: 'coupon_affiliate',
          visibility: 'open',
          status: 'draft',
          affiliate_commission_rate: 10,
          kinnso_commission_rate: 4,
          creator_commission_rate: 6,
        })
        .select('id')
        .single()
      expect(mission.error).toBeNull()
      opsRollbackMissionId = mission.data!.id

      const opsClient = await authed(opsEmail)
      const deleted = await opsClient.from('missions').delete().eq('id', opsRollbackMissionId).select('id')
      expect(deleted.error).toBeNull()
      expect(deleted.data).toEqual([{ id: opsRollbackMissionId }])
    } finally {
      if (opsRollbackMissionId) {
        await runPsql(`delete from public.missions where id = ${sqlString(opsRollbackMissionId)};`)
      }
      // Drop the dedicated program too, so a re-run starts from the same state
      // whether or not the assertions above got as far as deleting the mission.
      await runPsql(
        `delete from public.affiliate_network_programs where id = ${sqlString(rollbackProgramId)};`,
      )
    }
  }, testTimeout)
})
