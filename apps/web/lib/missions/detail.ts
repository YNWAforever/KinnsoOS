import { canSubmitMilestone } from '@/lib/missions/submission-state'
import { missionEfforts, missionTypes, type MissionEffort, type MissionType } from '@/lib/missions/types'

export type { MissionType }
export type ParticipationCta = 'join' | 'apply' | 'awaiting' | 'rejected' | 'active'
export type MilestoneState = 'none' | 'submitted' | 'approved' | 'revision_requested' | 'rejected'
export type SocialSignalStatus = 'verified_signal' | 'needs_review' | 'unavailable'
export type VerificationStatus = 'queued' | 'fetching' | 'ready' | 'failed'

export type VerificationView = {
  jobId: string
  status: VerificationStatus
  confidence: SocialSignalStatus | null
}

type ProgramRef = { program_url?: string | null; default_commission_description?: string | null }

type ReviewEventRow = {
  reason_category: string | null
  reason_text: string | null
  action: string | null
  created_at: string | null
}

type SubmissionRow = {
  id: string
  mission_milestone_id: string
  status: string | null
  proof_urls: string[] | null
  notes: string | null
  merchant_feedback: string | null
  submitted_at: string | null
  mission_social_snapshots?: Array<{ confidence_status: string | null }> | null
  mission_verification_jobs?: Array<{ id: string; status: string | null; confidence_status: string | null; created_at: string | null }> | null
  mission_review_events?: ReviewEventRow[] | null
}

export type MissionDetailRow = {
  id: string
  title: string | null
  summary: string | null
  mission_source: string | null
  mission_type: string | null
  status: string | null
  coupon_code: string | null
  coupon_url: string | null
  paid_fee_amount: number | null
  paid_fee_currency: string | null
  affiliate_commission_rate: number | null
  creator_commission_rate: number | null
  kinnso_commission_rate: number | null
  max_receipts_per_creator?: number | null
  deliverables?: string[] | null
  requirements?: string[] | null
  dos?: string[] | null
  donts?: string[] | null
  key_messages?: string[] | null
  reference_links?: string[] | null
  effort?: string | null
  affiliate_network_programs?: ProgramRef | ProgramRef[] | null
  mission_milestones?: Array<{ id: string; title: string | null; description: string | null; due_at: string | null; sort_order: number | null; repeatable?: boolean | null }> | null
  mission_participants?: Array<{
    id: string
    status: string | null
    source: string | null
    creator_id: string | null
    application_note: string | null
    mission_milestone_submissions?: SubmissionRow[] | null
  }> | null
  affiliate_partner_links?: Array<{ id: string; partner_url: string | null }> | null
}

export type MilestoneRow = {
  id: string
  title: string
  description: string
  dueAt: string | null
  state: MilestoneState
  signal: SocialSignalStatus | null
  submissionId: string | null
  proofUrl: string | null
  notes: string | null
  merchantFeedback: string | null
  canSubmit: boolean
  verification: VerificationView | null
}

export type ReceiptStatus = 'submitted' | 'approved' | 'revision_requested' | 'rejected'

export type ReceiptSubmissionRow = {
  id: string
  status: ReceiptStatus
  proofUrls: string[]
  notes: string | null
  submittedAt: string | null
  rejectionReason: string | null
}

export type CreatorMissionDetail = {
  id: string
  title: string
  summary: string
  missionSource: 'merchant' | 'travelpayouts'
  missionType: MissionType
  status: string
  compensation: string
  couponCode: string | null
  couponUrl: string | null
  partnerLinks: Array<{ id: string; partnerUrl: string }>
  participantId: string | null
  participantStatus: string | null
  cta: ParticipationCta
  milestones: MilestoneRow[]
  maxReceiptsPerCreator: number | null
  receiptSubmissions: ReceiptSubmissionRow[]
  deliverables: string[]
  requirements: string[]
  dos: string[]
  donts: string[]
  keyMessages: string[]
  referenceLinks: string[]
  effort: MissionEffort | null
}

// Derives from the canonical missionTypes array rather than enumerating members inline, so a
// future mission type is recognized automatically the moment it's added to types.ts -- no
// second site to remember and update by hand (the exact bug class that let receipt_cashback
// get silently miscategorized as coupon_affiliate here before it was fixed one-off).
const toMissionType = (type: string | null): MissionType =>
  (missionTypes as readonly string[]).includes(type ?? '') ? (type as MissionType) : 'coupon_affiliate'

