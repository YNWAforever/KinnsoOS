// apps/web/lib/saves/guide-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { mapRowToGuide } from '@/lib/guides/queries'
import type { Guide } from '@/lib/guides/types'

export interface SavedGuideEntry {
  guideId: string
  guide: Guide
}

interface SavedGuideQueryRow {
  guide_id: string
  guides: { slug: string; title: string; city: string; cover_url: string; saves_count: number; creator_handle: string }
    | { slug: string; title: string; city: string; cover_url: string; saves_count: number; creator_handle: string }[]
    | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** The guides a traveller has saved, newest first. RLS scopes guide_saves to the caller. */
export async function listSavedGuides(
  supabase: SupabaseClient<Database>,
  travelerUserId: string,
): Promise<SavedGuideEntry[]> {
  const { data, error } = await supabase
    .from('guide_saves')
    .select('guide_id, guides(slug, title, city, cover_url, saves_count, creator_handle)')
    .eq('traveler_user_id', travelerUserId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return ((data ?? []) as unknown as SavedGuideQueryRow[]).flatMap((row) => {
    const g = one(row.guides)
    if (!g) return []
    return [{ guideId: row.guide_id, guide: mapRowToGuide(g) }]
  })
}

/** Whether the given traveller has already saved this guide. */
export async function isGuideSaved(
  supabase: SupabaseClient<Database>,
  guideId: string,
  travelerUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('guide_saves')
    .select('id')
    .eq('guide_id', guideId)
    .eq('traveler_user_id', travelerUserId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}
