import type { ValidationErrors } from '@/lib/admin/result'

export type PerkInput = {
  partnerName: string
  title: string
  summary: string
  category: string
  discountLabel: string
  minTier: 'rising' | 'pro' | 'elite' | null
  redemptionType: 'code' | 'link'
  redemptionValue: string
  sortOrder: number
  active: boolean
}

const TIERS = ['rising', 'pro', 'elite'] as const
const TYPES = ['code', 'link'] as const

/** Field-level validation for the ops perk form. Returns `{}` when valid. */
export function validatePerkInput(input: PerkInput): ValidationErrors {
  const errors: ValidationErrors = {}
  const required: [keyof PerkInput, string][] = [
    ['partnerName', 'Partner name is required'],
    ['title', 'Title is required'],
    ['summary', 'Summary is required'],
    ['category', 'Category is required'],
    ['discountLabel', 'Discount label is required'],
    ['redemptionValue', 'Redemption value is required'],
  ]
  for (const [key, msg] of required) {
    if (!String(input[key] ?? '').trim()) errors[key] = [msg]
  }
  if (input.minTier !== null && !TIERS.includes(input.minTier)) errors.minTier = ['Invalid tier']
  if (!TYPES.includes(input.redemptionType)) errors.redemptionType = ['Invalid redemption type']
  if (!Number.isInteger(input.sortOrder)) errors.sortOrder = ['Sort order must be a whole number']
  // A 'link' value is rendered into an <a href>, so reject non-http(s) schemes
  // (e.g. javascript:) at write time — defense-in-depth even though only ops can write.
  if (input.redemptionType === 'link' && String(input.redemptionValue ?? '').trim()) {
    try {
      const url = new URL(input.redemptionValue.trim())
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        errors.redemptionValue = ['Link must be an http(s) URL']
      }
    } catch {
      errors.redemptionValue = ['Link must be a valid URL']
    }
  }
  return errors
}

/** Lowercase kebab slug from a title (ascii-ish), capped at 60 chars. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'perk'
  )
}

/** First slug not already taken: base, base-2, base-3… */
export function uniqueSlug(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}
