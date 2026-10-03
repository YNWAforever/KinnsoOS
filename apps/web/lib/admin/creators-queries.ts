import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { listRecentAudit, type AuditEntry } from '@/lib/admin/audit'
import { listOpsSettlements } from '@/lib/missions/queries'
import { type SettlementStatus } from '@/lib/admin/creators-validation'

type Client = SupabaseClient<Database>

/** Where a settlement row came from. Derived, never stored — the shape of the row is the
 *  evidence: an affiliate event embed, a mission fee amount, or neither (a legacy or
 *  hand-created row that predates R10.1's minting triggers). */
export type SettlementSource = 'affiliate' | 'mission_fee' | 'manual'

export interface PayoutRow {
  id: string
  missionTitle: string
  source: SettlementSource
  creatorId: string | null
  status: string
  creatorPayoutStatus: string | null
  kinnsoCommissionStatus: string | null
  affiliateCommissionStatus: string | null
  currency: string | null
  creatorCommissionAmount: number | null
  kinnsoCommissionAmount: number | null
  affiliateCommissionAmount: number | null
  opsNote: string | null
}

/** Money figures are grouped by currency — settlements may be in different currencies,
 *  so summing across them would be dishonest. Empty arrays mean "nothing owed/settled". */
export interface PayoutsSummary {
  total: number
  byStatus: Record<string, number>
  owed: { currency: string; amount: number }[]
  settled: { currency: string; amount: number }[]
}

export interface PayoutsQueue {
  rows: PayoutRow[]
  summary: PayoutsSummary
}

type OpsSettlementJoinRow = {
  id: string
  status: string | null
  creator_payout_status: string | null
  kinnso_commission_status: string | null
  affiliate_commission_status: string | null
  amount_currency: string | null
  creator_commission_amount: number | null
  kinnso_commission_amount: number | null
  affiliate_commission_amount: number | null
  paid_fee_amount: number | null
  ops_note: string | null
  missions?: { title?: string | null } | Array<{ title?: string | null }> | null
  mission_participants?: { creator_id?: string | null } | Array<{ creator_id?: string | null }> | null
  affiliate_network_events?: { id?: string | null } | Array<{ id?: string | null }> | null
}

