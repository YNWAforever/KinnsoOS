import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export interface SavedExperienceEntry {
  experienceId: string
  slug: string
  title: string
  city: string
  priceAmount: number
  currency: string
  coverUrl: string | null
  savesCount: number
}

interface SavedExperienceQueryRow {
  experience_id: string
  experiences: {
    slug: string; title: string; city: string; price_amount: number
    currency: string; cover_url: string | null; saves_count: number
  } | Array<{
    slug: string; title: string; city: string; price_amount: number
    currency: string; cover_url: string | null; saves_count: number
  }> | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** The experiences a traveller has saved, newest first. RLS scopes experience_saves to the caller. */
export async function listSavedExperiences(
  supabase: SupabaseClient<Database>,
  travelerUserId: string,
): Promise<SavedExperienceEntry[]> {
  const { data, error } = await supabase
    .from('experience_saves')
    .select('experience_id, experiences(slug, title, city, price_amount, currency, cover_url, saves_count)')
    .eq('traveler_user_id', travelerUserId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return ((data ?? []) as unknown as SavedExperienceQueryRow[]).flatMap((row) => {
    const e = one(row.experiences)
    if (!e) return []
    return [{
      experienceId: row.experience_id,
      slug: e.slug,
      title: e.title,
      city: e.city,
      priceAmount: Number(e.price_amount),
      currency: e.currency,
      coverUrl: e.cover_url,
      savesCount: e.saves_count,
    }]
  })
}

/** Whether the given traveller has already saved this experience. */
export async function isExperienceSaved(
  supabase: SupabaseClient<Database>,
  experienceId: string,
  travelerUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('experience_saves')
    .select('id')
    .eq('experience_id', experienceId)
    .eq('traveler_user_id', travelerUserId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}
