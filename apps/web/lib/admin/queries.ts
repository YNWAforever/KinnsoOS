import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>
export interface AdminOverview {
  creators: number
  merchants: number
  ops: number
  perksActive: number
  perksTotal: number
  redemptions: number
}

/**
 * Dashboard overview. Counts come from the SECURITY DEFINER `admin_overview_counts()`
 * RPC (gated internally on `is_active_ops()`) so an ops user sees platform-wide totals
 * despite the owner-scoped RLS on creators/merchant_profiles/kinnso_ops_members — a
 * direct `count()` under the ops session would only ever see their own rows. Errors
 * propagate (no silent zeros).
 */
export async function getAdminOverview(supabase: Client): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview_counts').single()
  if (error || !data) throw error ?? new Error('admin_overview_counts returned no row')
  return {
    creators: Number(data.creators),
    merchants: Number(data.merchants),
    ops: Number(data.ops),
    perksActive: Number(data.perks_active),
    perksTotal: Number(data.perks_total),
    redemptions: Number(data.redemptions),
  }
}
