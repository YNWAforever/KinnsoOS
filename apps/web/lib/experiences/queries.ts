import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type MyExperience = {
  id: string
  slug: string
  title: string
  city: string
  priceAmount: number
  currency: string
  status: 'draft' | 'published' | 'paused'
  updatedAt: string
}

/** Owner-RLS list of the caller merchant's experiences, newest first. Errors propagate. */
export async function listMyExperiences(
  supabase: SupabaseClient<Database>,
  merchantId: string,
): Promise<MyExperience[]> {
  const { data, error } = await supabase
    .from('experiences')
    .select('id, slug, title, city, price_amount, currency, status, updated_at')
    .eq('merchant_profile_id', merchantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    city: r.city as string,
    priceAmount: Number(r.price_amount),
    currency: r.currency as string,
    status: r.status as MyExperience['status'],
    updatedAt: r.updated_at as string,
  }))
}

export type MyExperienceDetail = MyExperience & {
  summary: string | null
  description: string | null
  durationMinutes: number | null
  coverUrl: string | null
}

/** One owned experience for the edit form. Null when missing/not owned (RLS). */
export async function getMyExperience(
  supabase: SupabaseClient<Database>,
  merchantId: string,
  id: string,
): Promise<MyExperienceDetail | null> {
  const { data, error } = await supabase
    .from('experiences')
    .select('id, slug, title, summary, description, city, price_amount, currency, duration_minutes, cover_url, status, updated_at')
    .eq('merchant_profile_id', merchantId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    slug: data.slug as string,
    title: data.title as string,
    summary: data.summary as string | null,
    description: data.description as string | null,
    city: data.city as string,
    priceAmount: Number(data.price_amount),
    currency: data.currency as string,
    durationMinutes: data.duration_minutes as number | null,
    coverUrl: data.cover_url as string | null,
    status: data.status as MyExperience['status'],
    updatedAt: data.updated_at as string,
  }
}
