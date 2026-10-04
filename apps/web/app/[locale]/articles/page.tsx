import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { searchArticles } from '@/lib/articles/queries'
import { resolveConfiguredProductState } from '@/lib/product-state'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, toDbCategory, LOCALES, URL_CATEGORIES, type Locale, type UrlCategory } from '@/lib/i18n/config'
import { buildListingMetadata } from '@/lib/seo/metadata'
import { ArticleCard } from '@/components/ArticleCard'

// 30 min preferred; the parent locale layout caps the effective route ISR at
// about five minutes. See app/[locale]/layout.tsx.
export const revalidate = 1800

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const [dict, { bookingLive }] = await Promise.all([
    getDictionary(locale),
    Promise.resolve(resolveConfiguredProductState()),
  ])
  return buildListingMetadata({
    urlCategory: null,
    locale,
    presentLocales: LOCALES,
    title: dict.seo.articles.title,
    description: bookingLive
      ? dict.seo.articles.descriptionBookingLive
      : dict.seo.articles.descriptionBookingWaitlist,
  })
}

export default async function ArticlesHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const dict = await getDictionary(loc)

  const sections = (await Promise.all(
    URL_CATEGORIES.map(async (c) => ({
      category: c as UrlCategory,
      items: (await searchArticles({ locale: loc, category: toDbCategory(c)!, perPage: 6 })).items,
    })),
  )).filter((section) => section.items.length > 0)

  return (
    <main className="k2-container py-8">
      <h1 className="k2-display text-3xl font-semibold text-kinnso-ink mb-8">{dict.breadcrumb.articles}</h1>
      {sections.map((s) => (
        <section key={s.category} className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-2xl font-bold">{dict.categories[s.category]}</h2>
            <Link href={`/${loc}/articles/${s.category}`} className="text-orange text-sm" aria-label={dict.categories[s.category]}>→</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.items.map((r) => (
              <ArticleCard key={r.url} href={`/${loc}/articles/${s.category}/${r.url}`}
                           title={r.title ?? ''} thumbnail={r.thumbnails[0]} summary={r.summary} />
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
