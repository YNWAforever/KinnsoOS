import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type ExperienceAvailability = {
  id: string
  date: string
  capacity: number
  bookedCount: number
  status: 'open' | 'closed'
}

/** Owner-RLS list of one experience's availability dates, soonest first. Errors propagate. */
export async function listExperienceAvailability(
  supabase: SupabaseClient<Database>,
  experienceId: string,
): Promise<ExperienceAvailability[]> {
  const { data, error } = await supabase
    .from('experience_availability')
    .select('id, date, capacity, booked_count, status')
    .eq('experience_id', experienceId)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    capacity: r.capacity as number,
    bookedCount: r.booked_count as number,
    status: r.status as ExperienceAvailability['status'],
  }))
}
