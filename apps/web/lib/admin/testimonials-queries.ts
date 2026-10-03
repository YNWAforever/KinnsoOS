import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type AdminTestimonial = Database['public']['Tables']['testimonials']['Row']

/**
 * Ops full read of the testimonial catalog, drafts included (the
 * `testimonials_ops_all` RLS policy grants ops SELECT over everything; a
 * non-ops caller would see only published rows — but this is only ever
 * called behind requireOpsPage). Errors propagate (no silent []).
 */
export async function listAllTestimonials(supabase: SupabaseClient<Database>): Promise<AdminTestimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
