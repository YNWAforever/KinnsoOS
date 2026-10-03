import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { listRecentAudit, type AuditEntry } from '@/lib/admin/audit'

type Client = SupabaseClient<Database>

export interface MerchantDirectoryRow {
  id: string
  companyName: string
  status: string
  tier: string
  createdAt: string
}
export interface MerchantsDirectory {
  rows: MerchantDirectoryRow[]
  nextCursor: { createdAt: string; id: string } | null
}
export interface ListMerchantsParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  limit?: number
  cursor?: { createdAt: string; id: string } | null
}

type SearchRow = { id: string; company_name: string; status: string; tier: string; created_at: string }

/** Ops-aggregate merchant directory via SECURITY DEFINER admin_search_merchants (keyset).
 *  Fetches limit+1 to derive nextCursor, then trims. Errors propagate. */
export async function listMerchantsDirectory(supabase: Client, params: ListMerchantsParams): Promise<MerchantsDirectory> {
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100)
  const { data, error } = await supabase.rpc('admin_search_merchants', {
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
    p_limit: limit + 1,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
  } as Database['public']['Functions']['admin_search_merchants']['Args'])
  if (error) throw error
  const all = ((data ?? []) as unknown as SearchRow[]).map((r) => ({
    id: r.id, companyName: r.company_name, status: r.status, tier: r.tier, createdAt: r.created_at,
  }))
  const rows = all.slice(0, limit)
  const nextCursor = all.length > limit ? { createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id } : null
  return { rows, nextCursor }
}

export interface MerchantsOverview {
  kpis: {
    total: number
    byStatus: Record<string, number>
    byTier: Record<string, number>
    newInPeriod: number
    newPrevPeriod: number
    missionsLive: number
    settlementsPending: number
    owed: { currency: string; amount: number }[]
    settled: { currency: string; amount: number }[]
  }
  signups: { day: string; count: number }[]
  missionsCreated: { day: string; count: number }[]
  leaderboard: { id: string; companyName: string | null; tier: string; missionsCount: number; creatorsEngaged: number }[]
  atRisk: { id: string; companyName: string | null; reason: string }[]
  recentActivity: AuditEntry[]
}

type AnalyticsPayload = {
  kpis: {
    total: number
    by_status: Record<string, number>
    by_tier: Record<string, number>
    new_in_period: number
    new_prev_period: number
    missions_live: number
    settlements_pending: number
    owed?: { currency: string; amount: number }[]
    settled?: { currency: string; amount: number }[]
  }
  signups?: { day: string; count: number }[]
  missions_created?: { day: string; count: number }[]
  leaderboard?: { id: string; company_name: string | null; tier: string; missions_count: number; creators_engaged: number }[]
  at_risk?: { id: string; company_name: string | null; reason: string }[]
}

/**
 * Ops-aggregate Merchants Overview. Counts/series come from the SECURITY DEFINER
 * `admin_merchant_analytics()` RPC (gated on is_active_ops()). The recent-activity
 * feed reads the shared ops_audit_log. Errors propagate (no silent zeros).
 */
export async function getMerchantsOverview(supabase: Client, days = 30): Promise<MerchantsOverview> {
  const { data, error } = await supabase.rpc('admin_merchant_analytics', { p_days: days })
  if (error || !data) throw error ?? new Error('admin_merchant_analytics returned no data')
  const a = data as unknown as AnalyticsPayload
  const recentActivity = await listRecentAudit(supabase, 'merchant', 20)
  return {
    kpis: {
      total: Number(a.kpis.total),
      byStatus: a.kpis.by_status ?? {},
      byTier: a.kpis.by_tier ?? {},
      newInPeriod: Number(a.kpis.new_in_period),
      newPrevPeriod: Number(a.kpis.new_prev_period),
      missionsLive: Number(a.kpis.missions_live),
      settlementsPending: Number(a.kpis.settlements_pending),
      owed: (a.kpis.owed ?? []).map((o) => ({ currency: o.currency, amount: Number(o.amount) })),
      settled: (a.kpis.settled ?? []).map((s) => ({ currency: s.currency, amount: Number(s.amount) })),
    },
    signups: (a.signups ?? []).map((s) => ({ day: s.day, count: Number(s.count) })),
    missionsCreated: (a.missions_created ?? []).map((m) => ({ day: m.day, count: Number(m.count) })),
    leaderboard: (a.leaderboard ?? []).map((l) => ({
      id: l.id, companyName: l.company_name, tier: l.tier,
      missionsCount: Number(l.missions_count), creatorsEngaged: Number(l.creators_engaged),
    })),
    atRisk: (a.at_risk ?? []).map((r) => ({ id: r.id, companyName: r.company_name, reason: r.reason })),
    recentActivity,
  }
}

