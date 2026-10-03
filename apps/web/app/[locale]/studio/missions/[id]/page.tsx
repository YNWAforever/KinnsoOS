import { notFound } from 'next/navigation'
import { CreatorMissionDetailView } from '@/components/kinnso/pages/CreatorMissionDetailView'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { meetsTier, type GatedTier } from '@/lib/contribution/tiers'
import { getCreatorStoredTier } from '@/lib/contribution/queries'
import { joinMissionAction, submitMilestoneAction, submitReceiptAction } from '@/lib/missions/actions'
import { toCreatorMissionDetail, type MissionDetailRow } from '@/lib/missions/detail'
import { getCreatorMissionDetail } from '@/lib/missions/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Auth-gated: the page reads the request's session cookie (auth.getUser()
// below), so it must render dynamically. generateStaticParams() opts a route
// into static rendering instead, which is what produced the
// DYNAMIC_SERVER_USAGE 500s on /g/[slug] and /experiences/[slug].
export const dynamic = 'force-dynamic'

type Params = Promise<{ locale: string; id: string }>

export default async function StudioMissionDetailPage({ params }: { params: Params }) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, loc)

  const { data } = await getCreatorMissionDetail(supabase, id)
  if (!data) notFound()

  const mission = toCreatorMissionDetail(data as unknown as MissionDetailRow, user.id)

  const requiredTier = ((data as { min_tier?: string | null }).min_tier ?? null) as GatedTier | null
  const creatorTier = await getCreatorStoredTier(supabase, user.id)
  const lockedTier = mission.participantId ? null : requiredTier && !meetsTier(creatorTier, requiredTier) ? requiredTier : null

  async function join() {
    'use server'
    return joinMissionAction({ missionId: id, locale: loc })
  }

  async function apply(note: string) {
    'use server'
    return joinMissionAction({ missionId: id, applicationNote: note, locale: loc })
  }

  async function submitMilestone(input: { milestoneId: string; proofUrl: string; notes: string }) {
    'use server'
    return submitMilestoneAction({
      missionId: id,
      milestoneId: input.milestoneId,
      participantId: mission.participantId ?? '',
      proofUrl: input.proofUrl,
      notes: input.notes,
      locale: loc,
    })
  }

  async function submitReceipt(input: { proofUrl: string }) {
    'use server'
    return submitReceiptAction({ missionId: id, proofUrl: input.proofUrl, locale: loc })
  }

  return (
    <CreatorMissionDetailView
      locale={loc}
      t={messages.missionDetail}
      mission={mission}
      onJoin={join}
      onApply={apply}
      onSubmitMilestone={submitMilestone}
      onSubmitReceipt={submitReceipt}
      lockedTier={lockedTier}
      gating={{ locked: messages.missions.locked, lockedHelp: messages.missions.lockedHelp }}
    />
  )
}
