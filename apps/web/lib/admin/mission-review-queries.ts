import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface ReviewQueueRow {
  submissionId: string
  missionId: string
  missionTitle: string
  missionType: string | null
  creatorId: string
  status: string
  submittedAt: string | null
  reviewDeadline: string | null
  confidenceStatus: string | null
}

export interface MissionDetailParticipant {
  id: string
  status: string
  source: string
  creatorId: string
  applicationNote: string | null
  approvedAt: string | null
}

export interface MissionDetailMilestone {
  id: string
  title: string
  description: string
  dueAt: string | null
  sortOrder: number
}

export interface MissionDetail {
  mission: {
    id: string
    title: string
    status: string
    missionType: string
    missionSource: string
    merchantProfileId: string | null
    autoApprovePolicy: string
  }
  participants: MissionDetailParticipant[]
  milestones: MissionDetailMilestone[]
  submissions: ReviewQueueRow[]
}

// Nested-select syntax (bare `table(cols)`, no `!inner`, no aliasing) is modeled on
// `creatorMissionDetailSelect` in apps/web/lib/missions/queries.ts, which embeds
// mission_verification_jobs(id,status,confidence_status,created_at) three levels deep
// under missions -> mission_participants -> mission_milestone_submissions. This select
// walks the same submission -> mission_participants -> missions chain, just rooted at
// mission_milestone_submissions instead of missions.
const reviewQueueSelect = `
  id,status,submitted_at,review_deadline,
  mission_participants(id,creator_id,mission_id,missions(id,title,mission_type)),
  mission_verification_jobs(confidence_status,created_at)
`

type OneOrMany<T> = T | T[] | null | undefined

type ReviewQueueJoinRow = {
  id: string
  status: string
  submitted_at: string | null
  review_deadline: string | null
  mission_participants: OneOrMany<{
    id: string
    creator_id: string | null
    mission_id: string
    missions: OneOrMany<{ id: string; title: string; mission_type: string | null }>
  }>
  mission_verification_jobs: Array<{ confidence_status: string | null; created_at: string }> | null
}

const oneJoin = <T>(v: OneOrMany<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

const latestConfidenceStatus = (
  jobs: Array<{ confidence_status: string | null; created_at: string }> | null,
): string | null => {
  if (!jobs || jobs.length === 0) return null
  const latest = [...jobs].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0]
  return latest?.confidence_status ?? null
}

const confidenceBucketRanks: Record<string, number> = { verified_signal: 0, needs_review: 1 }
const confidenceBucketRank = (status: string | null): number => confidenceBucketRanks[status ?? ''] ?? 2

const toReviewQueueRow = (r: ReviewQueueJoinRow): ReviewQueueRow => {
  const participant = oneJoin(r.mission_participants)
  const mission = oneJoin(participant?.missions)
  return {
    submissionId: r.id,
    missionId: mission?.id ?? '',
    missionTitle: mission?.title ?? 'Untitled mission',
    missionType: mission?.mission_type ?? null,
    creatorId: participant?.creator_id ?? '',
    status: r.status,
    submittedAt: r.submitted_at,
    reviewDeadline: r.review_deadline,
    confidenceStatus: latestConfidenceStatus(r.mission_verification_jobs),
  }
}

/**
 * Every submission awaiting an ops decision (status in submitted/revision_requested),
 * sorted by confidence bucket first (verified_signal, then needs_review, then
 * unavailable/null), with review deadline as the tiebreak within a bucket.
 * `confidenceStatus` comes from the most recent mission_verification_jobs row for that
 * submission (by created_at), or null when no verification job has run yet. Errors
 * propagate — no silent empty queue.
 */
export async function getReviewQueue(supabase: Client): Promise<ReviewQueueRow[]> {
  const { data, error } = await supabase
    .from('mission_milestone_submissions')
    .select(reviewQueueSelect)
    .in('status', ['submitted', 'revision_requested'])
    .order('review_deadline', { ascending: true })
  if (error) throw error
  const rows = ((data ?? []) as unknown as ReviewQueueJoinRow[]).map(toReviewQueueRow)
  // Stable sort: rows already arrive deadline-ascending from the query above, so this only
  // reorders BETWEEN buckets and never disturbs the deadline order WITHIN one. Array.prototype.sort
  // has been a stable sort per the JS spec since ES2019 -- no additional deadline comparator needed.
  return rows.sort((a, b) => confidenceBucketRank(a.confidenceStatus) - confidenceBucketRank(b.confidenceStatus))
}

/**
 * One mission's ops-detail view: the mission itself, its participants and milestones,
 * and the subset of the review queue belonging to this mission. Returns null when the
 * mission does not exist (never throws for a plain not-found). Reuses getReviewQueue
 * rather than re-deriving the confidence-status join.
 */
export async function getMissionDetail(supabase: Client, missionId: string): Promise<MissionDetail | null> {
  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id,title,status,mission_type,mission_source,merchant_profile_id,auto_approve_policy')
    .eq('id', missionId)
    .maybeSingle()
  if (missionError) throw missionError
  if (!mission) return null

  const { data: participantsData, error: participantsError } = await supabase
    .from('mission_participants')
    .select('id,status,source,creator_id,application_note,approved_at')
    .eq('mission_id', missionId)
  if (participantsError) throw participantsError

  const { data: milestonesData, error: milestonesError } = await supabase
    .from('mission_milestones')
    .select('id,title,description,due_at,sort_order')
    .eq('mission_id', missionId)
    .order('sort_order', { ascending: true })
  if (milestonesError) throw milestonesError

  const queue = await getReviewQueue(supabase)

  return {
    mission: {
      id: mission.id,
      title: mission.title,
      status: mission.status,
      missionType: mission.mission_type,
      missionSource: mission.mission_source,
      merchantProfileId: mission.merchant_profile_id,
      autoApprovePolicy: mission.auto_approve_policy,
    },
    participants: (participantsData ?? []).map((p) => ({
      id: p.id,
      status: p.status,
      source: p.source,
      creatorId: p.creator_id,
      applicationNote: p.application_note,
      approvedAt: p.approved_at,
    })),
    milestones: (milestonesData ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      dueAt: m.due_at,
      sortOrder: m.sort_order,
    })),
    submissions: queue.filter((row) => row.missionId === missionId),
  }
}