export interface MerchantDetailProfile {
  id: string
  companyName: string
  contactName: string | null
  contactEmail: string | null
  websiteUrl: string | null
  status: string
  tier: string
  createdAt: string
  updatedAt: string
}
export interface MerchantDetailMission {
  id: string
  title: string
  status: string
  visibility: string | null
  participantsCount: number
  milestonesTotal: number
  milestonesApproved: number
  createdAt: string
}
export interface MerchantDetailEngagedCreator {
  creatorId: string
  displayName: string | null
  handle: string | null
  participantStatus: string
}
export interface MerchantDetailSettlement {
  id: string
  missionTitle: string
  status: string
  creatorPayoutStatus: string | null
  kinnsoCommissionStatus: string | null
  affiliateCommissionStatus: string | null
  currency: string | null
  creatorPayoutAmount: number | null
  updatedAt: string
}
export interface MerchantDetailMoney { currency: string; amount: number }

export interface MerchantDetail {
  profile: MerchantDetailProfile
  missions: MerchantDetailMission[]
  creators: { engaged: MerchantDetailEngagedCreator[]; savedCount: number }
  billing: {
    settlements: MerchantDetailSettlement[]
    owed: MerchantDetailMoney[]
    settled: MerchantDetailMoney[]
  }
}

type DetailPayload = {
  profile: { id: string; company_name: string; contact_name: string | null; contact_email: string | null; website_url: string | null; status: string; tier: string; created_at: string; updated_at: string }
  missions: { id: string; title: string; status: string; visibility: string | null; participants_count: number; milestones_total: number; milestones_approved: number; created_at: string }[]
  creators: { engaged: { creator_id: string; display_name: string | null; handle: string | null; participant_status: string }[]; saved_count: number }
  billing: {
    settlements: { id: string; mission_title: string; status: string; creator_payout_status: string | null; kinnso_commission_status: string | null; affiliate_commission_status: string | null; currency: string | null; creator_payout_amount: number | null; updated_at: string }[]
    owed: { currency: string; amount: number }[]
    settled: { currency: string; amount: number }[]
  }
}

/**
 * Full ops-aggregate 360 for one merchant. Single SECURITY DEFINER RPC
 * (`admin_merchant_detail`, is_active_ops()-gated) so ops sees all sections despite
 * owner-scoped RLS, including ops-only contact PII. Returns null when the merchant id
 * does not exist (page -> notFound()). Billing is READ-ONLY; owed/settled stay per-currency
 * (never summed). Audit history is fetched separately by the page via listAudit(). Errors propagate.
 */
export async function getMerchantDetail(supabase: Client, merchantId: string): Promise<MerchantDetail | null> {
  const { data, error } = await supabase.rpc('admin_merchant_detail', { p_merchant_id: merchantId })
  if (error) throw error
  if (!data) return null
  const p = data as unknown as DetailPayload
  return {
    profile: {
      id: p.profile.id, companyName: p.profile.company_name,
      contactName: p.profile.contact_name, contactEmail: p.profile.contact_email,
      websiteUrl: p.profile.website_url, status: p.profile.status, tier: p.profile.tier,
      createdAt: p.profile.created_at, updatedAt: p.profile.updated_at,
    },
    missions: (p.missions ?? []).map((m) => ({
      id: m.id, title: m.title, status: m.status, visibility: m.visibility,
      participantsCount: Number(m.participants_count), milestonesTotal: Number(m.milestones_total),
      milestonesApproved: Number(m.milestones_approved), createdAt: m.created_at,
    })),
    creators: {
      engaged: (p.creators?.engaged ?? []).map((e) => ({
        creatorId: e.creator_id, displayName: e.display_name, handle: e.handle, participantStatus: e.participant_status,
      })),
      savedCount: Number(p.creators?.saved_count ?? 0),
    },
    billing: {
      settlements: (p.billing?.settlements ?? []).map((s) => ({
        id: s.id, missionTitle: s.mission_title, status: s.status,
        creatorPayoutStatus: s.creator_payout_status,
        kinnsoCommissionStatus: s.kinnso_commission_status,
        affiliateCommissionStatus: s.affiliate_commission_status,
        currency: s.currency,
        creatorPayoutAmount: s.creator_payout_amount === null ? null : Number(s.creator_payout_amount),
        updatedAt: s.updated_at,
      })),
      owed: (p.billing?.owed ?? []).map((o) => ({ currency: o.currency, amount: Number(o.amount) })),
      settled: (p.billing?.settled ?? []).map((s) => ({ currency: s.currency, amount: Number(s.amount) })),
    },
  }
}

export interface OpsMerchantBudget {
  balance: number
  currency: string
  enforced: boolean
}

/** Ops read of any merchant's budget (RLS ops branch). Null when no row exists yet. */
export async function getMerchantBudgetOps(supabase: Client, merchantProfileId: string): Promise<OpsMerchantBudget | null> {
  const { data, error } = await supabase
    .from('merchant_budgets')
    .select('balance, currency, enforced')
    .eq('merchant_profile_id', merchantProfileId)
    .maybeSingle()
  if (error) throw error
  return data ? { balance: data.balance, currency: data.currency, enforced: data.enforced } : null
}
