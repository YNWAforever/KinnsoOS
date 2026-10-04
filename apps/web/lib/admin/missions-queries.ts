import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface MissionsOverview {
  kpis: {
    total: number
    byStatus: Record<string, number>
    byType: Record<string, number>
    byVisibility: Record<string, number>
    openForApplications: number
    submissionsAwaitingReview: number
  }
  missionsCreated: { day: string; count: number }[]
  submissionsReviewed: { day: string; count: number }[]
  atRisk: { id: string; title: string; merchantName: string | null; reason: string }[]
}

type AnalyticsPayload = {
  kpis: {
    total: number
    by_status?: Record<string, number>
    by_type?: Record<string, number>
    by_visibility?: Record<string, number>
    open_for_applications: number
    submissions_awaiting_review: number
  }
  missions_created?: { day: string; count: number }[]
  submissions_reviewed?: { day: string; count: number }[]
  at_risk?: { id: string; title: string; merchant_name: string | null; reason: string }[]
}

/**
 * Ops-aggregate Missions Overview. Backed by the SECURITY DEFINER
 * `admin_mission_analytics()` RPC (gated on is_active_ops()). Scope is
 * mission_source='merchant' only, enforced inside the RPC. Errors propagate
 * (no silent zeros).
 */
export async function getMissionsOverview(supabase: Client, days = 30): Promise<MissionsOverview> {
  const { data, error } = await supabase.rpc('admin_mission_analytics', { p_days: days })
  if (error || !data) throw error ?? new Error('admin_mission_analytics returned no data')
  const a = data as unknown as AnalyticsPayload
  return {
    kpis: {
      total: Number(a.kpis.total),
      byStatus: a.kpis.by_status ?? {},
      byType: a.kpis.by_type ?? {},
      byVisibility: a.kpis.by_visibility ?? {},
      openForApplications: Number(a.kpis.open_for_applications),
      submissionsAwaitingReview: Number(a.kpis.submissions_awaiting_review),
    },
    missionsCreated: (a.missions_created ?? []).map((m) => ({ day: m.day, count: Number(m.count) })),
    submissionsReviewed: (a.submissions_reviewed ?? []).map((s) => ({ day: s.day, count: Number(s.count) })),
    atRisk: (a.at_risk ?? []).map((r) => ({ id: r.id, title: r.title, merchantName: r.merchant_name, reason: r.reason })),
  }
}

export interface MissionAttention {
  overdueReviews: { submissionId: string; missionId: string; missionTitle: string; creatorId: string; reviewDeadline: string }[]
  atRiskMissions: { id: string; title: string; merchantName: string | null; reason: string }[]
  redemptionVelocity: { offerId: string; offerTitle: string; merchantName: string | null; redemptionsLastHour: number }[]
}

type AttentionPayload = {
  overdue_reviews?: { submission_id: string; mission_id: string; mission_title: string; creator_id: string; review_deadline: string }[]
  at_risk_missions?: { id: string; title: string; merchant_name: string | null; reason: string }[]
  redemption_velocity?: { offer_id: string; offer_title: string; merchant_name: string | null; redemptions_last_hour: number }[]
}

/** Backed by the SECURITY DEFINER admin_mission_attention() RPC (gated on is_active_ops()). */
export async function getMissionAttention(supabase: Client): Promise<MissionAttention> {
  const { data, error } = await supabase.rpc('admin_mission_attention')
  if (error || !data) throw error ?? new Error('admin_mission_attention returned no data')
  const a = data as unknown as AttentionPayload
  return {
    overdueReviews: (a.overdue_reviews ?? []).map((r) => ({
      submissionId: r.submission_id, missionId: r.mission_id, missionTitle: r.mission_title,
      creatorId: r.creator_id, reviewDeadline: r.review_deadline,
    })),
    atRiskMissions: (a.at_risk_missions ?? []).map((r) => ({
      id: r.id, title: r.title, merchantName: r.merchant_name, reason: r.reason,
    })),
    redemptionVelocity: (a.redemption_velocity ?? []).map((v) => ({
      offerId: v.offer_id, offerTitle: v.offer_title, merchantName: v.merchant_name,
      redemptionsLastHour: Number(v.redemptions_last_hour),
    })),
  }
}
