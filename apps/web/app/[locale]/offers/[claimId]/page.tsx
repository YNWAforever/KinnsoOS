import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireTravelerAction } from '@/lib/admin/guard'
import { OfferClaimConfirmationView } from '@/components/kinnso/pages/OfferClaimConfirmationView'

export default async function OfferClaimConfirmationPage({
  params,
}: { params: Promise<{ locale: string; claimId: string }> }) {
  const { locale, claimId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) notFound()

  const cookieStore = await cookies()
  const rawToken = cookieStore.get(`offer-token-${claimId}`)?.value
  // cookie expired or this claim isn't this visitor's -- no retrieval path exists yet, known gap
  if (!rawToken) notFound()

  const { data: claim, error } = await supabase
    .rpc('get_my_offer_claim', { p_claim_id: claimId })
    .maybeSingle()
  if (error || !claim) notFound()

  const messages = await getDictionary(loc)

  return (
    <OfferClaimConfirmationView
      t={messages.offerClaim}
      offerTitle={claim.offer_title}
      merchantName={claim.merchant_name ?? ''}
      rawToken={rawToken}
    />
  )
}
