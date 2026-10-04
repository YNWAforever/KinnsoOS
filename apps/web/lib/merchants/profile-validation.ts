import { validatePublicExternalUrl } from '@kinnso/honesty'

export type ValidationErrors = Record<string, string[]>

export type MerchantProfileInput = {
  companyName: string
  contactName: string
  contactEmail: string
  websiteUrl: string
  tagline: string
  city: string
  logoUrl: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Field-level validation for the merchant public-profile editor. `{}` = valid. */
export function validateMerchantProfileInput(input: MerchantProfileInput): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!input.companyName.trim()) errors.companyName = ['required']
  else if (input.companyName.trim().length > 120) errors.companyName = ['too_long']
  const email = input.contactEmail.trim()
  if (!email) errors.contactEmail = ['required']
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.contactEmail = ['invalid']
  const website = input.websiteUrl.trim()
  if (website && validatePublicExternalUrl(website)) errors.websiteUrl = ['invalid_url']
  if (input.logoUrl.trim() && !isHttpUrl(input.logoUrl)) errors.logoUrl = ['invalid_url']
  if (input.tagline.trim().length > 160) errors.tagline = ['too_long']
  if (input.city.trim().length > 80) errors.city = ['too_long']
  return errors
}
