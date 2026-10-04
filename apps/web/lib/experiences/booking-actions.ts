// apps/web/lib/experiences/booking-actions.ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getExperienceById } from '@/lib/experiences/public-queries'
import { validateCheckoutInput, type CheckoutValidationErrors } from '@/lib/experiences/booking-validation'
import {
  ALLOWED_SOURCE_SURFACES,
  type BookingSourceSurface,
  type CreateCheckoutSessionInput,
} from '@/lib/experiences/booking-types'
import { getGuideBySlug } from '@/lib/guides/queries'
import { getStripeClient, toStripeAmount } from '@/lib/stripe/client'
import { getClientIp } from '@/lib/http/client-ip'
import type { Locale } from '@/lib/i18n/config'
import { resolveConfiguredProductState } from '@/lib/product-state'

type ActionFailure = { ok: false; errors: CheckoutValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })

/**
 * Re-resolves attribution server-side from a real, published guide — never trusts
 * a client-supplied creator/guide id directly (same house rule R3A-2 used for
 * price/currency re-derivation). An unrecognized surface or unresolvable slug
 * degrades to today's exact behavior rather than blocking the checkout (D-R3C-3).
 */
async function resolveAttribution(input: { sourceSurface?: string; guideSlug?: string }): Promise<{
  sourceSurface: BookingSourceSurface
  creatorId: string | null
  guideId: string | null
}> {
  const sourceSurface = (ALLOWED_SOURCE_SURFACES as readonly string[]).includes(input.sourceSurface ?? '')
    ? (input.sourceSurface as BookingSourceSurface)
    : 'experience_page'
  if (sourceSurface !== 'guide' || !input.guideSlug) {
    return { sourceSurface, creatorId: null, guideId: null }
  }
  try {
    const guide = await getGuideBySlug(input.guideSlug)
    if (!guide) return { sourceSurface: 'experience_page', creatorId: null, guideId: null }
    return { sourceSurface, creatorId: guide.creatorId, guideId: guide.id }
  } catch (err) {
    console.error('[experiences:booking] guide attribution lookup failed', err)
    return { sourceSurface: 'experience_page', creatorId: null, guideId: null }
  }
}

const MAX_CHECKOUT_ATTEMPTS_PER_WINDOW = 5
const CHECKOUT_RATE_LIMIT_WINDOW_SECONDS = 600

export async function createCheckoutSessionAction(
  experienceId: string,
  rawInput: CreateCheckoutSessionInput,
  options: { locale: Locale; sourceSurface?: string; guideSlug?: string },
): Promise<ActionResult<{ checkoutUrl: string }>> {
  if (!resolveConfiguredProductState().bookingLive) {
    return formError('Something went wrong. Please try again.')
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const validation = validateCheckoutInput(rawInput, { requireGuestEmail: !user })
  if (!validation.ok) return validation
  const p = validation.parsed

  const ip = await getClientIp()
  const { data: allowed, error: rateLimitError } = await supabase.rpc(
    'check_and_increment_checkout_rate_limit',
    { p_ip: ip, p_max_requests: MAX_CHECKOUT_ATTEMPTS_PER_WINDOW, p_window_seconds: CHECKOUT_RATE_LIMIT_WINDOW_SECONDS },
  )
  if (rateLimitError) {
    console.error('[experiences:booking] rate limit check failed', rateLimitError)
    return formError('Something went wrong. Please try again.')
  }
  if (!allowed) return formError('Too many attempts. Please try again in a few minutes.')

  let experience: Awaited<ReturnType<typeof getExperienceById>>
  try {
    experience = await getExperienceById(experienceId)
  } catch (err) {
    console.error('[experiences:booking] experience lookup failed', err)
    return formError('Something went wrong. Please try again.')
  }
  if (!experience) return formError('Experience not found')

  const { data: availability } = await supabase
    .from('experience_availability')
    .select('id, capacity, booked_count, status, date')
    .eq('id', p.availabilityId)
    .eq('experience_id', experienceId)
    .maybeSingle()
  if (!availability) return formError('That date is no longer available')
  const today = new Date().toISOString().slice(0, 10)
  // Re-checked explicitly even though RLS already filters the public read:
  // a signed-in merchant's owner-visibility policy could otherwise surface
  // their own closed/past rows to this same query (RLS policies OR together).
  if (availability.status !== 'open' || (availability.date as string) < today) {
    return formError('That date is no longer available')
  }
  const remaining = (availability.capacity as number) - (availability.booked_count as number)
  if (remaining < p.qty) return formError('Not enough spots left for that date')

  const attribution = await resolveAttribution({
    sourceSurface: options.sourceSurface,
    guideSlug: options.guideSlug,
  })

  const unitAmount = experience.priceAmount
  const totalAmount = unitAmount * p.qty
  const stripe = getStripeClient()
  const origin = process.env.NEXT_PUBLIC_SITE_URL
  const guestEmail = user ? null : p.guestEmail

  let session: { id: string; url: string | null }
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${origin}/${options.locale}/experiences/${experience.slug}/booked?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/${options.locale}/experiences/${experience.slug}`,
      customer_email: guestEmail ?? user?.email ?? undefined,
      line_items: [
        {
          quantity: p.qty,
          price_data: {
            currency: experience.currency.toLowerCase(),
            unit_amount: toStripeAmount(unitAmount, experience.currency),
            product_data: { name: experience.title },
          },
        },
      ],
    })
  } catch (err) {
    console.error('[experiences:booking] stripe session creation failed', err)
    return formError('Something went wrong. Please try again.')
  }

  const { error: insertError } = await supabase.from('bookings').insert({
    experience_id: experienceId,
    availability_id: p.availabilityId,
    traveler_user_id: user?.id ?? null,
    guest_email: guestEmail,
    qty: p.qty,
    unit_amount: unitAmount,
    total_amount: totalAmount,
    currency: experience.currency,
    status: 'pending_payment',
    stripe_checkout_session_id: session.id,
    source_surface: attribution.sourceSurface,
    creator_id: attribution.creatorId,
    guide_id: attribution.guideId,
  })
  if (insertError) {
    console.error('[experiences:booking] booking row insert failed', insertError)
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch (expireErr) {
      console.error('[experiences:booking] failed to expire orphaned session', expireErr)
    }
    return formError('Something went wrong. Please try again.')
  }

  if (!session.url) {
    console.error('[experiences:booking] stripe session has no url', session.id)
    return formError('Something went wrong. Please try again.')
  }

  return { ok: true, checkoutUrl: session.url }
}