const oneJoin = <T>(v: T | T[] | null | undefined): T | null =>
  (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

const toPayoutRow = (r: OpsSettlementJoinRow): PayoutRow => {
  const mission = oneJoin(r.missions)
  const participant = oneJoin(r.mission_participants)
  const affiliateEvent = oneJoin(r.affiliate_network_events)
  const source: SettlementSource = affiliateEvent?.id
    ? 'affiliate'
    : r.paid_fee_amount !== null
      ? 'mission_fee'
      : 'manual'
  return {
    id: r.id,
    missionTitle: mission?.title ?? 'Untitled mission',
    source,
    creatorId: participant?.creator_id ?? null,
    status: r.status ?? 'not_started',
    creatorPayoutStatus: r.creator_payout_status,
    kinnsoCommissionStatus: r.kinnso_commission_status,
    affiliateCommissionStatus: r.affiliate_commission_status,
    currency: r.amount_currency,
    creatorCommissionAmount: r.creator_commission_amount,
    kinnsoCommissionAmount: r.kinnso_commission_amount,
    affiliateCommissionAmount: r.affiliate_commission_amount,
    opsNote: r.ops_note,
  }
}

const sumByCurrency = (rows: PayoutRow[]): { currency: string; amount: number }[] => {
  const acc = new Map<string, number>()
  for (const r of rows) {
    const cur = r.currency ?? 'unknown'
    const amt = r.creatorCommissionAmount ?? 0
    acc.set(cur, (acc.get(cur) ?? 0) + amt)
  }
  return [...acc.entries()].map(([currency, amount]) => ({ currency, amount }))
}

/**
 * The full settlement queue across all creators (ops-aggregate). Reads via the ops
 * RLS path (`mission_settlements_visible_select` exposes all rows to ops). Errors
 * propagate. The summary always reflects the FULL queue; `opts.status` only filters
 * the returned `rows` so the money-flow cards stay stable while ops drills into a status.
 */
export async function getSettlementsQueue(
  supabase: Client,
  opts: { status?: SettlementStatus; source?: SettlementSource },
): Promise<PayoutsQueue> {
  const { data, error } = await listOpsSettlements(supabase)
  if (error) throw error
  const all = ((data ?? []) as unknown as OpsSettlementJoinRow[]).map(toPayoutRow)

  const byStatus: Record<string, number> = {}
  for (const r of all) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1

  const summary: PayoutsSummary = {
    total: all.length,
    byStatus,
    owed: sumByCurrency(all.filter((r) => r.creatorPayoutStatus === 'pending')),
    settled: sumByCurrency(all.filter((r) => r.creatorPayoutStatus === 'paid')),
  }

  // The summary stays over the FULL queue so the money-flow cards do not move while ops
  // drills into a facet — the existing rule for `status`, extended to `source`.
  const rows = all.filter(
    (r) => (!opts.status || r.status === opts.status) && (!opts.source || r.source === opts.source),
  )
  return { rows, summary }
}

export interface CreatorsOverview {
  kpis: {
    total: number
    byStatus: Record<string, number>
    newInPeriod: number
    newPrevPeriod: number
    payoutsPending: number
  }
  signups: { day: string; count: number }[]
  engagement: { day: string; points: number }[]
  leaderboard: { creatorId: string; displayName: string | null; points: number; tier: string }[]
  atRisk: { creatorId: string; displayName: string | null; reason: string }[]
  recentActivity: AuditEntry[]
}

type AnalyticsPayload = {
  kpis: {
    total: number
    by_status: Record<string, number>
    new_in_period: number
    new_prev_period: number
    payouts_pending: number
  }
  signups?: { day: string; count: number }[]
  engagement?: { day: string; points: number }[]
  leaderboard?: { creator_id: string; display_name: string | null; points: number; tier: string }[]
  at_risk?: { creator_id: string; display_name: string | null; reason: string }[]
}

/**
 * Ops-aggregate Creators Overview. Counts/series come from the SECURITY DEFINER
 * `admin_creator_analytics()` RPC (gated on is_active_ops()) so an ops user sees
 * platform-wide data despite owner-scoped RLS. The recent-activity feed reads the
 * shared ops_audit_log. Errors propagate (no silent zeros).
 */
export async function getCreatorsOverview(supabase: Client, days = 30): Promise<CreatorsOverview> {
  const { data, error } = await supabase.rpc('admin_creator_analytics', { p_days: days })
  if (error || !data) throw error ?? new Error('admin_creator_analytics returned no data')
  const a = data as unknown as AnalyticsPayload
  const recentActivity = await listRecentAudit(supabase, 'creator', 20)
  return {
    kpis: {
      total: Number(a.kpis.total),
      byStatus: a.kpis.by_status ?? {},
      newInPeriod: Number(a.kpis.new_in_period),
      newPrevPeriod: Number(a.kpis.new_prev_period),
      payoutsPending: Number(a.kpis.payouts_pending),
    },
    signups: (a.signups ?? []).map((s) => ({ day: s.day, count: Number(s.count) })),
    engagement: (a.engagement ?? []).map((e) => ({ day: e.day, points: Number(e.points) })),
    leaderboard: (a.leaderboard ?? []).map((l) => ({
      creatorId: l.creator_id, displayName: l.display_name, points: Number(l.points), tier: l.tier,
    })),
    atRisk: (a.at_risk ?? []).map((r) => ({
      creatorId: r.creator_id, displayName: r.display_name, reason: r.reason,
    })),
    recentActivity,
  }
}

export interface DirectoryRow {
  id: string
  displayName: string | null
  handle: string | null
  status: string
  verified: boolean
  tier: string | null
  dnaStatus: string | null
  contributionPoints: number
  createdAt: string
}

export interface CreatorsDirectory {
  rows: DirectoryRow[]
  nextCursor: { createdAt: string; id: string } | null
}

export interface ListDirectoryParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  dna?: 'published' | 'draft' | 'none'
  verified?: boolean
  limit?: number
  cursor?: { createdAt: string; id: string } | null
}

