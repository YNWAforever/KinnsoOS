import { notFound } from 'next/navigation'
import { requireMerchantPage } from '@/lib/admin/guard'
import { MerchantBookingsView } from '@/components/kinnso/pages/MerchantBookingsView'
import { listMerchantBookings } from '@/lib/bookings/queries'
import { markBookingCompletedAction } from '@/lib/bookings/actions'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function MerchantBookingsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  // The guard already derives merchant_profiles.id from the session, so the
  // separate getMerchantProfile round trip this page used to make is redundant.
  const { merchantId } = await requireMerchantPage(supabase, loc)

  const bookings = await listMerchantBookings(supabase, merchantId)

  async function completeBooking(bookingId: string) {
    'use server'
    return markBookingCompletedAction(bookingId)
  }

  return (
    <MerchantBookingsView
      locale={loc}
      t={messages.merchantBookings}
      bookings={bookings}
      onComplete={completeBooking}
    />
  )
}
