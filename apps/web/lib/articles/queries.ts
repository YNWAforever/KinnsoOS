import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import {
  LOCALES,
  isLocale,
  toUrlCategory,
  type DbCategory,
  type Locale,
} from '@/lib/i18n/config'
import { indexableArticleLocales, type ArticleSeoTranslation } from '@/lib/seo/article-indexability'

// Plain anon client so this helper is testable in Node without Next's
// request-scoped `cookies()`. RLS still hides unpublished/expired rows.
const db = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
  )

export interface CreatorArticleCard {
  id: string
  url: string
  category: string
  title: string
  summary: string
  thumbnail: string | null
  publishedAt: string
}

export async function getPublishedArticlesForCreator(handle: string, locale: Locale, limit = 6): Promise<CreatorArticleCard[]> {
  const client = db()
  const { data: author, error: authorError } = await client
    .from('article_authors')
    .select('slug')
    .eq('slug', handle)
    .eq('locale', locale)
    .eq('is_active', true)
    .maybeSingle()
  if (authorError) throw authorError
  if (!author) return []

  const { data, error } = await client
    .from('articles')
    .select('id, url, category, thumbnails, published_at, article_translations!inner(locale, title, summary)')
    .contains('authors', [handle])
    .is('deleted_at', null)
    .not('published_at', 'is', null)
    .eq('article_translations.locale', locale)
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  return (data ?? []).flatMap((article) => {
    const translation = (article.article_translations ?? []).find((item) => item.locale === locale)
    if (!translation || !article.published_at) return []
    return [{
      id: article.id, url: article.url, category: article.category,
      title: translation.title ?? '', summary: translation.summary ?? '',
      thumbnail: article.thumbnails?.[0] ?? null, publishedAt: article.published_at,
    }]
  })
}

/** Pick the best translation for a requested locale: exact match → `en` → first available. */
function pickTranslation<T extends { locale: string }>(translations: T[], locale: string): T | null {
  if (translations.length === 0) return null
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === 'en') ??
    translations[0]
  )
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 150))
    }
  }
  throw lastErr
}

export async function getArticleByUrl(url: string, locale: string) {
  const { data, error } = await db()
    .from('articles')
    .select('*, article_translations(*)')
    .eq('url', url)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const translation = pickTranslation(data.article_translations ?? [], locale)
  return { ...data, translation }
}

export interface ArticleDetail {
  id: string; url: string; slug: string; category: string; thumbnails: string[]
  authors: string[]; regions: string[]; tag_slugs: string[]; rating: number | null
  views: number; published_at: string | null; end_at: string | null; edit_at: string | null
  is_coupon: boolean
  translation: {
    title: string | null; content: unknown; summary: string | null
    meta_title: string | null; meta_description: string | null
    og_image: string | null; faq_title: string | null; locale: string
  } | null
  faqs: Array<{ question: string; answer: string; weight: number }>
  author: { name: string; title: string | null; bio: string | null; avatar: string | null } | null
}

/** Detail fetch: article (RLS-gated) for a given URL **category + url**, requested-locale translation,
 *  FAQs (visible, weight desc) and the first active author. Returns null when not visible or category mismatches. */