type SearchRow = {
  id: string
  display_name: string | null
  handle: string | null
  status: string
  verified: boolean
  tier: string | null
  dna_status: string | null
  contribution_points: number | null
  created_at: string
}

/**
 * Filtered, keyset-paginated creator directory for ops. Goes through the
 * SECURITY DEFINER `admin_search_creators` RPC (is_active_ops()-gated) so an ops
 * user sees all creators despite owner-scoped RLS. Errors propagate.
 */
export async function listCreatorsDirectory(supabase: Client, params: ListDirectoryParams): Promise<CreatorsDirectory> {
  const limit = params.limit ?? 25
  const { data, error } = await supabase.rpc('admin_search_creators', {
    // Explicit `null` (not `undefined`) for every optional filter, matching this
    // RPC's own `default null` params and this file's existing test assertions.
    // The generated Args type below is imprecise here (typed `string | undefined`,
    // not `string | null | undefined`, for a SQL param whose default IS null) --
    // cast rather than drop the explicit nulls, since PostgREST treats an omitted
    // key and an explicit null identically over the wire, but tests here assert
    // the exact literal value passed to the client.
    p_search: params.search ?? null,
    p_statuses: params.statuses ?? null,
    p_tiers: params.tiers ?? null,
    p_dna: params.dna ?? null,
    p_verified: params.verified ?? null,
    p_limit: limit,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
  } as Database['public']['Functions']['admin_search_creators']['Args'])
  if (error) throw error
  const raw = (data ?? []) as SearchRow[]
  const rows: DirectoryRow[] = raw.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    handle: r.handle,
    status: r.status,
    verified: r.verified,
    tier: r.tier,
    dnaStatus: r.dna_status,
    contributionPoints: Number(r.contribution_points ?? 0),
    createdAt: r.created_at,
  }))
  const last = rows[rows.length - 1]
  const nextCursor = rows.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null
  return { rows, nextCursor }
}

export interface CreatorDetailProfile {
  id: string
  displayName: string | null
  handle: string | null
  status: string
  verified: boolean
  isListed: boolean
  bio: string | null
  createdAt: string
  updatedAt: string
}
export interface CreatorDetailContribution { points: number; tier: string; tierUpdatedAt: string | null }
export interface CreatorDetailDna { id: string; status: string; model: string | null; draftReadyAt: string | null; updatedAt: string }
export interface CreatorDetailScan { id: string; status: string; error: string | null; startedAt: string | null; completedAt: string | null; createdAt: string }
export interface CreatorDetailSocial { platform: string; handle: string; url: string | null }
export interface CreatorDetailMission { participantId: string; missionId: string; title: string; status: string; source: string; approvedAt: string | null; createdAt: string; submissionsTotal: number; submissionsApproved: number; submissionsPending: number }
export interface CreatorDetailSettlement { id: string; missionTitle: string; status: string; creatorPayoutStatus: string | null; creatorCommissionAmount: number | null; currency: string | null; createdAt: string }
export interface CreatorDetailPointsEvent { id: string; eventType: string; points: number; createdAt: string }
export interface CreatorDetailContent { id: string; title: string; slug: string; status: string; savesCount: number; publishedAt: string | null; createdAt: string }

export interface CreatorDetail {
  creator: CreatorDetailProfile
  contribution: CreatorDetailContribution | null
  dna: CreatorDetailDna | null
  scan: CreatorDetailScan | null
  socials: CreatorDetailSocial[]
  missions: CreatorDetailMission[]
  settlements: CreatorDetailSettlement[]
  pointsEvents: CreatorDetailPointsEvent[]
  content: CreatorDetailContent[]
}