export function resolveParticipationCta(
  participantStatus: string | null,
  missionType: MissionType,
): ParticipationCta {
  if (!participantStatus) return missionType === 'coupon_affiliate' ? 'join' : 'apply'
  if (participantStatus === 'active' || participantStatus === 'completed') return 'active'
  if (participantStatus === 'rejected' || participantStatus === 'cancelled') return 'rejected'
  return 'awaiting'
}

const SUBMITTED_STATES: Record<string, MilestoneState> = {
  submitted: 'submitted',
  approved: 'approved',
  revision_requested: 'revision_requested',
  rejected: 'rejected',
}

const SIGNAL_STATUSES = new Set<SocialSignalStatus>(['verified_signal', 'needs_review', 'unavailable'])
const VERIFICATION_STATUSES = new Set<VerificationStatus>(['queued', 'fetching', 'ready', 'failed'])

const signalFrom = (
  snapshots: Array<{ confidence_status: string | null }> | null | undefined,
): SocialSignalStatus | null => {
  const statuses = (snapshots ?? []).map((s) => s.confidence_status)
  if (statuses.includes('verified_signal')) return 'verified_signal'
  if (statuses.includes('needs_review')) return 'needs_review'
  if (statuses.length > 0) return 'unavailable'
  return null
}

function latestVerification(jobs: SubmissionRow['mission_verification_jobs']): VerificationView | null {
  if (!jobs || jobs.length === 0) return null
  const sorted = jobs.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const job = sorted[0]
  const status = (job.status ?? '') as VerificationStatus
  if (!VERIFICATION_STATUSES.has(status)) return null
  const confidence = SIGNAL_STATUSES.has((job.confidence_status ?? '') as SocialSignalStatus)
    ? (job.confidence_status as SocialSignalStatus)
    : null
  return { jobId: job.id, status, confidence }
}

export function buildMilestoneRows(
  milestones: MissionDetailRow['mission_milestones'],
  submissions: SubmissionRow[] | null | undefined,
  participantStatus: string | null = null,
): MilestoneRow[] {
  const latest = new Map<string, SubmissionRow>()
  for (const sub of submissions ?? []) {
    const existing = latest.get(sub.mission_milestone_id)
    if (!existing || (sub.submitted_at ?? '') >= (existing.submitted_at ?? '')) {
      latest.set(sub.mission_milestone_id, sub)
    }
  }
  return (milestones ?? [])
    // A repeatable milestone (receipt_cashback's auto-created "Submit a receipt" row) is
    // rendered by its own receipt-submission UI, which shows every submission rather than
    // just the latest one -- it never belongs in this fixed-checklist, latest-only list.
    .filter((milestone) => milestone.repeatable !== true)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((milestone) => {
      const sub = latest.get(milestone.id)
      const state: MilestoneState = sub && sub.status ? (SUBMITTED_STATES[sub.status] ?? 'none') : 'none'
      const rawSignal = sub ? signalFrom(sub.mission_social_snapshots) : null
      return {
        id: milestone.id,
        title: milestone.title ?? '',
        description: milestone.description ?? '',
        dueAt: milestone.due_at ?? null,
        state,
        signal: state !== 'none' && rawSignal === null && sub ? 'unavailable' : rawSignal,
        submissionId: sub?.id ?? null,
        proofUrl: sub?.proof_urls?.[0] ?? null,
        notes: sub?.notes ?? null,
        merchantFeedback: sub?.merchant_feedback ?? null,
        canSubmit: canSubmitMilestone(participantStatus, state),
        verification: latestVerification(sub?.mission_verification_jobs),
      }
    })
}

const RECEIPT_STATUSES = new Set<ReceiptStatus>(['submitted', 'approved', 'revision_requested', 'rejected'])

function latestReasonCategory(events: SubmissionRow['mission_review_events']): string | null {
  if (!events || events.length === 0) return null
  const sorted = events.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  return sorted[0].reason_category ?? null
}

