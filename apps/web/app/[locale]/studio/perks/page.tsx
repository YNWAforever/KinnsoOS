import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorPage } from '@/lib/admin/guard'
import { getCreatorStoredTier } from '@/lib/contribution/queries'
import { listActivePerks, listRedeemedPerkIds } from '@/lib/perks/queries'
import { mapPerkCard } from '@/lib/perks/list'
import { redeemPerkAction } from '@/lib/perks/actions'
import { StudioPerksView } from '@/components/kinnso/pages/StudioPerksView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioPerksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, loc)

  const creatorTier = await getCreatorStoredTier(supabase, user.id)
  const [perks, redeemedIds] = await Promise.all([
    listActivePerks(supabase),
    listRedeemedPerkIds(supabase, user.id),
  ])
  const redeemed = new Set(redeemedIds)
  const cards = perks.map((row) => mapPerkCard(row, creatorTier, redeemed))

  async function onRedeem(perkId: string) {
    'use server'
    return redeemPerkAction(perkId)
  }

  return (
    <StudioPerksView locale={loc} t={messages.perks} cards={cards} onRedeem={onRedeem} />
  )
}
