// apps/web/app/[locale]/sessions/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getSessionBySlug } from '@/lib/sessions/public-queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildSessionMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, sessionEventJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { SessionDetailView } from '@/components/kinnso/pages/SessionDetailView'

// The page reads the request's auth cookie (see auth.getUser() below), so it
// must render dynamically. An empty generateStaticParams() would instead opt
// this route into static rendering at first visit, which is what produced the
// DYNAMIC_SERVER_USAGE 500s on /g/[slug] and /experiences/[slug] (docs/r7-ground-truth.md);
// both were fixed this same way.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const session = await getSessionBySlug(slug)
  if (!session) return { title: 'Session not found', robots: { index: false, follow: false } }
  return buildSessionMetadata({ slug, locale: locale as Locale, title: session.title, description: session.description })
}

export default async function SessionDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const session = await getSessionBySlug(slug)
  if (!session) notFound()

  const supabase = await createSupabaseServerClient()
  // auth.getUser() makes this page request-dynamic — needed so the RSVP form can
  // prefill a signed-in visitor's email (same trade-off the experiences page and
  // the agent page already accept).
  const { data: { user } } = await supabase.auth.getUser()

  const canonical = `${SITE_URL}/${locale}/sessions/${slug}`
  const ld = [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.sessions.title, url: `${SITE_URL}/${locale}/sessions` },
      { name: session.title, url: canonical },
    ]),
    sessionEventJsonLd({
      name: session.title, description: session.description, url: canonical,
      startDate: session.startsAt, status: session.status,
      embedUrl: session.embedUrl ?? session.replayUrl,
      hostName: session.host?.displayName ?? null,
    }),
  ]

  return (
    <>
      <JsonLd data={ld} />
      <SessionDetailView locale={locale as Locale} t={messages.sessions} session={session} viewerEmail={user?.email ?? null} />
    </>
  )
}