type DetailPayload = {
  creator: { id: string; display_name: string | null; handle: string | null; status: string; verified: boolean; is_listed: boolean; bio: string | null; created_at: string; updated_at: string }
  contribution: { points: number; tier: string; tier_updated_at: string | null } | null
  dna: { id: string; status: string; model: string | null; draft_ready_at: string | null; updated_at: string } | null
  scan: { id: string; status: string; error: string | null; started_at: string | null; completed_at: string | null; created_at: string } | null
  socials: { platform: string; handle: string; url: string | null }[]
  missions: { participant_id: string; mission_id: string; title: string; status: string; source: string; approved_at: string | null; created_at: string; submissions_total: number; submissions_approved: number; submissions_pending: number }[]
  settlements: { id: string; mission_title: string; status: string; creator_payout_status: string | null; creator_commission_amount: number | null; amount_currency: string | null; created_at: string }[]
  points_events: { id: string; event_type: string; points: number; created_at: string }[]
  content: { id: string; title: string; slug: string; status: string; saves_count: number; published_at: string | null; created_at: string }[]
}

/**
 * Full ops-aggregate 360 for one creator. Single SECURITY DEFINER RPC
 * (`admin_creator_detail`, is_active_ops()-gated) so ops sees all sections despite
 * owner-scoped RLS. Returns null when the creator id does not exist (page -> notFound()).
 * Audit history is fetched separately by the page via listAudit(). Errors propagate.
 */
export async function getCreatorDetail(supabase: Client, creatorId: string): Promise<CreatorDetail | null> {
  const { data, error } = await supabase.rpc('admin_creator_detail', { p_creator_id: creatorId })
  if (error) throw error
  if (!data) return null
  const p = data as unknown as DetailPayload
  return {
    creator: {
      id: p.creator.id, displayName: p.creator.display_name, handle: p.creator.handle,
      status: p.creator.status, verified: p.creator.verified, isListed: p.creator.is_listed, bio: p.creator.bio,
      createdAt: p.creator.created_at, updatedAt: p.creator.updated_at,
    },
    contribution: p.contribution
      ? { points: Number(p.contribution.points), tier: p.contribution.tier, tierUpdatedAt: p.contribution.tier_updated_at }
      : null,
    dna: p.dna
      ? { id: p.dna.id, status: p.dna.status, model: p.dna.model, draftReadyAt: p.dna.draft_ready_at, updatedAt: p.dna.updated_at }
      : null,
    scan: p.scan
      ? { id: p.scan.id, status: p.scan.status, error: p.scan.error, startedAt: p.scan.started_at, completedAt: p.scan.completed_at, createdAt: p.scan.created_at }
      : null,
    socials: (p.socials ?? []).map((s) => ({ platform: s.platform, handle: s.handle, url: s.url })),
    missions: (p.missions ?? []).map((m) => ({
      participantId: m.participant_id, missionId: m.mission_id, title: m.title,
      status: m.status, source: m.source, approvedAt: m.approved_at, createdAt: m.created_at,
      submissionsTotal: Number(m.submissions_total), submissionsApproved: Number(m.submissions_approved), submissionsPending: Number(m.submissions_pending),
    })),
    settlements: (p.settlements ?? []).map((s) => ({
      id: s.id, missionTitle: s.mission_title, status: s.status,
      creatorPayoutStatus: s.creator_payout_status,
      creatorCommissionAmount: s.creator_commission_amount === null ? null : Number(s.creator_commission_amount),
      currency: s.amount_currency, createdAt: s.created_at,
    })),
    pointsEvents: (p.points_events ?? []).map((e) => ({ id: e.id, eventType: e.event_type, points: Number(e.points), createdAt: e.created_at })),
    content: (p.content ?? []).map((g) => ({
      id: g.id, title: g.title, slug: g.slug, status: g.status,
      savesCount: Number(g.saves_count), publishedAt: g.published_at, createdAt: g.created_at,
    })),
  }
}
