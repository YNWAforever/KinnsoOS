'use client'

import { useState } from 'react'
import Link from 'next/link'
import GuideCard from '@/components/kinnso/GuideCard'
import ExperienceCard from '@/components/kinnso/ExperienceCard'
import { ReviewForm } from '@/components/kinnso/ReviewForm'
import { unsaveGuideAction } from '@/lib/saves/guide-actions'
import { unsaveExperienceAction } from '@/lib/saves/experience-actions'
import { signInHref } from '@/lib/auth/return-path'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n/config'
import type { Messages, TravelerTripsMessages } from '@/lib/i18n/messages/en'
import type { TravelerBookingRow } from '@/lib/bookings/types'
import type { SavedGuideEntry } from '@/lib/saves/guide-queries'
import type { SavedExperienceEntry } from '@/lib/saves/experience-queries'

const STATUS_KEY: Record<TravelerBookingRow['status'], keyof TravelerTripsMessages> = {
  pending_payment: 'statusPendingPayment',
  confirmed: 'statusConfirmed',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
}

type TravelerTripsViewProps = {
  locale: Locale
  t: TravelerTripsMessages
  reviewsT: Messages['reviews']
  savesLabel: string
  bookings: TravelerBookingRow[]
  savedGuides: SavedGuideEntry[]
  savedExperiences: SavedExperienceEntry[]
}

