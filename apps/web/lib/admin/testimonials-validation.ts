import type { ValidationErrors } from '@/lib/admin/result'
import { isLocale, type Locale } from '@/lib/i18n/config'

export const TESTIMONIAL_ROLES = ['creator', 'traveller', 'merchant'] as const
export type TestimonialRole = (typeof TESTIMONIAL_ROLES)[number]

export type TestimonialInput = {
  quote: string
  authorName: string
  authorRole: TestimonialRole
  /** null = show in every locale; otherwise an exact locale code. */
  locale: Locale | null
  sortOrder: number
}

/** Field-level validation for the ops testimonial form. Returns `{}` when valid. */
export function validateTestimonialInput(input: TestimonialInput): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!String(input.quote ?? '').trim()) errors.quote = ['Quote is required']
  if (!String(input.authorName ?? '').trim()) errors.authorName = ['Author name is required']
  if (!TESTIMONIAL_ROLES.includes(input.authorRole)) errors.authorRole = ['Invalid author role']
  if (input.locale !== null && !isLocale(input.locale)) errors.locale = ['Invalid locale']
  if (!Number.isInteger(input.sortOrder)) errors.sortOrder = ['Sort order must be a whole number']
  else if (input.sortOrder < -2147483648 || input.sortOrder > 2147483647) {
    errors.sortOrder = ['Sort order is out of range']
  }
  return errors
}
