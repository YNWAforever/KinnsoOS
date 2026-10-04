import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { Guide } from '@/lib/guides/types'
import type { GuideDetail } from '@/lib/guides/types'
import { sanitizeMatchTerms } from '@/lib/search/sanitize-match-terms'

interface GuideRowLite {
  slug: string
  title: string
  cover_url: string | null
  city: string
  saves_count: number
  creator_handle: string
}

export function mapRowToGuide(r: GuideRowLite): Guide {
  return {
    slug: r.slug,
    title: r.title,
    cover: r.cover_url ?? null,
    city: r.city,
    saves: r.saves_count,
    creatorHandle: r.creator_handle,
  }
}

/**
 * Published guides, newest first.
 *
 * Surfaces a query failure rather than swallowing it. This previously
 * destructured only `data`, so a failed read was indistinguishable from an
 * empty catalogue — and `/explore` is statically regenerated every 300s across
 * seven locales, which meant a single failed regeneration served a cheerful
 * "no guides yet" page for five minutes per locale, with nothing logged.
 *
 * "Unavailable" and "empty" are different facts and callers must be able to
 * tell them apart. A caller that genuinely prefers degrading — a homepage band,
 * say — opts in explicitly with `optionalQuery`, which records the failure
 * instead of hiding it. This matches `getPublishedDestinations` and
 * `getPublishedGuidesForCreator`, which already throw.
 */
export async function getPublishedGuides(limit?: number): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  let query = supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (limit !== undefined) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapRowToGuide)
}

export async function getAttributedGuidesForMerchant(merchantId: string, limit?: number): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  const cap = normalizeAttributedGuidesLimit(limit)
  let query = supabase.rpc('get_attributed_guides_for_merchant', {
    p_merchant_id: merchantId,
    p_limit: cap,
  })
  query = query.limit(cap)
  const { data, error } = await query
  if (error) throw error

  const guides = new Map<string, Guide>()
  for (const row of data ?? []) {
    const guide = mapRowToGuide(row as GuideRowLite)
    if (!guides.has(guide.slug)) guides.set(guide.slug, guide)
  }
  return [...guides.values()]

/** Undefined and non-finite values use the safe 20-card default; finite
 * positives are floored, negatives clamp to zero, and callers cannot exceed
 * the database contract's 20-row cap. */
function normalizeAttributedGuidesLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20
  return Math.min(Math.max(Math.floor(limit as number), 0), 20)
}
}

/**
 * Surfaces a query failure rather than emitting a sitemap with every guide
 * missing. A sitemap that silently drops a whole content type is worse than one
 * that fails: a failed generation makes a crawler retry and keep the last known
 * good, whereas a successful-but-empty section actively tells it those URLs are
 * gone. Every sibling here already throws -- merchants, experiences, sessions
 * and destinations -- so this was the lone outlier.
 */
export async function getGuidesForSitemap(): Promise<{ slug: string; lastmod: string | null }[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('guides')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .order('slug') // stable tie-break so sitemap sharding partitions a deterministic order
  if (error) throw error
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    lastmod: (r.published_at as string | null) ?? null,
  }))
}

/**
 * R1C heuristic cross-link (master spec §5): guides whose city matches any of
 * an article's region strings. PostgREST .or() treats commas/parens as syntax,
 * so region strings are sanitized to [letters/numbers/spaces/hyphens] before
 * interpolation; sub-2-char fragments are dropped as noise. Reads never crash
 * the article page — failures degrade to [] (same stance as getPublishedGuides).
 */
export async function getGuidesForRegions(regions: string[], limit = 3): Promise<Guide[]> {
  const clean = sanitizeMatchTerms(regions)
  if (clean.length === 0) return []
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('guides')
      .select('slug, title, cover_url, city, saves_count, creator_handle')
      .eq('status', 'published')
      .or(clean.map((r) => `city.ilike.%${r}%`).join(','))
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(mapRowToGuide)
  } catch {
    return []
  }
}

/**
 * Editorial override (D-R6C-1, force-add only): guides ops has explicitly pinned to this
 * article, shown ahead of and merged with the heuristic getGuidesForRegions matches. A
 * pinned guide that's no longer published (or was deleted) is silently dropped rather
 * than shown broken. This is a structured id lookup, not a regex/ILIKE heuristic match,
 * so no try/catch is needed here — same convention as getGuideBySlug: supabase-js resolves
 * {data, error} rather than throwing, and try/catch in this file is reserved for the
 * string-manipulating matchers (getGuidesForRegions) that interpolate into `.or()`/`.ilike()`.
 */
export async function getGuideOverridesForArticle(articleId: string): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  const { data: overrides } = await supabase
    .from('article_guide_overrides')
    .select('guide_id')
    .eq('article_id', articleId)
    .order('sort_order', { ascending: true })
  const guideIds = (overrides ?? []).map((o) => o.guide_id as string)
  if (guideIds.length === 0) return []

  const { data: rows } = await supabase
    .from('guides')
    .select('id, slug, title, cover_url, city, saves_count, creator_handle')
    .in('id', guideIds)
    .eq('status', 'published')
  const byId = new Map((rows ?? []).map((r) => [r.id as string, mapRowToGuide(r)]))
  return guideIds.map((id) => byId.get(id)).filter((g): g is Guide => g !== undefined)
}

export async function getGuideBySlug(slug: string): Promise<GuideDetail | null> {
  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('guides')
    .select('id, slug, title, cover_url, city, saves_count, creator_handle, creator_name, creator_id, summary, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!data) return null
  return {
    ...mapRowToGuide(data),
    id: data.id as string,
    creatorId: (data.creator_id as string | null) ?? null,
    summary: data.summary,
    creatorName: data.creator_name,
    publishedAt: (data.published_at as string | null) ?? null,
    source: 'db',
  }
}
