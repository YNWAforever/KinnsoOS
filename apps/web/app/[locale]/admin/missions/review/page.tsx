import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getReviewQueue } from '@/lib/admin/mission-review-queries'
import { reviewSubmissionOpsAction } from '@/lib/admin/mission-review-actions'
import { MissionReviewQueueView } from '@/components/kinnso/admin/missions/MissionReviewQueueView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MissionReviewQueuePage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const rows = await getReviewQueue(supabase)

  return (
    <MissionReviewQueueView
      t={messages.missionsOps}
      locale={loc}
      rows={rows}
      reviewAction={reviewSubmissionOpsAction}
    />
  )
}
