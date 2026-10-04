import { createSupabasePublicClient } from '@/lib/supabase/public'

export type PublicMerchant = {
  id: string
  slug: string
  companyName: string
  tagline: string | null
  city: string | null
  logoUrl: string | null
  websiteUrl: string | null
}

type Row = {
  id: string; slug: string; company_name: string; tagline: string | null
  city: string | null; logo_url: string | null; website_url: string | null; created_at: string
}

function toDomain(r: Row): PublicMerchant {
  return {
    id: r.id, slug: r.slug, companyName: r.company_name, tagline: r.tagline,
    city: r.city, logoUrl: r.logo_url, websiteUrl: r.website_url,
  }
}

const COLUMNS = 'id, slug, company_name, tagline, city, logo_url, website_url, created_at'

/**
 * The whole public directory. merchant_public_profiles already filters to
 * status='active' AND slug IS NOT NULL (view definition) — every row here is
 * listable, no extra predicate needed. Ordered newest-first, slug as a stable
 * tie-break (mirrors getPublicCreators).
 */
export async function getPublicMerchants(): Promise<PublicMerchant[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('merchant_public_profiles')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('slug', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => toDomain(r as unknown as Row))
}

export async function getMerchantBySlug(slug: string): Promise<PublicMerchant | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('merchant_public_profiles')
    .select(COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return toDomain(data as unknown as Row)
}

/** Sitemap feed — reuses the same view, so sitemap ⊆ live pages by construction. */
export async function getMerchantsForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('merchant_public_profiles')
    .select('slug, created_at')
    .order('created_at', { ascending: false })
    .order('slug', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({ slug: r.slug as string, lastmod: (r.created_at as string | null) ?? null }))
}
