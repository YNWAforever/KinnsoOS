import type { createSupabaseServerClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface PublishedMission {
  id: string
  title: string
}

/**
 * The merchant's own published, merchant-source missions — the set a merchant
 * can invite a creator into via the creator-search "Send brief" picker.
 * RLS scopes `missions` to the owning merchant; we still filter explicitly.
 */
export async function listMerchantPublishedMissions(
  supabase: Supabase,
  merchantId: string,
): Promise<PublishedMission[]> {
  const { data, error } = await supabase
    .from('missions')
    .select('id, title')
    .eq('merchant_profile_id', merchantId)
    .eq('status', 'published')
    .eq('mission_source', 'merchant')
  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
  }))
}
