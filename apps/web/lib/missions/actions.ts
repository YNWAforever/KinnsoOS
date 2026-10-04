import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type {
  MissionDraftInput,
  MissionSource,
  MissionType,
  ParticipantReviewAction,
  ParticipantStatus,
  SubmissionReviewAction,
  ValidationErrors,
} from '@/lib/missions/types'
import { nextJoinStatus, reviewParticipant, reviewSubmission } from '@/lib/missions/state'
import {
  validateMissionDraft,
  validatePartnerLinkRequest,
  validateReceiptProof,
  validateSubmission,
} from '@/lib/missions/validation'
import { meetsTier, type GatedTier } from '@/lib/contribution/tiers'
import { getCreatorStoredTier } from '@/lib/contribution/queries'
import { requireCreatorAction } from '@/lib/admin/guard'
import { createPartnerLinkCommand } from '@/lib/missions/partner-link-command'
import { createPartnerLinkStore } from '@/lib/missions/partner-link-store'
import { createTravelpayoutsPartnerLinkProvider } from '@/lib/missions/partner-link-provider'

type MissionInsert = Database['public']['Tables']['missions']['Insert']
type MissionMilestoneInsert = Database['public']['Tables']['mission_milestones']['Insert']
type ParticipantInsert = Database['public']['Tables']['mission_participants']['Insert']
type Supabase = SupabaseClient<Database>

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

type BuildMissionInsertInput = {
  input: MissionDraftInput
  merchantProfileId: string | null
  opsMemberId: string | null
  publish: boolean
}

type BuildParticipantInsertInput = {
  missionId: string
  creatorId: string
  missionType: MissionType
  missionSource: MissionSource
  applicationNote?: string | null
}

type LocaleOption = {
  locale?: string
}

type CreateMissionOptions = LocaleOption & {
  publish?: boolean
}

type JoinMissionInput = LocaleOption & {
  missionId: string
  applicationNote?: string | null
}

type ReviewParticipantInput = LocaleOption & {
  participantId: string
  action: ParticipantReviewAction
  reviewNote?: string | null
}

type ReviewSubmissionInput = LocaleOption & {
  submissionId: string
  action: SubmissionReviewAction
  feedback?: string | null
}

export type CreatePartnerLinkInput = LocaleOption & {
  missionParticipantId: string
  originalUrl: string
}

const merchantMissionsPath = '/merchants/dashboard/missions'
const studioMissionsPath = '/studio/missions'
const defaultLocale = 'en'
const localePattern = /^[a-z]{2}(?:-[a-z]{2})?$/

const formError = (message: string): ActionFailure => ({
  ok: false,
  errors: { form: [message] },
})
const incompleteMissionCreationError =
  'Mission creation is incomplete. Please retry or contact ops before publishing again.'

const normalizeLocale = (locale?: string) => {
  const value = locale?.trim().toLowerCase()
  return value && localePattern.test(value) ? value : defaultLocale
}

const localizedPath = (locale: string | undefined, path: string) =>
  `/${normalizeLocale(locale)}${path}`

async function getSupabase() {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server')
  return createSupabaseServerClient()
}


async function revalidate(paths: string[]) {
  const { revalidatePath } = await import('next/cache')
  paths.forEach((path) => revalidatePath(path))
}

async function getAuthenticatedUser(supabase: Supabase) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null
  return user
}

async function getActiveOpsMember(supabase: Supabase, userId: string) {
  const { data, error } = await supabase
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) return null
  return data
}

