// apps/web/app/[locale]/experiences/[slug]/booked/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getBookingByCheckoutSession } from '@/lib/experiences/booking-confirmation-queries'
import { hasReviewForBooking } from '@/lib/reviews/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ReviewForm } from '@/components/kinnso/ReviewForm'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } }
}

export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { locale, slug } = await params
  const { session_id: sessionId } = await searchParams
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const t = messages.booking
  const refreshHref = `/${locale}/experiences/${slug}/booked${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}`

  const booking = sessionId ? await getBookingByCheckoutSession(sessionId) : null

  if (!booking) {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.notFoundTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.notFoundBody}</p>
      </div>
    )
  }

  if (booking.status === 'pending_payment') {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.pendingTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.pendingBody}</p>
        <a
          href={refreshHref}
          className="mt-4 inline-block rounded-[3px] bg-kinnso-orangeDark px-4 py-2 text-sm font-semibold text-white"
        >
          {t.refreshCta}
        </a>
      </div>
    )
  }

  if (booking.status === 'confirmed') {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.confirmedTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.confirmedBody}</p>
        <div className="k2-card mx-auto mt-6 max-w-sm bg-kinnso-cream2 p-6 text-left">
          <p className="text-sm font-semibold text-kinnso-ink">{booking.experienceTitle}</p>
          <p className="mt-2 text-sm text-kinnso-ink/70">{t.summaryQtyLabel}: {booking.qty}</p>
          <p className="mt-1 text-sm text-kinnso-ink/70">{t.summaryTotalLabel}: {booking.currency} {booking.totalAmount.toLocaleString()}</p>
        </div>
      </div>
    )
  }

  if (booking.status === 'completed') {
    // D-R6A-4: only the real, signed-in traveler on the booking may review it --
    // never a guest checkout, even if someone else happens to be signed in while
    // viewing this anon-readable confirmation page.
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const canReview = !!user && booking.travelerUserId === user.id
    const alreadyReviewed = canReview ? await hasReviewForBooking(supabase, booking.bookingId) : false
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.completedTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.completedBody}</p>
        <div className="k2-card mx-auto mt-6 max-w-sm bg-kinnso-cream2 p-6 text-left">
          <p className="text-sm font-semibold text-kinnso-ink">{booking.experienceTitle}</p>
          <p className="mt-2 text-sm text-kinnso-ink/70">{t.summaryQtyLabel}: {booking.qty}</p>
          <p className="mt-1 text-sm text-kinnso-ink/70">{t.summaryTotalLabel}: {booking.currency} {booking.totalAmount.toLocaleString()}</p>
        </div>
        {canReview && !alreadyReviewed ? (
          <div className="mx-auto mt-6 max-w-sm">
            <ReviewForm locale={locale as Locale} bookingId={booking.bookingId} experienceId={booking.experienceId} guideId={booking.guideId} t={messages.reviews} />
          </div>
        ) : null}
        {canReview && alreadyReviewed ? (
          <p className="mt-4 text-sm text-kinnso-muted">{messages.reviews.alreadyReviewed}</p>
        ) : null}
      </div>
    )
  }

  if (booking.status === 'refunded') {
    return (
      <div className="k2-container py-16 text-center">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.refundedTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.refundedBody}</p>
      </div>
    )
  }

  // booking.status === 'cancelled' — the check constraint still permits this
  // value even though no code path in this phase produces it (only
  // 'refunded' is produced by admin_cancel_and_refund_booking); handled
  // defensively as the final, explicit branch.
  return (
    <div className="k2-container py-16 text-center">
      <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.cancelledTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.cancelledBody}</p>
    </div>
  )
}
