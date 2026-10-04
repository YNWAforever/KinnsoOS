import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { searchPublicCreators, deriveFacets } from '@/lib/merchants/creator-search'
import { rankCreators } from '@/lib/merchants/relevance'
import { tierPolicy, type MerchantTier } from '@/lib/merchants/tier-policy'
import { listSavedCreators } from '@/lib/merchants/saved'
import { listMerchantPublishedMissions } from '@/lib/merchants/invite'
import {
  saveCreatorAction,
  unsaveCreatorAction,
  setSavedNoteAction,
} from '@/lib/merchants/saved-actions'
import { inviteCreatorAction } from '@/lib/merchants/invite-actions'
import { MerchantsCreatorsView } from '@/components/kinnso/pages/MerchantsCreatorsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

/**
 * /[locale]/merchants/creators — real, gated merchant creator-discovery surface.
 *
 * Gate is inline at page level (Next renders layout + page in parallel, so a
 * layout gate is not a barrier): anon → sign-in; non-merchant → notFound;
 * merchant → render. All data is real (public creator attributes + the
 * merchant's own tier/quota); no mock profile, follower counts, or scores.
 */
export default async function MerchantsCreatorsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale

  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)

  const { data: profile } = await supabase
    .from('merchant_profiles')
    .select('tier')
    .eq('id', merchantId)
    .maybeSingle()
  if (!profile) notFound()
  const tier = (profile.tier as MerchantTier) ?? 'free'

  const messages = await getDictionary(loc)

  const [creators, saved, publishedMissions, working] = await Promise.all([
    searchPublicCreators(),
    listSavedCreators(supabase, merchantId),
    listMerchantPublishedMissions(supabase, merchantId),
    // Derived "Working" set + this-month invite usage: participations on this
    // merchant's missions, joined to the public creator handle.
    deriveWorking(supabase, merchantId),
  ])

  const ranked = rankCreators(creators, {
    niches: [],
    audienceGeos: [],
    languages: [],
    platforms: [],
    hasGuides: false,
  })
  const facets = deriveFacets(creators)
  // Saved-state tracking keys on creatorId end-to-end (no handle round-trip).
  const savedIds = saved.map((s) => s.creatorId)

  // Remaining invites this period mirrors the RPC's derived quota check.
  const invitesRemaining = Math.max(0, tierPolicy(tier).inviteQuota - working.invitesUsed)

  async function onInvite(missionId: string, creatorId: string) {
    'use server'
    return inviteCreatorAction(loc, missionId, creatorId)
  }

  async function onSave(creatorId: string) {
    'use server'
    return saveCreatorAction(loc, creatorId)
  }

  async function onUnsave(creatorId: string) {
    'use server'
    return unsaveCreatorAction(loc, creatorId)
  }

  async function onNote(creatorId: string, note: string) {
    'use server'
    return setSavedNoteAction(loc, creatorId, note)
  }

  return (
    <MerchantsCreatorsView
      locale={loc}
      t={messages.merchantSearch}
      ranked={ranked}
      tier={tier}
      facets={facets}
      savedIds={savedIds}
      workingHandles={working.handles}
      invitesRemaining={invitesRemaining}
      publishedMissions={publishedMissions}
      onInvite={onInvite}
      onSave={onSave}
      onUnsave={onUnsave}
      onNote={onNote}
    />
  )
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Derive the merchant's "Working" creator handles (active/completed
 * participations on its own missions) and this-month merchant-invite usage —
 * the same quota the `merchant_invite_creator` RPC enforces.
 */
async function deriveWorking(
  supabase: Supabase,
  merchantId: string,
): Promise<{ handles: string[]; invitesUsed: number }> {
  const { data: missions } = await supabase
    .from('missions')
    .select('id')
    .eq('merchant_profile_id', merchantId)
  const missionIds = (missions ?? []).map((m) => m.id as string)
  if (missionIds.length === 0) return { handles: [], invitesUsed: 0 }

  const { data: parts } = await supabase
    .from('mission_participants')
    .select('status, source, created_at, creators(handle)')
    .in('mission_id', missionIds)

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const handles = new Set<string>()
  let invitesUsed = 0
  for (const p of parts ?? []) {
    const creator = (p.creators ?? {}) as { handle?: string | null }
    if ((p.status === 'active' || p.status === 'completed') && creator.handle) {
      handles.add(creator.handle)
    }
    if (p.source === 'merchant_invite' && (p.created_at as string) >= monthStart) {
      invitesUsed += 1
    }
  }
  return { handles: [...handles], invitesUsed }
}
