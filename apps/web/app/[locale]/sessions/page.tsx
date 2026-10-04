import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getUpcomingSessionsList, getReplaySessions } from '@/lib/sessions/public-queries'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { SessionsListingView } from '@/components/kinnso/pages/SessionsListingView'

export const revalidate = 300

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/sessions', locale: locale as Locale, title: dict.seo.sessions.title, description: dict.seo.sessions.description })
}

export default async function SessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const [upcoming, replays] = await Promise.all([getUpcomingSessionsList(), getReplaySessions()])
  return <SessionsListingView locale={locale as Locale} t={messages.sessions} upcoming={upcoming} replays={replays} />
}