export function TravelerTripsView({
  locale, t, reviewsT, savesLabel, bookings,
  savedGuides: initialSavedGuides, savedExperiences: initialSavedExperiences,
}: TravelerTripsViewProps) {
  const [savedGuides, setSavedGuides] = useState(initialSavedGuides)
  const [savedExperiences, setSavedExperiences] = useState(initialSavedExperiences)
  const [openReviewFor, setOpenReviewFor] = useState<string | null>(null)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  // An unsave can fail in two different ways that need opposite responses: an
  // expired session needs a sign-in link, a rejected write just needs a retry.
  // Both used to be dropped on the floor, leaving a card that looked unchanged
  // and a click that appeared to do nothing at all.
  const [unsaveFailure, setUnsaveFailure] = useState<{ id: string; busy: boolean; error: 'failed' | 'auth' | null } | null>(null)

  async function removeSaved(kind: 'guide' | 'experience', id: string) {
    if (unsaveFailure?.busy) return
    setUnsaveFailure({ id, busy: true, error: null })
    try {
      const result = kind === 'guide'
        ? await unsaveGuideAction(locale, id)
        : await unsaveExperienceAction(locale, id)

      if (result.ok) {
        if (kind === 'guide') setSavedGuides((prev) => prev.filter((g) => g.guideId !== id))
        else setSavedExperiences((prev) => prev.filter((e) => e.experienceId !== id))
        setUnsaveFailure(null)
        return
      }

      setUnsaveFailure({ id, busy: false, error: result.reason === 'auth' ? 'auth' : 'failed' })
    } catch {
      let reason: 'auth' | 'failed' = 'failed'
      try {
        const { data, error } = await createSupabaseBrowserClient().auth.getUser()
        if (!data.user && (!error || error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403)) {
          reason = 'auth'
        }
      } catch {
        // A failed session read cannot establish that authentication was lost.
      }
      setUnsaveFailure({ id, busy: false, error: reason })
    }
  }

  const unsaveError = (id: string) => unsaveFailure?.id === id ? unsaveFailure.error : null

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.title}</h1>

      <div className="mt-6 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
        <div className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-3 text-xs font-bold uppercase text-kinnso-muted sm:grid-cols-[1fr_160px_80px_140px_140px]">
          <span>{t.colExperience}</span>
          <span>{t.colMerchant}</span>
          <span>{t.colQty}</span>
          <span>{t.colStatus}</span>
          <span>{t.colAmount}</span>
        </div>
        {bookings.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-kinnso-muted">{t.empty}</p>
          </div>
        ) : (
          bookings.map((b) => {
            const hasReview = b.reviewId !== null || reviewedIds.has(b.id)
            const canReview = b.status === 'completed' && !hasReview
            return (
              <div key={b.id} className="border-b border-kinnso-cream2 px-4 py-4 last:border-b-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_80px_140px_140px] sm:items-center">
                  <div>
                    {b.experienceSlug === '' ? (
                      // experiences(...) is a nullable embed (no `!inner`) — the merchant may
                      // have since unpublished this experience, which experiences_public_read
                      // RLS hides from this same query. Render plain text instead of a link
                      // that would resolve to a 404.
                      <span className="font-bold text-kinnso-ink">{b.experienceTitle}</span>
                    ) : (
                      <Link
                        href={`/${locale}/experiences/${b.experienceSlug}`}
                        className="font-bold text-kinnso-ink hover:text-kinnso-orangeDark"
                      >
                        {b.experienceTitle}
                      </Link>
                    )}
                    {/* bookingDate comes from experience_availability, whose RLS only exposes
                        rows where date >= current_date — so any past/completed trip will
                        always have a null bookingDate here regardless of whether the date
                        data exists historically. Fall back to createdAt so completed trips
                        still show *something* instead of a blank. */}
                    <p className="mt-0.5 text-xs text-kinnso-muted">
                      {b.bookingDate
                        ? new Date(b.bookingDate).toLocaleDateString(locale)
                        : `${t.bookedOnLabel} ${new Date(b.createdAt).toLocaleDateString(locale)}`}
                    </p>
                  </div>
                  <span className="text-sm text-kinnso-muted">{b.merchantName}</span>
                  <span className="text-sm text-kinnso-muted">{b.qty}</span>
                  <span className="text-sm text-kinnso-muted">{t[STATUS_KEY[b.status]]}</span>
                  <span className="text-sm text-kinnso-muted">
                    {b.currency} {b.totalAmount.toFixed(2)}
                  </span>
                </div>
                {canReview ? (
                  openReviewFor === b.id ? (
                    <ReviewForm
                      locale={locale}
                      bookingId={b.id}
                      experienceId={b.experienceId}
                      guideId={b.guideId}
                      t={reviewsT}
                      onSubmitted={() => setReviewedIds((prev) => new Set(prev).add(b.id))}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenReviewFor(b.id)}
                      className="mt-2 text-sm font-semibold text-kinnso-orangeDark hover:underline"
                    >
                      {t.reviewCta}
                    </button>
                  )
                ) : hasReview ? (
                  <p className="mt-2 text-xs font-semibold text-kinnso-muted">{t.reviewedLabel}</p>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <div id="saved" className="mt-10 scroll-mt-24 border-t border-kinnso-cream2 pt-6">
        <h2 className="k-section-title text-lg">{t.savedGuidesTitle}</h2>
        {savedGuides.length === 0 ? (
          <p className="mt-2 text-sm text-kinnso-muted">{t.savedGuidesEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {savedGuides.map((entry) => (
              <div key={entry.guideId}>
                {entry.guide ? (
                <GuideCard
                  g={entry.guide}
                  locale={locale}
                  savesLabel={savesLabel}
                  actionLabel={t.unsaveLabel}
                  isSaved={true}
                  onSaveToggle={() => removeSaved('guide', entry.guideId)}
                />
                ) : (
                  <div className="rounded-lg border border-kinnso-cream2 bg-white p-4">
                    <p className="font-semibold text-kinnso-ink">{t.savedSourceUnavailable}</p>
                    <button
                      type="button"
                      onClick={() => removeSaved('guide', entry.guideId)}
                      className="mt-3 text-sm font-semibold text-kinnso-orangeDark hover:underline"
                    >
                      {t.unsaveLabel}
                    </button>
                  </div>
                )}
                {unsaveError(entry.guideId) && (
                  <p role="alert" className="mt-2 text-sm text-kinnso-ink/80">
                    {t.unsaveFailed}{' '}
                    {unsaveError(entry.guideId) === 'auth' && (
                      <Link href={signInHref(locale, `/${locale}/trips`)} className="font-semibold underline">
                        {t.unsaveSignIn}
                      </Link>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10 border-t border-kinnso-cream2 pt-6">
        <h2 className="k-section-title text-lg">{t.savedExperiencesTitle}</h2>
        {savedExperiences.length === 0 ? (
          <p className="mt-2 text-sm text-kinnso-muted">{t.savedExperiencesEmpty}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {savedExperiences.map((entry) => (
              <div key={entry.experienceId}>
                {entry.unavailable ? (
                  <div className="rounded-lg border border-kinnso-cream2 bg-white p-4">
                    <p className="font-semibold text-kinnso-ink">{t.savedSourceUnavailable}</p>
                    <button
                      type="button"
                      onClick={() => removeSaved('experience', entry.experienceId)}
                      className="mt-3 text-sm font-semibold text-kinnso-orangeDark hover:underline"
                    >
                      {t.unsaveLabel}
                    </button>
                  </div>
                ) : (
                <ExperienceCard
                  experience={entry}
                  locale={locale}
                  actionLabel={t.unsaveLabel}
                  isSaved={true}
                  onSaveToggle={() => removeSaved('experience', entry.experienceId)}
                />
                )}
                {unsaveError(entry.experienceId) && (
                  <p role="alert" className="mt-2 text-sm text-kinnso-ink/80">
                    {t.unsaveFailed}{' '}
                    {unsaveError(entry.experienceId) === 'auth' && (
                      <Link href={signInHref(locale, `/${locale}/trips`)} className="font-semibold underline">
                        {t.unsaveSignIn}
                      </Link>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

export default TravelerTripsView
