import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { noindexMetadata } from '@/lib/seo/metadata'
import { listMerchantOffers } from '@/lib/merchants/offers-queries'
import { createMerchantOfferAction, setMerchantOfferStatusAction } from '@/lib/merchants/offers-actions'
import { MerchantOffersView } from '@/components/kinnso/pages/MerchantOffersView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantOffersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)
  const messages = await getDictionary(loc)
  const offers = await listMerchantOffers(supabase, merchantId)
  return (
    <MerchantOffersView
      t={messages.merchantOffers}
      offers={offers}
      onCreate={createMerchantOfferAction}
      onSetStatus={setMerchantOfferStatusAction}
    />
  )
}
