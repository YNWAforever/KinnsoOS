import { validatePublicExternalUrl } from '@kinnso/honesty'

export type ValidationErrors = Record<string, string[]>

export type MerchantApplicationInput = {
  companyName: string
  contactName: string
  contactEmail: string
  websiteUrl: string
  pitch: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Field-level validation for the public merchant application form. `{}` = valid. */
export function validateMerchantApplicationInput(input: MerchantApplicationInput): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!input.companyName.trim()) errors.companyName = ['Company name is required']
  const email = input.contactEmail.trim()
  if (!email) errors.contactEmail = ['Contact email is required']
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.contactEmail = ['Enter a valid email address']
  const website = input.websiteUrl.trim()
  if (website && validatePublicExternalUrl(website)) {
    errors.websiteUrl = ['Enter a secure https:// website that is not an example domain']
  }
  if (input.pitch.length > 2000) errors.pitch = ['Keep your pitch under 2000 characters']
  return errors
}
