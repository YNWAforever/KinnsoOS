export type CreateCheckoutSessionInput = {
  availabilityId: string
  qty: string // form-string; validated/parsed to an integer in validation
  guestEmail?: string // required when the caller is anon, ignored when signed in
}

export const ALLOWED_SOURCE_SURFACES = ['guide', 'article', 'experience_page', 'direct', 'agent'] as const
export type BookingSourceSurface = (typeof ALLOWED_SOURCE_SURFACES)[number]
