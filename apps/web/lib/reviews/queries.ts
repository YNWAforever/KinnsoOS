import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { Review, RatingAggregate } from '@/lib/reviews/types'

function toAggregate(ratings: number[]): RatingAggregate | null {
  if (ratings.length === 0) return null
  const sum = ratings.reduce((total, r) => total + r, 0)
  return { average: sum / ratings.length, count: ratings.length }
}

function toReview(r: { id: string; rating: number; body: string | null; created_at: string }): Review {
  return { id: r.id, rating: r.rating, body: r.body, createdAt: r.created_at }
}

/** Published reviews' ratings for one experience, averaged in app code (D-R6A-7: tiny volume). */
export async function getExperienceRatingAggregate(
  supabase: SupabaseClient<Database>,
  experienceId: string,
): Promise<RatingAggregate | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('experience_id', experienceId)
    .eq('status', 'published')
  if (error) throw error
  return toAggregate((data ?? []).map((r) => r.rating as number))
}

/** Published reviews' ratings attributed to one guide (via bookings.guide_id at insert time). */
export async function getGuideRatingAggregate(
  supabase: SupabaseClient<Database>,
  guideId: string,
): Promise<RatingAggregate | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('guide_id', guideId)
    .eq('status', 'published')
  if (error) throw error
  return toAggregate((data ?? []).map((r) => r.rating as number))
}

/** Published reviews for one experience, newest first. */
export async function listPublishedReviewsForExperience(
  supabase: SupabaseClient<Database>,
  experienceId: string,
): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, body, created_at')
    .eq('experience_id', experienceId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => toReview(r as { id: string; rating: number; body: string | null; created_at: string }))
}

/** Published reviews attributed to one guide, newest first. */
export async function listPublishedReviewsForGuide(
  supabase: SupabaseClient<Database>,
  guideId: string,
): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, body, created_at')
    .eq('guide_id', guideId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => toReview(r as { id: string; rating: number; body: string | null; created_at: string }))
}

/**
 * Whether a review already exists for this booking (any status) -- lets the /trips
 * review CTA and the booked-confirmation completed branch avoid a duplicate-submit
 * attempt against the booking_id unique constraint. Relies on reviews_owner_select, so
 * must be called with the traveller's own authenticated client.
 */
export async function hasReviewForBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}
