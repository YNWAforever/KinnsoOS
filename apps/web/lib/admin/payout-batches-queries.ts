import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export type PayoutBatchStatus = 'pending' | 'paid' | 'cancelled'

export interface PayoutBatchRow {
  id: string
  creatorId: string
  creatorName: string | null
  currency: string
  amount: number
  status: PayoutBatchStatus
  targetAt: string
  createdAt: string
  paidAt: string | null
  cancelledAt: string | null
}

type RawPayoutBatch = {
  id: string
  creator_id: string
  creator_name: string | null
  currency: string
  amount: number | string
  status: PayoutBatchStatus
  target_at: string
  created_at: string
  paid_at: string | null
  cancelled_at: string | null
}

const num = (v: number | string) => (typeof v === 'string' ? Number(v) : v)

/** All payout batches (ops-aggregate), optionally filtered by status. Errors propagate. */
export async function getPayoutBatches(supabase: Client, status?: PayoutBatchStatus): Promise<PayoutBatchRow[]> {
  const { data, error } = await supabase.rpc('admin_list_payout_batches', { p_status: status ?? null })
  if (error) throw error
  return ((data ?? []) as RawPayoutBatch[]).map((r) => ({
    id: r.id,
    creatorId: r.creator_id,
    creatorName: r.creator_name,
    currency: r.currency,
    amount: num(r.amount),
    status: r.status,
    targetAt: r.target_at,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    cancelledAt: r.cancelled_at,
  }))
}
