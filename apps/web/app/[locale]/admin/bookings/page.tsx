import { notFound } from 'next/navigation'
import { AdminBookingsView } from '@/components/kinnso/admin/bookings/AdminBookingsView'
import { requireOpsPage } from '@/lib/admin/guard'
import { adminSetBookingSettlementStatusAction } from '@/lib/bookings/actions'
import { listOpsBookingSettlements } from '@/lib/bookings/queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminBookingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)

  const settlements = await listOpsBookingSettlements(supabase)

  // Phase-1 scope cut: this UI only ever asks the RPC to move all applicable
  // legs straight to 'paid' — it never sends 'disputed', a partial/single-leg
  // update, or allowRevert: true, even though
  // admin_set_booking_settlement_status supports all of that. That's a
  // narrower surface than the RPC was built for; broadening this button (or
  // adding more) is left for a later task.
  async function onMarkPaid(settlementId: string, reason: string, hasCreatorLeg: boolean) {
    'use server'
    return adminSetBookingSettlementStatusAction({
      settlementId,
      merchantPayoutStatus: 'paid',
      kinnsoCommissionStatus: 'paid',
      // Direct bookings (no creator_id) have no creator_commission_status leg
      // at all (it's null, not 'pending') — omitting the field here (rather
      // than always sending 'paid') keeps the RPC's coalesce()-based "leave
      // this leg alone" behavior working, instead of tripping its
      // `no_creator_leg` guard for every direct booking.
      creatorCommissionStatus: hasCreatorLeg ? 'paid' : undefined,
      reason,
    })
  }

  return (
    <AdminBookingsView
      locale={loc}
      t={messages.bookingsOps}
      settlements={settlements}
      onMarkPaid={onMarkPaid}
    />
  )
}