// Unlike buildMilestoneRows (latest-submission-only, one row per fixed milestone), a
// repeatable milestone can be submitted against many times by the same participant, so
// every submission against it is its own row here, newest first. The rejection reason
// comes from mission_review_events -- merchant_feedback on the submission itself is free
// text, but Task 4's receipt-specific taxonomy (unreadable/wrong_venue/duplicate/
// amount_unclear/other) only lives on the review event, same as R11.0's reason_category
// for every other mission type.
export function buildReceiptSubmissions(
  milestones: MissionDetailRow['mission_milestones'],
  submissions: SubmissionRow[] | null | undefined,
): ReceiptSubmissionRow[] {
  const repeatableMilestoneId = (milestones ?? []).find((m) => m.repeatable === true)?.id
  if (!repeatableMilestoneId) return []
  return (submissions ?? [])
    .filter((sub) => sub.mission_milestone_id === repeatableMilestoneId)
    .slice()
    .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))
    .map((sub) => {
      const status = RECEIPT_STATUSES.has((sub.status ?? '') as ReceiptStatus) ? (sub.status as ReceiptStatus) : 'submitted'
      return {
        id: sub.id,
        status,
        proofUrls: sub.proof_urls ?? [],
        notes: sub.notes ?? null,
        submittedAt: sub.submitted_at ?? null,
        rejectionReason: status === 'rejected' || status === 'revision_requested' ? latestReasonCategory(sub.mission_review_events) : null,
      }
    })
}

type CompensationRow = Pick<
  MissionDetailRow,
  'mission_source' | 'mission_type' | 'paid_fee_amount' | 'paid_fee_currency' | 'affiliate_commission_rate' | 'creator_commission_rate' | 'affiliate_network_programs'
>

export function missionCompensation(row: CompensationRow): string {
  const paid = typeof row.paid_fee_amount === 'number'
    ? `${row.paid_fee_currency ?? 'HKD'} ${row.paid_fee_amount}`
    : null
  const program = Array.isArray(row.affiliate_network_programs)
    ? row.affiliate_network_programs[0]
    : row.affiliate_network_programs
  const affiliate = row.mission_source === 'travelpayouts'
    ? (program?.default_commission_description?.trim() || 'Affiliate commission')
    : (typeof row.creator_commission_rate === 'number' && typeof row.affiliate_commission_rate === 'number'
        ? `Affiliate commission ${row.creator_commission_rate}% creator / ${row.affiliate_commission_rate}% total`
        : 'Affiliate commission')
  if (row.mission_type === 'hybrid' && paid) return `${paid} + ${affiliate}`
  return paid ?? affiliate
}

const MISSION_EFFORTS = new Set<MissionEffort>(missionEfforts)

const narrowEffort = (effort: string | null | undefined): MissionEffort | null =>
  effort != null && MISSION_EFFORTS.has(effort as MissionEffort) ? (effort as MissionEffort) : null

export function toCreatorMissionDetail(row: MissionDetailRow, creatorId: string): CreatorMissionDetail {
  const participant = row.mission_participants?.find((p) => p.creator_id === creatorId) ?? null
  const missionType = toMissionType(row.mission_type)
  return {
    id: row.id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    missionSource: row.mission_source === 'travelpayouts' ? 'travelpayouts' : 'merchant',
    missionType,
    status: row.status ?? 'published',
    compensation: missionCompensation(row),
    couponCode: row.coupon_code,
    couponUrl: row.coupon_url,
    partnerLinks: (row.affiliate_partner_links ?? []).map((link) => ({ id: link.id, partnerUrl: link.partner_url ?? '' })),
    participantId: participant?.id ?? null,
    participantStatus: participant?.status ?? null,
    cta: resolveParticipationCta(participant?.status ?? null, missionType),
    milestones: buildMilestoneRows(
      row.mission_milestones,
      participant?.mission_milestone_submissions ?? null,
      participant?.status ?? null,
    ),
    maxReceiptsPerCreator: row.max_receipts_per_creator ?? null,
    receiptSubmissions: buildReceiptSubmissions(
      row.mission_milestones,
      participant?.mission_milestone_submissions ?? null,
    ),
    deliverables: row.deliverables ?? [],
    requirements: row.requirements ?? [],
    dos: row.dos ?? [],
    donts: row.donts ?? [],
    keyMessages: row.key_messages ?? [],
    referenceLinks: row.reference_links ?? [],
    effort: narrowEffort(row.effort),
  }
}
