import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { NewStackSource, PublishedArticle } from '../types'

export interface NewStackConfig {
  baseUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
}

export function tallyLocaleCounts(articles: PublishedArticle[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const a of articles) for (const l of a.locales) counts[l] = (counts[l] ?? 0) + 1
  return counts
}

/** PostgREST's `db-max-rows` cap. An unranged SELECT is truncated here, silently. */
const PAGE_SIZE = 1000

/**
 * Read an ENTIRE table via PostgREST. Without an explicit `.range()` the server applies
 * `db-max-rows` (1000 on Supabase) and returns a 200 with a truncated body — which for a
 * parity gate is the worst possible failure mode: every check would silently be measured
 * against the first 1000 rows and still report PASS.
 *
 * The caller must apply a TOTAL `.order(...)` on a unique column. Row order is otherwise
 * unspecified between requests, so successive ranges could overlap or skip rows.
 * The loop stops on the first short page; a final page that is exactly PAGE_SIZE long
 * costs one extra empty request, which is the cheap side of the trade.
 */
async function fetchAllPages<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Supabase ${label} query failed: ${error.message}`)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}

export function createNewStackSource(cfg: NewStackConfig): NewStackSource {
  const base = cfg.baseUrl.replace(/\/$/, '')
  const sb = createClient<Database>(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } })
  const headers = { 'user-agent': 'kinnso-parity' }
  let cache: PublishedArticle[] | null = null

  async function publishedArticles(): Promise<PublishedArticle[]> {
    if (cache) return cache
    // RLS gates this to visible (published, not-expired, not-deleted) rows only.
    // `url` is unique per article, so ordering by it gives the total order paging needs.
    const data = await fetchAllPages('articles', (from, to) =>
      sb
        .from('articles')
        .select('url, category, is_coupon, article_translations(locale)')
        .order('url')
        .range(from, to))
    cache = data.map((a) => ({
      url: a.url,
      category: a.category as string,
      isCoupon: !!a.is_coupon,
      locales: ((a.article_translations ?? []) as Array<{ locale: string }>).map((t) => t.locale),
    }))
    return cache
  }

  return {
    publishedArticles,
    async localeCounts() {
      return tallyLocaleCounts(await publishedArticles())
    },
    async seoRedirects() {
      // `from_path` is the redirect's unique key — same total-order requirement as above.
      return await fetchAllPages('seo_redirects', (from, to) =>
        sb.from('seo_redirects').select('from_path, to_path').order('from_path').range(from, to))
    },
    async sitemapUrls() {
      const xml = await (await fetch(`${base}/sitemap.xml`, { headers })).text()
      return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname))
    },
    async status(path) {
      return (await fetch(`${base}${path}`, { redirect: 'manual', headers })).status
    },
    async html(path) {
      return await (await fetch(`${base}${path}`, { headers })).text()
    },
    async redirect(path) {
      const res = await fetch(`${base}${path}`, { redirect: 'manual', headers })
      return { status: res.status, location: res.headers.get('location') }
    },
  }
}
