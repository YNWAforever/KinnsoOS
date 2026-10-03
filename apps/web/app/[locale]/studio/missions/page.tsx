import { notFound } from 'next/navigation'
import { CreatorMissionsView, type CreatorMissionCard } from '@/components/kinnso/pages/CreatorMissionsView'
import { requireCreatorPage } from '@/lib/admin/guard'
import { meetsTier, type GatedTier, type Tier } from '@/lib/contribution/tiers'
import { getCreatorStoredTier } from '@/lib/contribution/queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { creatorMissionProgress } from '@/lib/missions/list'
import { joinMissionAction } from '@/lib/missions/actions'
import { acceptInviteAction } from '@/lib/missions/invite-actions'
import { listCreatorMerchantMissions } from '@/lib/missions/queries'
import { missionTypes } from '@/lib/missions/types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>
type CreatorMissionRow = {
  id: string
  title: string | null
  summary: string | null
  mission_source: string | null
  mission_type: string | null
  status: string | null
  min_tier: string | null
  merchant_profile_id: string | null
  affiliate_commission_rate: number | null
  creator_commission_rate: number | null
  kinnso_commission_rate: number | null
  paid_fee_amount: number | null
  paid_fee_currency: string | null
  affiliate_network_programs?: {
    default_commission_description?: string | null
    program_url?: string | null
  } | Array<{
    default_commission_description?: string | null
    program_url?: string | null
  }> | null
  mission_milestones?: Array<{ id: string }> | null
  mission_participants?: Array<{
    id: string
    status: string | null
    source: string | null
    creator_id: string | null
    mission_milestone_submissions?: Array<{ status: string | null; mission_milestone_id: string }> | null
  }> | null
  affiliate_partner_links?: Array<{ id: string; partner_url: string | null }> | null
}

const missionSource = (source: string | null): CreatorMissionCard['missionSource'] =>
  source === 'travelpayouts' ? 'travelpayouts' : 'merchant'

// Derives from the canonical missionTypes array rather than enumerating members inline, so a
// future mission type is recognized automatically the moment it's added to types.ts -- the
// same fix applied to lib/missions/detail.ts's toMissionType, closing the exact bug class
// that let receipt_cashback get silently miscategorized as coupon_affiliate here before it
// was fixed one-off (commit 3c23911).
const missionType = (type: string | null): CreatorMissionCard['missionType'] =>
  (missionTypes as readonly string[]).includes(type ?? '') ? (type as CreatorMissionCard['missionType']) : 'coupon_affiliate'

const programCompensation = (program: CreatorMissionRow['affiliate_network_programs']) => {
  const row = Array.isArray(program) ? program[0] : program
  return row?.default_commission_description?.trim() || 'Affiliate commission'
}

const merchantAffiliateCompensation = (row: CreatorMissionRow) => {
  if (typeof row.creator_commission_rate === 'number' && typeof row.affiliate_commission_rate === 'number') {
    return `Affiliate commission ${row.creator_commission_rate}% creator / ${row.affiliate_commission_rate}% total`
  }
  return 'Affiliate commission'
}

const programUrl = (program: CreatorMissionRow['affiliate_network_programs']) => {
  const row = Array.isArray(program) ? program[0] : program
  return row?.program_url?.trim() || null
}

const paidCompensation = (row: CreatorMissionRow) =>
  typeof row.paid_fee_amount === 'number'
    ? `${row.paid_fee_currency ?? 'HKD'} ${row.paid_fee_amount}`
    : null

const formatCompensation = (row: CreatorMissionRow) => {
  const paid = paidCompensation(row)
  const affiliate = row.mission_source === 'travelpayouts'
    ? programCompensation(row.affiliate_network_programs)
    : merchantAffiliateCompensation(row)

  if (row.mission_type === 'hybrid' && paid) {
    return `${paid} + ${affiliate}`
  }
  return paid ?? affiliate
}

function mapCreatorMission(
  row: CreatorMissionRow,
  creatorId: string,
  creatorTier: Tier,
  funded: Set<string>,
): CreatorMissionCard {
  const participant = row.mission_participants?.find((item) => item.creator_id === creatorId) ?? null
  const { milestoneCount, submittedCount } = creatorMissionProgress(
    row.mission_milestones,
    participant?.mission_milestone_submissions,
  )
  const requiredTier = (row.min_tier ?? null) as GatedTier | null
  const locked = participant ? false : requiredTier ? !meetsTier(creatorTier, requiredTier) : false

  return {
    id: row.id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    missionSource: missionSource(row.mission_source),
    missionType: missionType(row.mission_type),
    status: row.status ?? 'published',
    participant: participant
      ? { id: participant.id, status: participant.status ?? 'active', source: participant.source ?? 'self' }
      : null,
    partnerLinks: (row.affiliate_partner_links ?? []).map((link) => ({
      id: link.id,
      partnerUrl: link.partner_url ?? '',
    })),
    programUrl: programUrl(row.affiliate_network_programs),
    compensation: formatCompensation(row),
    milestoneCount,
    submittedCount,
    locked,
    requiredTier,
    funded:
      (row.mission_type === 'paid' || row.mission_type === 'hybrid' || row.mission_type === 'receipt_cashback') &&
      row.merchant_profile_id !== null &&
      funded.has(row.merchant_profile_id),
  }
}

export default async function StudioMissionsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, loc)

  const creatorTier = await getCreatorStoredTier(supabase, user.id)

  const { data } = await listCreatorMerchantMissions(supabase)
  // Best-effort decorative read: a failure here degrades to no badges, never a crashed
  // page -- but it must still leave a trace (the log-then-degrade stance of
  // lib/home/queries.ts's getPlatformStats), not vanish silently.
  const { data: fundedIds, error: fundedError } = await supabase.rpc('funded_merchant_profiles')
  if (fundedError) console.warn('studio-missions-funded-query-failed', fundedError)
  const funded = new Set<string>((fundedIds as string[] | null) ?? [])
  const missions = ((data ?? []) as unknown as CreatorMissionRow[]).map((row) =>
    mapCreatorMission(row, user.id, creatorTier, funded),
  )

  async function join(missionId: string) {
    'use server'
    return joinMissionAction({ missionId, locale: loc })
  }

  async function accept(missionId: string) {
    'use server'
    return acceptInviteAction(loc, missionId)
  }

  return (
    <CreatorMissionsView locale={loc} t={messages.missions} missions={missions} onJoin={join} onAccept={accept} />
  )
}
