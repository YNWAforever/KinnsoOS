import '../globals.css'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, htmlLang, LOCALES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { SiteChrome } from '@/components/kinnso/SiteChrome'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, OG_LOCALE } from '@/lib/seo/metadata'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld'
import { fontVariables } from '../layout'
import { getProductState } from '@/lib/product-state'

/**
 * Governs every statically-rendered route under this layout, not just the
 * chrome: Next takes the LOWEST revalidate across a route's layouts and page,
 * so this 300 caps the longer TTLs the article routes declare for themselves.
 *
 * It cannot simply be raised to match them — `getProductState()` below decides
 * whether Sessions appears in the primary nav, and a 45-minute TTL would leave
 * that link wrong for 45 minutes after the first session goes live. The two
 * queries behind it are `select id ... limit 1` against an indexed column, so
 * the cost of the shorter interval is small.
 *
 * Decoupling the two properly means caching the product-state read on its own
 * TTL. `unstable_cache` would do it but is replaced by `use cache` in Next 16,
 * which requires opting into Cache Components — a bigger change than this is
 * worth today.
 */
export const revalidate = 300

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const loc = locale as Locale
  const dict = await getDictionary(loc)
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[l] = `${SITE_URL}/${l}`
  languages['x-default'] = `${SITE_URL}/${DEFAULT_LOCALE}`
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: dict.seo.brandTitle, template: '%s · KINNSO' },
    description: dict.seo.brandDescription,
    alternates: { canonical: `${SITE_URL}/${loc}`, languages },
    openGraph: { type: 'website', siteName: 'KINNSO', locale: OG_LOCALE[loc] },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function LocaleLayout({
  children, params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const [messages, productState] = await Promise.all([getDictionary(loc), getProductState()])
  const ld = [
    organizationJsonLd({ url: SITE_URL, logo: `${SITE_URL}/favicon.ico` }),
    websiteJsonLd({
      url: `${SITE_URL}/${loc}`, locale: htmlLang(loc),
      searchUrlTemplate: `${SITE_URL}/${loc}/articles?q={search_term_string}`,
    }),
  ]
  return (
    <html lang={htmlLang(loc)} className={`h-full antialiased ${fontVariables}`}>
      <body className="min-h-full flex flex-col font-sans bg-kinnso-cream text-kinnso-ink">
        <JsonLd data={ld} />
        <SiteChrome locale={loc} sessionsLive={productState.sessionsLive} bookingLive={productState.bookingLive} dashboardLabel={messages.admin.navDashboard} nav={messages.nav} footer={messages.footer} analytics={messages.analytics}>
          {children}
        </SiteChrome>
      </body>
    </html>
  )
}
