import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type AdminPerk = Database['public']['Tables']['partner_perks']['Row']

/**
 * Ops-only full read of the perk catalog (includes redemption_value). Visible only
 * to ops because partner_perks is gated by the `partner_perks_ops_all` RLS policy —
 * a non-ops authenticated caller sees zero rows. Errors propagate (no silent []).
 */
export async function listAllPerks(supabase: SupabaseClient<Database>): Promise<AdminPerk[]> {
  const { data, error } = await supabase
    .from('partner_perks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
