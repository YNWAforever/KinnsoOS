import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { progressToNext, type TierProgress, type ContributionEventType, type Tier } from '@/lib/contribution/tiers'

export type CreatorContribution = TierProgress

/** Owner-scoped: the projection is RLS-gated to creator_id = auth.uid(). */
export async function getCreatorContribution(
  supabase: SupabaseClient<Database>,
  creatorId: string,
): Promise<CreatorContribution> {
  const { data } = await supabase
    .from('creator_contribution')
    .select('contribution_points, tier')
    .eq('creator_id', creatorId)
    .maybeSingle()
  return progressToNext(data?.contribution_points ?? 0)
}

/**
 * Owner-scoped read of the *stored* contribution tier column — the authoritative
 * value used for mission gating (the enforcement path in joinMissionAction and the
 * display paths on the studio mission pages). Distinct from getCreatorContribution,
 * which derives a TierProgress from points. A missing row defaults to 'seed' (open).
 */
export async function getCreatorStoredTier(
  supabase: SupabaseClient<Database>,
  creatorId: string,
): Promise<Tier> {
  const { data } = await supabase
    .from('creator_contribution')
    .select('tier')
    .eq('creator_id', creatorId)
    .maybeSingle()
  return (data?.tier as Tier | undefined) ?? 'seed'
}

export interface ContributionEvent {
  id: string
  eventType: ContributionEventType
  points: number
  createdAt: string
}

export async function listContributionEvents(
  supabase: SupabaseClient<Database>,
  creatorId: string,
): Promise<ContributionEvent[]> {
  const { data } = await supabase
    .from('creator_contribution_events')
    .select('id, event_type, points, created_at')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((e) => ({
    id: e.id as string,
    eventType: e.event_type as ContributionEventType,
    points: e.points as number,
    createdAt: e.created_at as string,
  }))
}
