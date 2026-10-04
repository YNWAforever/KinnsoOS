import type { createSupabaseServerClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface SavedCreator {
  creatorId: string
  handle: string | null
  name: string
  note: string
}

/**
 * The creators a merchant has saved, joined to public creator display data.
 * RLS scopes `merchant_saved_creators` to the owning merchant; we still filter
 * by `merchantId` for clarity. Public attributes only — no private metrics.
 */
export async function listSavedCreators(
  supabase: Supabase,
  merchantId: string,
): Promise<SavedCreator[]> {
  const { data, error } = await supabase
    .from('merchant_saved_creators')
    .select('creator_id, note, creators(handle, display_name)')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((row) => {
    const creator = (row.creators ?? {}) as { handle?: string | null; display_name?: string | null }
    const handle = creator.handle ?? null
    return {
      creatorId: row.creator_id as string,
      handle,
      name: creator.display_name ?? handle ?? (row.creator_id as string),
      note: (row.note as string | null) ?? '',
    }
  })
}
