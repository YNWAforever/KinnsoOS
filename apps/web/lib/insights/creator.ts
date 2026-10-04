import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { progressToNext, type TierProgress, type ContributionEventType } from '@/lib/contribution/tiers'

type Client = SupabaseClient<Database>

export interface CreatorInsights {
  pointsTotal: number
  pointsByType: Record<ContributionEventType, number>
  trajectory: { weekStart: string; cumulative: number }[]
  tier: TierProgress
  guidesPublished: number
  guideSavesTotal: number
  missionsByStatus: { applied: number; active: number; invited: number; rejected: number }
  submissionsApproved: number
  visitsDriven: number
}

interface RawCreatorInsights {
  points_total: number
  points_before_window: number
  points_by_type: Partial<Record<ContributionEventType, number>>
  points_trajectory: { week_start: string; points: number }[]
  guides_published: number
  guide_saves_total: number
  missions_by_status: Partial<Record<string, number>>
  submissions_approved: number
  visits_driven: number
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))

export async function getCreatorInsights(supabase: Client): Promise<CreatorInsights> {
  const { data, error } = await supabase.rpc('creator_insights')
  if (error || !data) throw error ?? new Error('creator_insights returned no data')
  const raw = data as unknown as RawCreatorInsights

  let running = num(raw.points_before_window)
  const trajectory = (raw.points_trajectory ?? []).map((p) => {
    running += num(p.points)
    return { weekStart: p.week_start, cumulative: running }
  })

  const pointsTotal = num(raw.points_total)
  const status = raw.missions_by_status ?? {}
  return {
    pointsTotal,
    pointsByType: {
      dna_scan: num(raw.points_by_type?.dna_scan),
      guide_published: num(raw.points_by_type?.guide_published),
      mission_verified: num(raw.points_by_type?.mission_verified),
    },
    trajectory,
    tier: progressToNext(pointsTotal),
    guidesPublished: num(raw.guides_published),
    guideSavesTotal: num(raw.guide_saves_total),
    // The RPC aggregates every participant status, but we surface only the four the
    // app actually drives. `completed` is never written (delivered work is shown via
    // submissionsApproved instead) and `cancelled` is rare — both are intentionally omitted.
    missionsByStatus: {
      applied: num(status.applied),
      active: num(status.active),
      invited: num(status.invited),
      rejected: num(status.rejected),
    },
    submissionsApproved: num(raw.submissions_approved),
    visitsDriven: num(raw.visits_driven),
  }
}
