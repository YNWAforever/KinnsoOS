import type { GuideInput } from '@/lib/guides/types'

export type ValidationErrors = Record<string, string[]>
export type ValidationResult =
  | { ok: true; errors: Record<string, never> }
  | { ok: false; errors: ValidationErrors }

const isBlank = (value: string | null | undefined) => value == null || value.trim() === ''

const addError = (errors: ValidationErrors, field: string, code: string) => {
  errors[field] = [...(errors[field] ?? []), code]
}

const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateGuideInput(input: GuideInput): ValidationResult {
  const errors: ValidationErrors = {}

  if (isBlank(input.title)) addError(errors, 'title', 'required')
  else if (input.title.trim().length > 120) addError(errors, 'title', 'too_long')

  if (isBlank(input.summary)) addError(errors, 'summary', 'required')
  else if (input.summary.trim().length > 400) addError(errors, 'summary', 'too_long')

  if (isBlank(input.city)) addError(errors, 'city', 'required')
  else if (input.city.trim().length > 80) addError(errors, 'city', 'too_long')

  if (isBlank(input.coverUrl)) addError(errors, 'coverUrl', 'required')
  else if (!isHttpUrl(input.coverUrl)) addError(errors, 'coverUrl', 'invalid_url')

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, errors: {} }
}
