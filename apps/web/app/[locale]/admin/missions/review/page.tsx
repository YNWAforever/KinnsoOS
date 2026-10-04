import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getReviewQueuePage, type ReviewQueueCursor } from '@/lib/admin/mission-review-queries'
import { reviewSubmissionOpsAction } from '@/lib/admin/mission-review-actions'
import { MissionReviewQueueView } from '@/components/kinnso/admin/missions/MissionReviewQueueView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MissionReviewQueuePage({
  params,
  searchParams,
}: { params: Promise<{ locale: string }>; searchParams?: Promise<{ cursor?: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const query = await searchParams
  let cursor: ReviewQueueCursor | null = null
  try { cursor = query?.cursor ? JSON.parse(query.cursor) : null } catch { notFound() }
  const page = await getReviewQueuePage(supabase, {}, cursor)

  return (
    <MissionReviewQueueView
      t={messages.missionsOps}
      locale={loc}
      rows={page.items}
      nextPageHref={page.nextCursor ? `/${loc}/admin/missions/review?cursor=${encodeURIComponent(JSON.stringify(page.nextCursor))}` : null}
      reviewAction={reviewSubmissionOpsAction}
    />
  )
}
