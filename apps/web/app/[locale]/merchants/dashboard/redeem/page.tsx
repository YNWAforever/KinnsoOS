import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { noindexMetadata } from '@/lib/seo/metadata'
import { redeemOfferClaimAction } from '@/lib/offers/redeem-actions'
import { MerchantRedeemView } from '@/components/kinnso/pages/MerchantRedeemView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantRedeemPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireMerchantPage(supabase, loc)
  const messages = await getDictionary(loc)
  return <MerchantRedeemView t={messages.offerRedeem} onRedeem={redeemOfferClaimAction} />
}
