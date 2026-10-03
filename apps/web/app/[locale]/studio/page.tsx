import { notFound, redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { DnaSchema, type Dna, type Platform } from '@kinnso/scan'
import { buildStudioIdentity, type HandleRow } from '@/lib/studio/identity'
import { computeReadiness, REQUIRED_PLATFORMS } from '@/lib/studio/readiness'
import { deriveStudioNextAction } from '@/lib/studio/next-action'
import { directoryGaps, isDirectoryListed } from '@/lib/creators/eligibility'
import { listCreatorMerchantMissions, listAffiliateOffers, listCreatorSettlements } from '@/lib/missions/queries'
import { getCreatorContribution } from '@/lib/contribution/queries'
import { getUnreadNotificationCount } from '@/lib/notifications/queries'
import { summarizeCreatorEarnings, toCreatorEarningItem, type CreatorSettlementRow } from '@/lib/missions/earnings'
import { StudioDashboardView, type OpportunityPreview } from '@/components/kinnso/pages/StudioDashboardView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type TitledRow = { id: string; title: string | null }

export default async function StudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  const role = await resolveViewerRole(supabase)
  if (role === 'merchant') redirect(`/${loc}/merchants/dashboard/post`)
  if (role === 'ops') redirect(`/${loc}/admin/creators/payouts`)

  // Active-creator gate. resolveViewerRole returns 'creator' for onboarding users
  // too, so status is the real check.
  const { data: creatorRow } = await supabase
    .from('creators')
    .select('display_name, status, handle, public_profile, is_listed')
    .eq('id', user.id)
    .single()
  if (!creatorRow || creatorRow.status !== 'active') redirect(`/${loc}/creator`)

  // `final` is untrusted jsonb — an active creator should always have valid DNA,
  // but validate defensively and bounce to the wizard if not.
  const { data: dnaRow } = await supabase
    .from('creator_dna')
    .select('final, updated_at')
    .eq('creator_id', user.id)
    .single()
  const parsed = DnaSchema.safeParse(dnaRow?.final)
  if (!parsed.success) redirect(`/${loc}/creator`)
  const dna: Dna = parsed.data
  const updatedAt = (dnaRow?.updated_at as string | null) ?? new Date().toISOString()

  const [handleRes, guidesRes, activeJobRes, missionsRes, offersRes, settlementsRes, contribution, unreadCountRes] = await Promise.all([
    supabase.from('creator_social_handles').select('platform, handle, url').eq('creator_id', user.id),
    supabase.from('guides').select('id, status').eq('creator_id', user.id),
    supabase.from('creator_scan_jobs').select('id, status').eq('creator_id', user.id).in('status', ['queued', 'fetching', 'analyzing']).limit(1).maybeSingle(),
    listCreatorMerchantMissions(supabase),
    listAffiliateOffers(supabase),
    listCreatorSettlements(supabase),
    getCreatorContribution(supabase, user.id),
    getUnreadNotificationCount(supabase),
  ])

  const handles: HandleRow[] = (handleRes.data ?? []).map((h) => ({
    platform: h.platform as Platform,
    handle: h.handle,
    url: h.url,
  }))
  const identity = buildStudioIdentity({ display_name: creatorRow.display_name }, handles, dna, updatedAt)
  const connected = new Set(handles.map((h) => h.platform))
  const missingPlatforms = REQUIRED_PLATFORMS.filter((p) => !connected.has(p))

  const readiness = computeReadiness({
    handles: handles.map((h) => ({ platform: h.platform })),
    guidesCount: (guidesRes.data ?? []).length,
    dnaUpdatedAtIso: updatedAt,
    now: new Date(),
  })

  const missions = (missionsRes.data ?? []) as unknown as TitledRow[]
  const offers = (offersRes.data ?? []) as unknown as TitledRow[]
  const opportunities: OpportunityPreview[] = [
    ...missions.map((m): OpportunityPreview => ({ id: m.id, title: m.title ?? '', kind: 'mission' })),
    ...offers.map((o): OpportunityPreview => ({ id: o.id, title: o.title ?? '', kind: 'offer' })),
  ]
    .filter((o) => o.title.length > 0)
    .slice(0, 3)

  const earnings = summarizeCreatorEarnings(
    ((settlementsRes.data ?? []) as unknown as CreatorSettlementRow[]).map(toCreatorEarningItem),
  )

  // Derived from the snapshot above; deliberately no extra round trip on a page
  // that already issues seven.
  // Same rule the public directory enforces, shared rather than restated. Note it
  // counts PUBLISHED guides: the checklist's write-a-guide item counts drafts too,
  // so a creator can satisfy that and still not be listed.
  const eligibility = {
    status: creatorRow.status,
    handle: creatorRow.handle,
    publicProfile: creatorRow.public_profile,
    publishedGuideCount: (guidesRes.data ?? []).filter((g) => g.status === 'published').length,
    isListed: creatorRow.is_listed,
  }
  const directory = {
    listed: isDirectoryListed(eligibility),
    gaps: directoryGaps(eligibility),
  }

  const nextAction = deriveStudioNextAction({
    handleCount: handles.length,
    missingPlatformCount: missingPlatforms.length,
    guidesCount: (guidesRes.data ?? []).length,
    activeScanJob: Boolean(activeJobRes.data?.id),
    affiliateOfferCount: offers.length,
    hasEarnings: earnings.length > 0,
    dnaStale: Boolean(
      readiness.items.find((i) => i.id === 'dna-fresh')?.detail.freshness?.stale,
    ),
  })


  return (
    <StudioDashboardView
      locale={loc}
      t={messages.studioDashboard}
      studioHomeT={messages.studioHome}
      progressT={messages.onboarding.progressStep}
      creatorId={user.id}
      name={identity.name}
      dna={dna}
      lastScanned={updatedAt}
      readiness={readiness}
      nextAction={nextAction}
      directory={directory}
      opportunities={opportunities}
      earnings={earnings}
      platforms={handles.map((h) => h.platform)}
      missingPlatforms={missingPlatforms}
      activeJobId={activeJobRes.data?.id ?? null}
      contribution={contribution}
      tierT={messages.tier}
      unreadNotificationCount={unreadCountRes}
    />
  )
}
