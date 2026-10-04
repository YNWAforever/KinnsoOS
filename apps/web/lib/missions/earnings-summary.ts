import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { bucketEarningsByCurrency, type EarningsCurrencyTotal } from '@/lib/missions/earnings'

type Client = SupabaseClient<Database>

export type EarningsPayoutStatus = 'paid' | 'pending'

export type MissionEarningItem = {
  id: string
  missionTitle: string
  missionType: string
  missionSource: string
  currency: string
  amount: number
  payoutStatus: EarningsPayoutStatus
}

export type BookingEarningItem = {
  id: string
  experienceTitle: string
  currency: string
  amount: number
  payoutStatus: EarningsPayoutStatus
}

/** Recorded affiliate volume that is not payable yet. Never summed into a total. */
export type TrackedAffiliateItem = {
  id: string
  missionTitle: string
  currency: string
  grossAmount: number
  eventState: string
}

export type CreatorEarningsSummary = {
  missions: MissionEarningItem[]
  bookings: BookingEarningItem[]
  tracked: TrackedAffiliateItem[]
  totals: EarningsCurrencyTotal[]
}

interface RawCreatorEarningsSummary {
  mission_settlements?: Array<{
    id: string
    mission_title: string | null
    mission_type: string | null
    mission_source: string | null
    currency: string | null
    amount: number | string | null
    payout_status: string | null
  }>
  booking_settlements?: Array<{
    id: string
    experience_title: string | null
    currency: string | null
    amount: number | string | null
    payout_status: string | null
  }>
  tracked_affiliate?: Array<{
    id: string
    mission_title: string | null
    currency: string | null
    gross_amount: number | string | null
    event_state: string | null
  }>
}

// Postgres numeric/bigint arrive as strings over PostgREST; without this, money fields
// concatenate instead of adding. Same helper shape as lib/insights/creator.ts.
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))

const toPayoutStatus = (v: string | null): EarningsPayoutStatus => (v === 'paid' ? 'paid' : 'pending')

/**
 * Payable totals only. Tracked affiliate volume is excluded by construction: it is recorded,
 * not settled, and R7.3 forbids presenting it as money the creator has earned.
 */
export function summarizeSettledEarnings(
  missions: MissionEarningItem[],
  bookings: BookingEarningItem[],
): EarningsCurrencyTotal[] {
  return bucketEarningsByCurrency([...missions, ...bookings])
}

export async function getCreatorEarningsSummary(supabase: Client): Promise<CreatorEarningsSummary> {
  const { data, error } = await supabase.rpc('creator_earnings_summary')
  if (error || !data) throw error ?? new Error('creator_earnings_summary returned no data')
  const raw = data as unknown as RawCreatorEarningsSummary

  const missions: MissionEarningItem[] = (raw.mission_settlements ?? []).map((r) => ({
    id: r.id,
    missionTitle: r.mission_title ?? '',
    missionType: r.mission_type ?? '',
    missionSource: r.mission_source ?? '',
    currency: r.currency ?? 'USD',
    amount: num(r.amount),
    payoutStatus: toPayoutStatus(r.payout_status),
  }))

  const bookings: BookingEarningItem[] = (raw.booking_settlements ?? []).map((r) => ({
    id: r.id,
    experienceTitle: r.experience_title ?? '',
    currency: r.currency ?? 'USD',
    amount: num(r.amount),
    payoutStatus: toPayoutStatus(r.payout_status),
  }))

  const tracked: TrackedAffiliateItem[] = (raw.tracked_affiliate ?? []).map((r) => ({
    id: r.id,
    missionTitle: r.mission_title ?? '',
    currency: r.currency ?? 'USD',
    grossAmount: num(r.gross_amount),
    eventState: r.event_state ?? 'unknown',
  }))

  return { missions, bookings, tracked, totals: summarizeSettledEarnings(missions, bookings) }
}

export type PayoutBatchStatus = 'pending' | 'paid' | 'cancelled'

export type CreatorPayoutBatch = {
  id: string
  currency: string
  amount: number
  status: PayoutBatchStatus
  targetAt: string
  createdAt: string
  paidAt: string | null
  cancelledAt: string | null
}

type RawCreatorPayoutBatch = {
  id: string
  currency: string
  amount: number | string
  status: PayoutBatchStatus
  target_at: string
  created_at: string
  paid_at: string | null
  cancelled_at: string | null
}

/** The caller's own payout batches (R10.2). Errors propagate — no silent empty result. */
export async function getCreatorPayoutBatches(supabase: Client): Promise<CreatorPayoutBatch[]> {
  const { data, error } = await supabase.rpc('creator_payout_batches_mine')
  if (error) throw error
  return ((data ?? []) as RawCreatorPayoutBatch[]).map((b) => ({
    id: b.id,
    currency: b.currency,
    amount: num(b.amount),
    status: b.status,
    targetAt: b.target_at,
    createdAt: b.created_at,
    paidAt: b.paid_at,
    cancelledAt: b.cancelled_at,
  }))
}
