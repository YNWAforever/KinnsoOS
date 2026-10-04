// apps/web/app/[locale]/destinations/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, toUrlCategory, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getDestinationBySlug } from '@/lib/destinations/queries'
import { getGuidesForRegions } from '@/lib/guides/queries'
import { getExperiencesForCities } from '@/lib/experiences/public-queries'
import { getSessionsForDestination } from '@/lib/sessions/public-queries'
import { searchArticles } from '@/lib/articles/queries'
import { getProductState } from '@/lib/product-state'
import { buildDestinationMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { DestinationDetailView, type DestinationArticle } from '@/components/kinnso/pages/DestinationDetailView'
import type { ExperienceCardData } from '@/components/kinnso/ExperienceCard'

const DESTINATION_ARTICLE_LIMIT = 6

function buildArticleQuery(name: string, matchTerms: string[]): string {
  const seen = new Set<string>()
  return [name, ...matchTerms]
    .map((term) => term.trim())
    .filter((term) => {
      const key = term.toLocaleLowerCase('en')
      if (!term || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(' OR ')
}

export function generateStaticParams() {
  // Destinations are DB-only; resolve on demand (dynamicParams defaults to true) - same
  // choice as /g/[slug] and /experiences/[slug].
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const destination = await getDestinationBySlug(slug)
  if (!destination) return { title: 'Destination not found', robots: { index: false, follow: false } }
  const messages = await getDictionary(locale)
  return buildDestinationMetadata({
    slug, locale, title: destination.name,
    description: destination.description ?? messages.destinations.metadataDescription(destination.name),
  })
}

export default async function DestinationDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const destination = await getDestinationBySlug(slug)
  if (!destination) notFound()

  const loc = locale as Locale
  const articleQuery = buildArticleQuery(destination.name, destination.matchTerms)
  const [messages, guides, experiencesRaw, articleResult, productState] = await Promise.all([
    getDictionary(loc),
    getGuidesForRegions(destination.matchTerms),
    getExperiencesForCities(destination.matchTerms),
    searchArticles({ locale: loc, q: articleQuery, page: 1, perPage: DESTINATION_ARTICLE_LIMIT }),
    getProductState(),
  ])
  const t = messages.destinations
  const sessions = productState.sessionsLive
    ? await getSessionsForDestination(destination.matchTerms)
    : []
  const experiences: ExperienceCardData[] = experiencesRaw.map((e) => ({
    slug: e.slug, title: e.title, city: e.city,
    priceAmount: e.priceAmount, currency: e.currency,
    coverUrl: e.coverUrl, savesCount: e.savesCount,
  }))
  const articles: DestinationArticle[] = articleResult.items.flatMap((article) => {
    const category = toUrlCategory(article.category)
    if (!category) return []
    return [{
      url: article.url,
      category,
      title: article.title ?? article.url,
      thumbnail: article.thumbnails[0],
      summary: article.summary,
    }]
  })

  const canonical = `${SITE_URL}/${locale}/destinations/${slug}`
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: t.eyebrow, url: `${SITE_URL}/${locale}/destinations` },
      { name: destination.name, url: canonical },
    ]),
  ]
  const itemListItems = [
    ...guides.map((guide) => ({ name: guide.title, url: `${SITE_URL}/${locale}/g/${guide.slug}` })),
    ...experiences.map((experience) => ({ name: experience.title, url: `${SITE_URL}/${locale}/experiences/${experience.slug}` })),
    ...articles.map((article) => ({ name: article.title, url: `${SITE_URL}/${locale}/articles/${article.category}/${article.url}` })),
    ...sessions.map((session) => ({ name: session.title, url: `${SITE_URL}/${locale}/sessions/${session.slug}` })),
  ]
  if (itemListItems.length > 0) {
    ld.push(itemListJsonLd({ name: t.metadataDescription(destination.name), items: itemListItems }))
  }

  return (
    <>
      <JsonLd data={ld} />
      <DestinationDetailView
        locale={loc}
        t={t}
        destination={destination}
        guides={guides}
        experiences={experiences}
        articles={articles}
        sessions={sessions}
        savesLabel={messages.explore.savesLabel}
      />
    </>
  )
}
