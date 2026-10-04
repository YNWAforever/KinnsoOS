import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type MyMerchantProfile = {
  id: string
  slug: string | null
  companyName: string
  contactName: string | null
  contactEmail: string
  websiteUrl: string | null
  tagline: string | null
  city: string | null
  logoUrl: string | null
}

/** Owner-RLS read of the caller's own profile. Errors propagate. */
export async function getMyMerchantProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MyMerchantProfile | null> {
  const { data, error } = await supabase
    .from('merchant_profiles')
    .select('id, slug, company_name, contact_name, contact_email, website_url, tagline, city, logo_url')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    slug: data.slug as string | null,
    companyName: data.company_name as string,
    contactName: data.contact_name as string | null,
    contactEmail: data.contact_email as string,
    websiteUrl: data.website_url as string | null,
    tagline: data.tagline as string | null,
    city: data.city as string | null,
    logoUrl: data.logo_url as string | null,
  }
}
