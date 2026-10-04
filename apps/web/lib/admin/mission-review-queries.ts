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
  submissionsNextCursor?: ReviewQueueCursor | null
}

export type ReviewQueueCursor = { bucket: number; deadline: string; id: string; scope: string }
export type ReviewQueueFilter = { missionId?: string; status?: 'submitted' | 'revision_requested' }
export type ReviewQueuePage = { items: ReviewQueueRow[]; nextCursor: ReviewQueueCursor | null }
/** Filtering, latest confidence, ordering and keyset pagination happen in the DB. */
export async function getReviewQueuePage(supabase: Client, filter: ReviewQueueFilter = {}, cursor: ReviewQueueCursor | null = null): Promise<ReviewQueuePage> {
  const { data, error } = await supabase.rpc('get_kinnso_review_queue', { p_filter: filter, p_cursor: cursor, p_limit: 50 })
  if (error) throw error
  return data as unknown as ReviewQueuePage
}
export async function getReviewQueue(supabase: Client, filter: ReviewQueueFilter = {}): Promise<ReviewQueueRow[]> {
  return (await getReviewQueuePage(supabase, filter)).items
}

/**
 * One mission's ops-detail view: the mission itself, its participants and milestones,
 * and its first page of mission-scoped review submissions. Returns null when the
 * mission does not exist (never throws for a plain not-found). Reuses getReviewQueue
 * rather than re-deriving the confidence-status join.
 */
export async function getMissionDetail(supabase: Client, missionId: string, cursor: ReviewQueueCursor | null = null): Promise<MissionDetail | null> {
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

  const queue = await getReviewQueuePage(supabase, { missionId }, cursor)

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
    submissions: queue.items,
    submissionsNextCursor: queue.nextCursor,
  }
}
