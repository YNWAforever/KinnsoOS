import { notFound } from 'next/navigation'
import { requireMerchantPage } from '@/lib/admin/guard'
import { MissionDetailView, type MissionDetail } from '@/components/kinnso/pages/MissionDetailView'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { reviewParticipantAction, reviewSubmissionAction } from '@/lib/missions/actions'
import { listMerchantMissions } from '@/lib/missions/queries'
import { getCreatorPublicNames, type CreatorPublicName } from '@/lib/creators/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Auth-gated: the page reads the request's session cookie (auth.getUser()
// below), so it must render dynamically. generateStaticParams() opts a route
// into static rendering instead, which is what produced the
// DYNAMIC_SERVER_USAGE 500s on /g/[slug] and /experiences/[slug].
export const dynamic = 'force-dynamic'

type Params = Promise<{ locale: string; missionId: string }>
type MerchantMissionDetailData = {
  id: string
  title: string | null
  mission_participants?: Array<{
    id: string
    status: string | null
    creator_id: string | null
    mission_milestone_submissions?: Array<{
      id: string
      status: string | null
      mission_social_snapshots?: Array<{ confidence_status: string | null }> | null
    }> | null
  }> | null
}

function socialSignalStatus(
  snapshots: Array<{ confidence_status: string | null }> | null | undefined,
): MissionDetail['submissions'][number]['snapshotStatus'] {
  const statuses = snapshots?.map((snapshot) => snapshot.confidence_status) ?? []
  if (statuses.includes('verified_signal')) return 'verified_signal'
  if (statuses.includes('needs_review')) return 'needs_review'
  return 'unavailable'
}

function mapMissionDetail(
  row: MerchantMissionDetailData,
  names: Map<string, CreatorPublicName>,
  fallback: string,
): MissionDetail {
  const participants = row.mission_participants ?? []
  const resolve = (id: string | null) => {
    const found = id ? names.get(id) : undefined
    return { name: found?.name ?? fallback, handle: found?.handle ?? null }
  }

  return {
    id: row.id,
    title: row.title ?? '',
    participants: participants.map((participant) => {
      const c = resolve(participant.creator_id)
      return { id: participant.id, creatorName: c.name, creatorHandle: c.handle, status: participant.status ?? 'applied' }
    }),
    submissions: participants.flatMap((participant) => {
      const c = resolve(participant.creator_id)
      return (participant.mission_milestone_submissions ?? []).map((submission) => ({
        id: submission.id,
        creatorName: c.name,
        creatorHandle: c.handle,
        status: submission.status ?? 'pending',
        snapshotStatus: socialSignalStatus(submission.mission_social_snapshots),
      }))
    }),
  }
}

export default async function MerchantMissionDetailPage({ params }: { params: Params }) {
  const { locale, missionId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)

  const { data } = await listMerchantMissions(supabase, merchantId)
  const row = ((data ?? []) as unknown as MerchantMissionDetailData[]).find((mission) => mission.id === missionId)
  if (!row) notFound()

  async function reviewParticipant(participantId: string, action: 'approve' | 'reject') {
    'use server'
    return reviewParticipantAction({ participantId, action, locale: loc })
  }

  async function reviewSubmission(submissionId: string, action: 'approve' | 'request_revision' | 'reject') {
    'use server'
    return reviewSubmissionAction({ submissionId, action, locale: loc })
  }

  const ids = (row.mission_participants ?? [])
    .map((p) => p.creator_id)
    .filter((id): id is string => Boolean(id))
  const names = await getCreatorPublicNames(ids)

  return (
    <MissionDetailView
      locale={loc}
      t={messages.missions}
      mission={mapMissionDetail(row, names, messages.missions.creatorFallback)}
      onReviewParticipant={reviewParticipant}
      onReviewSubmission={reviewSubmission}
    />
  )
}
