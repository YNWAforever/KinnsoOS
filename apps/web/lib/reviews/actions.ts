'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireTravelerAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateReviewInput } from '@/lib/reviews/validation'
import type { Locale } from '@/lib/i18n/config'

const UNIQUE_VIOLATION = '23505'

// These two are translation-lookup KEYS, not user-facing text: ReviewForm maps
// them to the caller's own `t.alreadyReviewed` / `t.genericError` (both
// translated in all 7 locales). Returning literal English here -- as this
// action used to -- would reach non-English travellers verbatim, since
// ReviewForm's error handler prefers `errors.form` over any translated
// fallback.
const ALREADY_REVIEWED = 'ALREADY_REVIEWED'
const NOT_ELIGIBLE = 'NOT_ELIGIBLE'

/**
 * Submits a review for a completed booking. reviews_insert RLS is the real
 * enforcement boundary -- it re-checks ownership, completed status, and that
 * experience_id/guide_id match the booking -- this action only validates input
 * shape and translates the DB's rejection into a friendly message.
 */
export async function submitReviewAction(
  locale: Locale,
  bookingId: string,
  experienceId: string,
  guideId: string | null,
  input: { rating: number; body: string },
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = validateReviewInput(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }

  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase.from('reviews').insert({
    booking_id: bookingId,
    traveler_user_id: gate.user.id,
    experience_id: experienceId,
    guide_id: guideId,
    rating: parsed.parsed.rating,
    body: parsed.parsed.body,
  })
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return formError(ALREADY_REVIEWED)
    return formError(NOT_ELIGIBLE)
  }

  revalidatePath(`/${locale}/trips`)
  return { ok: true, bookingId }
}
