import { createSupabasePublicClient } from '@/lib/supabase/public'
import { sanitizeMatchTerm, sanitizeMatchTerms } from '@/lib/search/sanitize-match-terms'

export type PublicExperience = {
  id: string
  slug: string
  title: string
  summary: string | null
  description: string | null
  city: string
  priceAmount: number
  currency: string
  durationMinutes: number | null
  coverUrl: string | null
  publishedAt: string | null
  savesCount: number
  merchant: { slug: string; companyName: string }
}

const EXP_COLUMNS = 'id, slug, title, summary, description, city, price_amount, currency, duration_minutes, cover_url, merchant_profile_id, published_at, saves_count'

type ExpRow = {
  id: string; slug: string; title: string; summary: string | null; description: string | null
  city: string; price_amount: number; currency: string; duration_minutes: number | null
  cover_url: string | null; merchant_profile_id: string; published_at: string | null
  saves_count: number
}

function toDomain(r: ExpRow, merchant: { slug: string; companyName: string }): PublicExperience {
  return {
    id: r.id, slug: r.slug, title: r.title, summary: r.summary, description: r.description,
    city: r.city, priceAmount: Number(r.price_amount), currency: r.currency,
    durationMinutes: r.duration_minutes, coverUrl: r.cover_url, publishedAt: r.published_at,
    savesCount: r.saves_count,
    merchant,
  }
}

/**
 * Anon has NO read grant on merchant_profiles (PII table) — attribution must go
 * through the PII-safe merchant_public_profiles view, in a SEPARATE query. Do not
 * attempt a PostgREST embed (`experiences.select('*, merchant_profiles(...)')`) here;
 * it would either fail under RLS or, if it somehow succeeded, leak contact fields.
 */
export async function getExperienceBySlug(slug: string): Promise<PublicExperience | null> {
  const supabase = createSupabasePublicClient()
  const { data: exp, error: expError } = await supabase
    .from('experiences')
    .select(EXP_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (expError) throw expError
  if (!exp) return null

  const { data: merchant, error: merchantError } = await supabase
    .from('merchant_public_profiles')
    .select('slug, company_name')
    .eq('id', (exp as unknown as ExpRow).merchant_profile_id)
    .maybeSingle()
  if (merchantError) throw merchantError
  if (!merchant) return null

  return toDomain(exp as unknown as ExpRow, { slug: merchant.slug as string, companyName: merchant.company_name as string })
}

/** Published experiences for one merchant, for the /m/[slug] grid. RLS already scopes to published+active. */
export async function listPublishedExperiencesForMerchant(merchantId: string): Promise<PublicExperience[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('experiences')
    .select(EXP_COLUMNS)
    .eq('merchant_profile_id', merchantId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw error
  // Caller already knows the merchant (it's who we're scoping to) — no second query.
  return (data ?? []).map((r) => toDomain(r as unknown as ExpRow, { slug: '', companyName: '' }))
}

/** RLS already restricts to status='published' rows of active merchants — same filter here for clarity/index use. */
export async function getExperiencesForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('experiences')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ slug: r.slug as string, lastmod: (r.published_at as string | null) ?? null }))
}

/** Same shape as getExperienceBySlug, keyed by id — used by the checkout
 * action, which only has the id (never re-derive price/currency from
 * anything client-supplied). */
export async function getExperienceById(id: string): Promise<PublicExperience | null> {
  const supabase = createSupabasePublicClient()
  const { data: exp, error: expError } = await supabase
    .from('experiences')
    .select(EXP_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (expError) throw expError
  if (!exp) return null

  const { data: merchant, error: merchantError } = await supabase
    .from('merchant_public_profiles')
    .select('slug, company_name')
    .eq('id', (exp as unknown as ExpRow).merchant_profile_id)
    .maybeSingle()
  if (merchantError) throw merchantError
  if (!merchant) return null

  return toDomain(exp as unknown as ExpRow, { slug: merchant.slug as string, companyName: merchant.company_name as string })
}

/**
 * Published experiences matching a city, for the embedded-CTA components on
 * article/guide pages (D-R3-7). RLS on `experiences` already restricts anon
 * reads to published + active-merchant rows (same as getExperiencesForSitemap)
 * — no merchant join needed here, same no-second-query shape as
 * listPublishedExperiencesForMerchant. Reads never crash the host page —
 * failures degrade to [] (same stance as getGuidesForRegions).
 */
export async function getExperiencesForCity(city: string, limit = 3): Promise<PublicExperience[]> {
  const clean = sanitizeMatchTerm(city)
  if (clean.length < 2) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('experiences')
      .select(EXP_COLUMNS)
      .eq('status', 'published')
      .ilike('city', `%${clean}%`)
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map((r) => toDomain(r as unknown as ExpRow, { slug: '', companyName: '' }))
  } catch {
    return []
  }
}

/**
 * Same as getExperiencesForCity but matches ANY of several sanitized terms via .or() —
 * mirrors getGuidesForRegions's array-of-terms shape (apps/web/lib/guides/queries.ts) for
 * destination pages whose match_terms can include neighborhood aliases alongside the
 * destination's own name. Reads never crash the destination page — failures degrade to
 * [], same stance as getExperiencesForCity.
 */
export async function getExperiencesForCities(cities: string[], limit = 6): Promise<PublicExperience[]> {
  const clean = sanitizeMatchTerms(cities)
  if (clean.length === 0) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('experiences')
      .select(EXP_COLUMNS)
      .eq('status', 'published')
      .or(clean.map((c) => `city.ilike.%${c}%`).join(','))
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map((r) => toDomain(r as unknown as ExpRow, { slug: '', companyName: '' }))
  } catch {
    return []
  }
}

/**
 * Editorial override (D-R6C-1, force-add only): experiences ops has explicitly pinned to
 * this article, shown ahead of and merged with the heuristic getExperiencesForCity
 * matches. No merchant join (same no-second-query placeholder shape as
 * getExperiencesForCity) -- a pinned experience no longer found is silently dropped.
 */
export async function getExperienceOverridesForArticle(articleId: string): Promise<PublicExperience[]> {
  const supabase = createSupabasePublicClient()
  const { data: overrides } = await supabase
    .from('article_experience_overrides')
    .select('experience_id')
    .eq('article_id', articleId)
    .order('sort_order', { ascending: true })
  const experienceIds = (overrides ?? []).map((o) => o.experience_id as string)
  if (experienceIds.length === 0) return []

  const { data: rows } = await supabase
    .from('experiences')
    .select(EXP_COLUMNS)
    .in('id', experienceIds)
    .eq('status', 'published')
  const byId = new Map((rows ?? []).map((r) => [(r as unknown as ExpRow).id, toDomain(r as unknown as ExpRow, { slug: '', companyName: '' })]))
  return experienceIds.map((id) => byId.get(id)).filter((e): e is PublicExperience => e !== undefined)
}
