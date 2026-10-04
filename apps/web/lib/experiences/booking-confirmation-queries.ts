import { createSupabasePublicClient } from '@/lib/supabase/public'

export type BookingConfirmation = {
  bookingId: string
  status: 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'refunded'
  qty: number
  totalAmount: number
  currency: string
  experienceTitle: string
  experienceSlug: string
  travelerUserId: string | null
  experienceId: string
  guideId: string | null
}

/**
 * Reads a single booking back by its (unguessable, Stripe-generated) checkout
 * session id via a SECURITY DEFINER RPC -- the sanctioned anon-read exception
 * for guest confirmations (design spec §D-R3-2), reused uniformly for
 * signed-in travelers too so the confirmation page never has to branch on
 * auth state. travelerUserId/experienceId/guideId (added in R6A) let the
 * completed branch decide whether to show a review CTA (D-R6A-4: never for a
 * guest booking) and submit a review that will pass reviews_insert's RLS check.
 */
export async function getBookingByCheckoutSession(sessionId: string): Promise<BookingConfirmation | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .rpc('get_booking_by_checkout_session', { p_session_id: sessionId })
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    bookingId: data.booking_id as string,
    status: data.status as BookingConfirmation['status'],
    qty: data.qty as number,
    totalAmount: Number(data.total_amount),
    currency: data.currency as string,
    experienceTitle: data.experience_title as string,
    experienceSlug: data.experience_slug as string,
    travelerUserId: (data.traveler_user_id as string | null) ?? null,
    experienceId: data.experience_id as string,
    guideId: (data.guide_id as string | null) ?? null,
  }
}
