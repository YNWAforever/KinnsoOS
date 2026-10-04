import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { searchArticles, getIndexableCategoryLocales } from '@/lib/articles/queries'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, toDbCategory, URL_CATEGORIES, type Locale, type UrlCategory } from '@/lib/i18n/config'
import { buildListingMetadata } from '@/lib/seo/metadata'
import { ArticleCard } from '@/components/ArticleCard'
import { Pagination } from '@/components/Pagination'

// 30 min preferred; the parent locale layout caps the effective route ISR at
// about five minutes. See app/[locale]/layout.tsx.
export const revalidate = 1800

export function generateStaticParams() {
  return URL_CATEGORIES.map((category) => ({ category }))
}

type Params = Promise<{ locale: string; category: string }>
type Search = Promise<{ page?: string; q?: string; region?: string; tag?: string }>

export async function generateMetadata(
  { params }: { params: Params },
): Promise<Metadata> {
  const { locale, category } = await params
  const dbCategory = toDbCategory(category)
  if (!isLocale(locale) || !dbCategory) return {}
  const [dict, presentLocales] = await Promise.all([
    getDictionary(locale),
    getIndexableCategoryLocales(dbCategory),
  ])
  return buildListingMetadata({
    urlCategory: category as UrlCategory,
    locale,
    presentLocales,
    title: dict.categories[category as UrlCategory],
    description: dict.seo.articles.descriptionBookingWaitlist,
    index: presentLocales.includes(locale),
  })
}

export default async function CategoryPage(
  { params, searchParams }: { params: Params; searchParams: Search },
) {
  const { locale, category } = await params
  const sp = await searchParams
  if (!isLocale(locale) || !toDbCategory(category)) notFound()
  const loc = locale as Locale
  const dbCategory = toDbCategory(category)!
  const dict = await getDictionary(loc)
  const page = Math.max(1, Number(sp.page ?? '1') || 1)

  const { items, total, perPage } = await searchArticles({
    locale: loc, category: dbCategory, q: sp.q ?? null,
    region: sp.region ?? null, tag: sp.tag ?? null, page, perPage: 12,
  })

  // Out-of-range ?page= (beyond the last page) yields 0 rows: 404 rather than a
  // misleading empty-but-200 dead-end. Page 1 may legitimately be empty, so keep it.
  if (page > 1 && items.length === 0) notFound()

  return (
    <main className="k2-container py-8">
      <h1 className="k2-display text-3xl font-semibold text-kinnso-ink mb-6">{dict.categories[category as UrlCategory]}</h1>
      <p className="text-kinnso-muted mb-6">{total} {dict.listing.resultsCount}</p>

      {items.length === 0 ? (
        <p className="text-kinnso-muted">{dict.listing.noResults}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <ArticleCard key={r.url} href={`/${loc}/articles/${category}/${r.url}`}
                         title={r.title ?? ''} thumbnail={r.thumbnails[0]} summary={r.summary} />
          ))}
        </div>
      )}

      <Pagination basePath={`/${loc}/articles/${category}`} page={page} total={total} perPage={perPage}
                  labels={{ prev: dict.pagination.prev, next: dict.pagination.next }} />
    </main>
  )
}