export const getArticleDetail = cache((
  urlCategory: string, url: string, locale: Locale,
): Promise<ArticleDetail | null> => withRetry(async () => {
  const { data, error } = await db()
    .from('articles')
    .select('*, article_translations(*)')
    .eq('url', url)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  if (toUrlCategory(data.category) !== urlCategory) return null

  const translation = pickTranslation(data.article_translations ?? [], locale)

  const firstSlug = (data.authors ?? [])[0]

  const [faqResult, authorResult] = await Promise.all([
    db()
      .from('article_faqs')
      .select('question, answer, weight')
      .eq('article_id', data.id).eq('locale', locale)
      .order('weight', { ascending: false }),
    firstSlug
      ? db()
          .from('article_authors')
          .select('name, title, bio, avatar')
          .eq('slug', firstSlug).eq('locale', locale).eq('is_active', true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const { data: faqRows, error: faqError } = faqResult
  if (faqError) throw faqError
  const faqs = faqRows ?? []

  const { data: au, error: authorError } = authorResult
  if (authorError) throw authorError
  const author: ArticleDetail['author'] = au ?? null

  return {
    id: data.id, url: data.url, slug: data.slug, category: data.category,
    thumbnails: data.thumbnails, authors: data.authors, regions: data.regions,
    tag_slugs: data.tag_slugs, rating: data.rating, views: data.views,
    published_at: data.published_at, end_at: data.end_at, edit_at: data.edit_at,
    is_coupon: data.is_coupon,
    translation: translation
      ? {
          title: translation.title, content: translation.content, summary: translation.summary,
          meta_title: translation.meta_title, meta_description: translation.meta_description,
          og_image: translation.og_image, faq_title: translation.faq_title, locale: translation.locale,
        }
      : null,
    faqs, author,
  }
}))

type ArticleSeoRow = {
  url: string
  category: string
  is_coupon: boolean
  end_at: string | null
  edit_at: string | null
  updated_at: string | null
  published_at: string | null
  article_translations: Array<{
    locale: string
    title: string | null
    summary: string | null
    meta_description: string | null
    content: unknown
  }>
}

const getArticleSeoRows = cache(async (): Promise<ArticleSeoRow[]> => {
  const { data, error } = await db()
    .from('articles')
    .select(
      'url, category, is_coupon, end_at, edit_at, updated_at, published_at, ' +
      'article_translations(locale, title, summary, meta_description, content)',
    )
    .order('url')
  if (error) throw error
  return (data ?? []) as unknown as ArticleSeoRow[]
})

function seoTranslations(row: ArticleSeoRow): ArticleSeoTranslation[] {
  return row.article_translations.flatMap((translation) =>
    isLocale(translation.locale)
      ? [{
          locale: translation.locale,
          title: translation.title,
          summary: translation.summary,
          metaDescription: translation.meta_description,
          content: translation.content,
        }]
      : [],
  )
}

function indexableLocalesFor(row: ArticleSeoRow): Locale[] {
  return indexableArticleLocales(seoTranslations(row), row.is_coupon)
}

/**
 * One article's SEO row. `articles.url` is UNIQUE, so this returns exactly the
 * row a scan of the corpus would have found — without transferring every
 * article's full translation `content` to decide the indexability of one page.
 */
const getArticleSeoRow = cache(async (url: string): Promise<ArticleSeoRow | null> => {
  const { data, error } = await db()
    .from('articles')
    .select(
      'url, category, is_coupon, end_at, edit_at, updated_at, published_at, ' +
      'article_translations(locale, title, summary, meta_description, content)',
    )
    .eq('url', url)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as unknown as ArticleSeoRow | null
})

export const getIndexableArticleLocales = cache(
  async (url: string): Promise<Locale[]> => {
    const row = await getArticleSeoRow(url)
    return row ? indexableLocalesFor(row) : []
  },
)

export const getIndexableCategoryLocales = cache(
  async (category: DbCategory): Promise<Locale[]> => {
    const found = new Set<Locale>()
    for (const row of await getArticleSeoRows()) {
      if (row.category !== category) continue
      for (const locale of indexableLocalesFor(row)) found.add(locale)
    }
    return LOCALES.filter((locale) => found.has(locale))
  },
)
export async function getYouMayLike(articleId: string, locale: Locale, limit = 5) {
  return withRetry(async () => {
    const { data, error } = await db().rpc('get_you_may_like', {
      p_article_id: articleId, p_locale: locale, p_limit: limit,
    })
    if (error) throw error
    return data ?? []
  })
}

export interface SearchParams {
  locale: Locale; category?: string | null; q?: string | null
  region?: string | null; tag?: string | null; page?: number; perPage?: number
}
export interface SearchResult {
  items: Array<{
    url: string; category: string; thumbnails: string[]; rating: number | null
    published_at: string | null; edit_at: string | null; title: string | null; summary: string | null
  }>
  total: number; page: number; perPage: number
}

// Note: when the requested page is beyond the last page the RPC returns 0 rows,
// so `total` reports 0 (the window count rides on the rows). This is fine for ISR
// listing pagination which can't reach an out-of-range page.
export async function searchArticles(p: SearchParams): Promise<SearchResult> {
  const page = Math.max(1, p.page ?? 1)
  const perPage = p.perPage ?? 12
  return withRetry(async () => {
    const { data, error } = await db().rpc('search_articles', {
      p_locale: p.locale,
      ...(p.category != null && { p_category: p.category }),
      ...(p.q != null && { p_q: p.q }),
      ...(p.region != null && { p_region: p.region }),
      ...(p.tag != null && { p_tag: p.tag }),
      p_limit: perPage, p_offset: (page - 1) * perPage,
    })
    if (error) throw error
    const rows = data ?? []
    const total = rows.length ? Number(rows[0].total_count) : 0
    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip total_count from each item
      items: rows.map(({ total_count, ...r }) => r),
      total, page, perPage,
    }
  })
}

export async function getPublishedForSitemap() {
  return (await getArticleSeoRows()).flatMap((row) => {
    const locales = indexableLocalesFor(row)
    return locales.length > 0
      ? [{
          url: row.url,
          category: row.category,
          lastmod: row.edit_at ?? row.updated_at ?? row.published_at,
          locales,
        }]
      : []
  })
}

export async function getStaticArticleParams(): Promise<
  Array<{ locale: Locale; category: string; url: string }>
> {
  const out: Array<{ locale: Locale; category: string; url: string }> = []
  for (const row of await getArticleSeoRows()) {
    if (row.end_at !== null) continue
    const category = toUrlCategory(row.category)
    if (!category) continue
    for (const locale of indexableLocalesFor(row)) {
      out.push({ locale, category, url: row.url })
    }
  }
  return out
}
