import { createSupabasePublicClient } from '@/lib/supabase/public'

export type PublicAvailability = {
  id: string
  date: string
  remaining: number
}

/**
 * Anon-safe list of open, future dates for one experience, for the public
 * booking widget. RLS (experience_availability_public_read) already restricts
 * to status='open', date >= current_date, and a bookable (published +
 * active-merchant) experience — filters here are for clarity/index use, same
 * convention as getExperiencesForSitemap. Sold-out dates (remaining=0) are
 * still returned, not filtered out, so the widget can render them as
 * disabled/"sold out" rather than silently vanishing.
 */
export async function listPublicAvailability(experienceId: string): Promise<PublicAvailability[]> {
  const supabase = createSupabasePublicClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('experience_availability')
    .select('id, date, capacity, booked_count')
    .eq('experience_id', experienceId)
    .eq('status', 'open')
    .gte('date', today)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    remaining: Math.max(0, (r.capacity as number) - (r.booked_count as number)),
  }))
}
