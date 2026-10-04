import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HomeView } from '@/components/kinnso/pages/HomeView'
import { searchArticles } from '@/lib/articles/queries'
import { getPublishedGuides } from '@/lib/guides/queries'
import type { Guide } from '@/lib/guides/types'
import { optionalQuery } from '@/lib/resilience/optional'
import { getPlatformStats, getPublishedTestimonials, getHomeSessions } from '@/lib/home/queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { getProductState } from '@/lib/product-state'

/** ISR: this page prefers one hour; the parent locale layout makes effective route ISR about five minutes, while platform stats and testimonials keep their own one-hour Data Cache. */
export const revalidate = 3600

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '', locale: locale as Locale, title: dict.seo.home.title, description: dict.seo.home.description })
}

/** /[locale] — the 10-section dual-sided homepage (R1B rebuild). */
export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const [messages, guides, stats, testimonials, articleResult, sessions, productState] = await Promise.all([
    getDictionary(loc),
    // The guides band degrades to hidden rather than taking down the whole
    // homepage, but the failure is recorded — unlike /explore, where the
    // catalogue is the entire point of the page and must not be faked.
    optionalQuery('home-guides', () => getPublishedGuides(6), [] as Guide[]),
    getPlatformStats(),
    getPublishedTestimonials(loc),
    // Articles highlight degrades to hidden rather than crashing the homepage
    // (searchArticles rethrows after its internal retry).
    searchArticles({ locale: loc, page: 1, perPage: 3 }).catch(() => ({ items: [], total: 0, page: 1, perPage: 3 })),
    getHomeSessions(),
    getProductState(),
  ])
  return (
    <HomeView
      locale={loc}
      t={messages.home}
      featureInterest={messages.featureInterest}
      guides={guides}
      stats={stats}
      testimonials={testimonials}
      articles={articleResult.items}
      sessions={sessions}
      productState={productState}
    />
  )
}
