import { notFound } from 'next/navigation'
import { StudioOffersView, type AffiliateOfferCard } from '@/components/kinnso/pages/StudioOffersView'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createPartnerLinkAction, joinMissionAction } from '@/lib/missions/actions'
import { listAffiliateOffers } from '@/lib/missions/queries'
import { isTravelpayoutsConfigured } from '@/lib/missions/travelpayouts'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

type ProgramRel = { default_commission_description?: string | null; program_url?: string | null; category?: string | null }

type OfferRow = {
  id: string
  title: string | null
  summary: string | null
  affiliate_network_programs?: ProgramRel | ProgramRel[] | null
  mission_participants?: Array<{ id: string; status: string | null; creator_id: string | null }> | null
  affiliate_partner_links?: Array<{ id: string; partner_url: string | null; sub_id: string | null }> | null
}

const program = (rel: OfferRow['affiliate_network_programs']) => (Array.isArray(rel) ? rel[0] ?? null : rel ?? null)

function mapOffer(row: OfferRow, creatorId: string): AffiliateOfferCard {
  const prog = program(row.affiliate_network_programs)
  const participant = row.mission_participants?.find((p) => p.creator_id === creatorId) ?? null
  return {
    id: row.id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    category: prog?.category?.trim() || null,
    compensation: prog?.default_commission_description?.trim() || 'Affiliate commission',
    programUrl: prog?.program_url?.trim() || null,
    participant: participant ? { id: participant.id, status: participant.status ?? 'active' } : null,
    partnerLinks: (row.affiliate_partner_links ?? []).map((link) => ({
      id: link.id,
      partnerUrl: link.partner_url ?? '',
      subId: link.sub_id ?? '',
    })),
  }
}

export default async function StudioOffersPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, loc)

  const { data } = await listAffiliateOffers(supabase)
  const offers = ((data ?? []) as unknown as OfferRow[]).map((row) => mapOffer(row, user.id))

  async function join(missionId: string) {
    'use server'
    return joinMissionAction({ missionId, locale: loc })
  }

  async function createLink(missionParticipantId: string, originalUrl: string) {
    'use server'
    return createPartnerLinkAction({ missionParticipantId, originalUrl, locale: loc })
  }

  return (
    <StudioOffersView
      t={messages.studioOffers}
      offers={offers}
      linkSetupPending={!isTravelpayoutsConfigured()}
      onJoin={join}
      onCreateLink={createLink}
    />
  )
}