async function getMerchantProfileForUser(supabase: Supabase, userId: string) {
  const { data, error } = await supabase
    .from('merchant_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return null
  return data
}

async function assertMissionBelongsToMerchant(
  supabase: Supabase,
  missionId: string,
  merchantProfileId: string,
) {
  const { data, error } = await supabase
    .from('missions')
    .select('id')
    .eq('id', missionId)
    .eq('merchant_profile_id', merchantProfileId)
    .maybeSingle()

  return !error && Boolean(data)
}

export function buildMissionInsert({
  input: draft,
  merchantProfileId,
  opsMemberId,
  publish,
}: BuildMissionInsertInput): MissionInsert {
  return {
    merchant_profile_id: merchantProfileId,
    created_by_ops_member_id: opsMemberId,
    mission_source: draft.missionSource,
    mission_type: draft.missionType,
    visibility: draft.visibility,
    status: publish ? 'published' : 'draft',
    published_at: publish ? new Date().toISOString() : null,
    title: draft.title,
    summary: draft.summary,
    coupon_code: draft.couponCode,
    coupon_url: draft.couponUrl,
    affiliate_commission_rate: draft.affiliateCommissionRate,
    kinnso_commission_rate: draft.kinnsoCommissionRate,
    creator_commission_rate: draft.creatorCommissionRate,
    paid_fee_amount: draft.paidFeeAmount,
    paid_fee_currency: draft.paidFeeCurrency,
    affiliate_network_program_id: draft.affiliateNetworkProgramId,
    min_tier: draft.minTier,
    max_receipts_per_creator: draft.maxReceiptsPerCreator,
    deliverables: draft.deliverables,
    requirements: draft.requirements,
    dos: draft.dos,
    donts: draft.donts,
    key_messages: draft.keyMessages,
    reference_links: draft.referenceLinks,
    effort: draft.effort,
  }
}

export function buildParticipantInsert({
  missionId,
  creatorId,
  missionType,
  missionSource,
  applicationNote = null,
}: BuildParticipantInsertInput): ParticipantInsert {
  const next = nextJoinStatus({ missionType, missionSource })

  return {
    mission_id: missionId,
    creator_id: creatorId,
    status: next.status,
    source: next.source,
    application_note: applicationNote,
    approved_at: next.status === 'active' ? new Date().toISOString() : null,
  }
}

export async function createMissionAction(
  input: MissionDraftInput,
  options: CreateMissionOptions = {},
): Promise<ActionResult<{ missionId: string }>> {
  'use server'

  const validation = validateMissionDraft(input)
  if (!validation.ok) return validation

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  let merchantProfileId: string | null = null
  let opsMemberId: string | null = null

  if (input.missionSource === 'travelpayouts') {
    const opsMember = await getActiveOpsMember(supabase, user.id)
    if (!opsMember) return formError('Active ops member access is required')
    opsMemberId = opsMember.id
  } else {
    const merchantProfile = await getMerchantProfileForUser(supabase, user.id)
    if (!merchantProfile) return formError('Merchant profile is required')
    merchantProfileId = merchantProfile.id
  }

  const missionPayload = buildMissionInsert({
    input,
    merchantProfileId,
    opsMemberId,
    publish: options.publish ?? false,
  })

  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .insert(missionPayload)
    .select('id')
    .single()

  if (missionError || !mission) return formError('Mission could not be created')

  if (input.milestones.length > 0) {
    const milestones: MissionMilestoneInsert[] = input.milestones.map((milestone, index) => ({
      mission_id: mission.id,
      title: milestone.title,
      description: milestone.description,
      due_at: null,
      sort_order: index,
    }))

    const { error: milestoneError } = await supabase.from('mission_milestones').insert(milestones)
    if (milestoneError) {
      const { data: rolledBackMission, error: rollbackError } = await supabase
        .from('missions')
        .delete()
        .eq('id', mission.id)
        .select('id')
        .maybeSingle()

      if (rollbackError || !rolledBackMission) return formError(incompleteMissionCreationError)

      return formError('Mission milestones could not be created')
    }
  }

  await revalidate([
    localizedPath(options.locale, merchantMissionsPath),
    localizedPath(options.locale, studioMissionsPath),
  ])
  return { ok: true, missionId: mission.id }
}

export async function joinMissionAction(
  input: JoinMissionInput,
): Promise<ActionResult<{ participantId: string }>> {
  'use server'

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const opsMember = await getActiveOpsMember(supabase, user.id)
  if (opsMember) return formError('Creator access is required')

  const merchantProfile = await getMerchantProfileForUser(supabase, user.id)
  if (merchantProfile) return formError('Creator access is required')

  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id, mission_type, mission_source, min_tier')
    .eq('id', input.missionId)
    .eq('status', 'published')
    .single()

  if (missionError || !mission) return formError('Mission is not available')

  if (mission.min_tier) {
    const creatorTier = await getCreatorStoredTier(supabase, user.id)
    if (!meetsTier(creatorTier, mission.min_tier as GatedTier)) {
      return formError(`This mission requires the ${mission.min_tier} tier`)
    }
  }

  const participantPayload = buildParticipantInsert({
    missionId: mission.id,
    creatorId: user.id,
    missionType: mission.mission_type as MissionType,
    missionSource: mission.mission_source as MissionSource,
    applicationNote: input.applicationNote,
  })

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .insert(participantPayload)
    .select('id')
    .single()

  if (participantError || !participant) return formError('Mission could not be joined')

  await revalidate([localizedPath(input.locale, studioMissionsPath)])
  return { ok: true, participantId: participant.id }
}

export async function reviewParticipantAction(
  input: ReviewParticipantInput,
): Promise<ActionResult<{ status: string }>> {
  'use server'

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const merchantProfile = await getMerchantProfileForUser(supabase, user.id)
  if (!merchantProfile) return formError('Merchant profile is required')

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .select('id, mission_id, status')
    .eq('id', input.participantId)
    .single()

  if (participantError || !participant) return formError('Participant was not found')

  const ownsMission = await assertMissionBelongsToMerchant(
    supabase,
    participant.mission_id,
    merchantProfile.id,
  )
  if (!ownsMission) return formError('Merchant access is required')

  let nextStatus: string
  try {
    nextStatus = reviewParticipant(
      participant.status as Parameters<typeof reviewParticipant>[0],
      input.action,
    )
  } catch (error) {
    return formError(error instanceof Error ? error.message : 'Participant could not be reviewed')
  }

  const { data: updatedParticipant, error: updateError } = await supabase
    .from('mission_participants')
    .update({
      status: nextStatus,
      merchant_review_note: input.reviewNote ?? null,
      approved_at: nextStatus === 'active' ? new Date().toISOString() : null,
    })
    .eq('id', input.participantId)
    .eq('status', participant.status)
    .select('status')
    .maybeSingle()

  if (updateError || !updatedParticipant) {
    return formError('Participant review could not be saved')
  }

  await revalidate([localizedPath(input.locale, merchantMissionsPath)])
  return { ok: true, status: updatedParticipant.status }
}

export async function reviewSubmissionAction(
  input: ReviewSubmissionInput,
): Promise<ActionResult<{ status: string }>> {
  'use server'

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const merchantProfile = await getMerchantProfileForUser(supabase, user.id)
  if (!merchantProfile) return formError('Merchant profile is required')

  const { data: submission, error: submissionError } = await supabase
    .from('mission_milestone_submissions')
    .select('id, status, mission_participant_id')
    .eq('id', input.submissionId)
    .single()

  if (submissionError || !submission) return formError('Submission was not found')

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .select('mission_id')
    .eq('id', submission.mission_participant_id)
    .single()

  if (participantError || !participant) return formError('Participant was not found')

  const ownsMission = await assertMissionBelongsToMerchant(
    supabase,
    participant.mission_id,
    merchantProfile.id,
  )
  if (!ownsMission) return formError('Merchant access is required')

  let nextStatus: string
  try {
    nextStatus = reviewSubmission(
      submission.status as Parameters<typeof reviewSubmission>[0],
      input.action,
    )
  } catch (error) {
    return formError(error instanceof Error ? error.message : 'Submission could not be reviewed')
  }

  const { data: updatedSubmission, error: updateError } = await supabase
    .from('mission_milestone_submissions')
    .update({
      status: nextStatus,
      merchant_feedback: input.feedback ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', input.submissionId)
    .eq('status', submission.status)
    .select('status')
    .maybeSingle()

  if (updateError || !updatedSubmission) {
    // The budget-gate trigger (R11.2) aborts the whole approval when the merchant's
    // enforced budget can't cover the fee -- surface that specifically instead of the
    // generic save failure.
    if (updateError?.message.includes('insufficient_budget')) {
      return formError('This approval needs more budget — top up before approving.')
    }
    if (updateError?.message.includes('currency_mismatch')) {
      return formError('Budget currency does not match this mission — contact KINNSO ops.')
    }
    return formError('Submission review could not be saved')
  }

  // Best-effort audit trail via the mission_review_event_append RPC -- the merchant-side
  // equivalent of admin_review_submission's own insert into mission_review_events.
  // mission_review_events has no direct insert grant to any client role (see
  // supabase/migrations/20260819090000_r11_0_mission_review_events.sql's
  // `revoke all ... from public, anon, authenticated`), so a plain `.insert()` here would
  // always fail with a permission error -- this RPC is the only write path. A failure
  // here must never fail the merchant's review action -- the update above has already
  // succeeded -- so the result is logged, not surfaced or awaited-with-a-guard.
  try {
    const { error: eventError } = await supabase.rpc('mission_review_event_append', {
      p_submission_id: input.submissionId,
      p_action: input.action,
      p_reason_text: input.feedback ?? null,
    })
    if (eventError) {
      console.error('[missions] mission_review_event_append failed', eventError)
    }
  } catch (error) {
    console.error('[missions] mission_review_event_append failed', error)
  }

  await revalidate([localizedPath(input.locale, merchantMissionsPath)])
  return { ok: true, status: updatedSubmission.status }
}

export type SubmitMilestoneInput = {
  missionId: string
  milestoneId: string
  participantId: string
  proofUrl: string
  notes?: string | null
  locale?: string
}

const RESUBMITTABLE = new Set(['pending', 'submitted', 'revision_requested'])

export async function submitMilestoneAction(
  input: SubmitMilestoneInput,
): Promise<ActionResult<{ submissionId: string }>> {
  'use server'

  const validation = validateSubmission({ proofUrl: input.proofUrl, notes: input.notes })
  if (!validation.ok) return { ok: false, errors: validation.errors }

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const { data: participant, error: participantError } = await supabase
    .from('mission_participants')
    .select('id, creator_id, status, mission_id')
    .eq('id', input.participantId)
    .maybeSingle()

  if (participantError || !participant) return formError('Mission participation was not found')
  if (participant.creator_id !== user.id) return formError('Creator access is required')
  if (participant.status !== 'active') return formError('Mission is not active')

  const proofUrls = [input.proofUrl.trim()]
  const notes = input.notes ?? null
  const submittedAt = new Date().toISOString()

  const { data: existing } = await supabase
    .from('mission_milestone_submissions')
    .select('id, status')
    .eq('mission_milestone_id', input.milestoneId)
    .eq('mission_participant_id', input.participantId)
    .maybeSingle()

  if (existing) {
    if (!RESUBMITTABLE.has(existing.status ?? '')) return formError('This milestone has already been reviewed')
    const { data: updated, error: updateError } = await supabase
      .from('mission_milestone_submissions')
      .update({ status: 'submitted', proof_urls: proofUrls, notes, submitted_at: submittedAt })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (updateError || !updated) return formError('Submission could not be saved')
    await revalidate([localizedPath(input.locale, studioMissionsPath)])
    return { ok: true, submissionId: updated.id }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('mission_milestone_submissions')
    .insert({
      mission_milestone_id: input.milestoneId,
      mission_participant_id: input.participantId,
      proof_urls: proofUrls,
      notes,
      status: 'submitted',
      submitted_at: submittedAt,
    })
    .select('id')
    .single()

  if (insertError || !inserted) return formError('Submission could not be saved')
  await revalidate([localizedPath(input.locale, studioMissionsPath)])
  return { ok: true, submissionId: inserted.id }
}

export type SubmitReceiptInput = {
  missionId: string
  proofUrl: string
  locale?: string
}

// Friendly-message mapping for submit_receipt's raised error codes, following the same
// FRIENDLY-table convention as claimOfferAction (apps/web/lib/offers/actions.ts) --
// submit_receipt is a SECURITY DEFINER RPC that owns every validation itself (auth,
// mission lookup, active-participant check, the repeatable-milestone guard, and the
// per-creator cap), so this action's only job is to gate + call it and translate its
// short error codes into copy a creator can act on, the same shape claim_offer's
// offer_cap_reached/visitor_limit_reached/offer_not_live already get.
const RECEIPT_FRIENDLY: Record<string, string> = {
  unauthorized: 'Sign in is required',
  proof_required: 'Add a photo of your receipt before submitting',
  mission_not_found: 'Mission is not available',
  wrong_mission_type: 'This mission does not accept receipt submissions',
  not_active_participant: 'You need to join this mission before submitting a receipt',
  no_repeatable_milestone: 'This mission is not set up for receipt submissions yet — contact support',
  receipt_cap_reached: "You've reached the receipt limit for this mission",
}

const mapReceiptError = (message: string, fallback: string): string => {
  const key = Object.keys(RECEIPT_FRIENDLY).find((k) => message.includes(k))
  return key ? RECEIPT_FRIENDLY[key] : fallback
}

export async function submitReceiptAction(
  input: SubmitReceiptInput,
): Promise<ActionResult<{ submissionId: string }>> {
  'use server'

  const validation = validateReceiptProof({ proofUrl: input.proofUrl })
  if (!validation.ok) return { ok: false, errors: validation.errors }

  const supabase = await getSupabase()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.rpc('submit_receipt', {
    p_mission_id: input.missionId,
    p_proof_urls: [input.proofUrl.trim()],
  })

  if (error || !data) {
    if (error) console.error('[missions] submit_receipt failed', error)
    return formError(mapReceiptError(error?.message ?? '', 'Receipt could not be submitted'))
  }

  const result = data as { submission_id: string }
  await revalidate([localizedPath(input.locale, studioMissionsPath)])
  return { ok: true, submissionId: result.submission_id }
}

export async function createPartnerLinkAction(
  input: CreatePartnerLinkInput,
): Promise<ActionResult<{ link: { id: string; partner_url: string } }>> {
  'use server'

  const supabase = await getSupabase()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return formError('Sign in is required')

  const result = await createPartnerLinkCommand(
    { id: user.id },
    {
      missionParticipantId: input.missionParticipantId,
      originalUrl: input.originalUrl,
    },
    {
      store: createPartnerLinkStore(supabase),
      provider: createTravelpayoutsPartnerLinkProvider(),
    },
  )

  if (result.kind === 'validation-failed') {
    return { ok: false, errors: result.errors }
  }

  if (result.kind === 'failed') {
    if (result.code === 'provider-failed') {
      const reason = result.reason ?? 'no partner link returned'
      console.error(
        '[createPartnerLinkAction] Travelpayouts link generation failed:',
        reason,
      )
      return formError(
        'Travelpayouts partner link could not be generated: ' + reason,
      )
    }

    const message = result.code === 'participant-not-found'
      ? 'Participant was not found'
      : result.code === 'mission-unavailable'
        ? 'Mission is not available'
        : result.code === 'program-unavailable'
          ? 'Affiliate program is not available'
          : result.code === 'partner-link-load-failed'
            ? 'Partner link could not be loaded'
            : 'Partner link could not be saved'
    return formError(message)
  }

  const link = {
    id: result.link.id,
    partner_url: result.link.partnerUrl,
  }
  if (result.kind === 'reused') {
    return { ok: true, link }
  }

  await revalidate([localizedPath(input.locale, studioMissionsPath)])
  return { ok: true, link }
}
