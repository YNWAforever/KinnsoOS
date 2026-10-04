import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getMissionDetail, type ReviewQueueCursor } from '@/lib/admin/mission-review-queries'
import { reviewSubmissionOpsAction, setMissionAutoApprovePolicyAction } from '@/lib/admin/mission-review-actions'
import { MissionDetailView } from '@/components/kinnso/admin/missions/MissionDetailView'

export default async function MissionDetailPage({
  params,
  searchParams,
}: { params: Promise<{ locale: string; missionId: string }>; searchParams?: Promise<{ cursor?: string }> }) {
  const { locale, missionId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const query = await searchParams
  let cursor: ReviewQueueCursor | null = null
  try { cursor = query?.cursor ? JSON.parse(query.cursor) : null } catch { notFound() }
  const detail = await getMissionDetail(supabase, missionId, cursor)
  if (!detail) notFound()

  return (
    <MissionDetailView
      t={messages.missionsOps}
      locale={loc}
      detail={detail}
      reviewAction={reviewSubmissionOpsAction}
      policyAction={setMissionAutoApprovePolicyAction}
    />
  )
}
