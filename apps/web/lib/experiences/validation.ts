import { EXPERIENCE_CURRENCIES, type ExperienceInput } from '@/lib/experiences/types'

export type ValidationErrors = Record<string, string[]>
export type ParsedExperience = {
  title: string
  summary: string | null
  description: string | null
  city: string
  priceAmount: number
  currency: string
  durationMinutes: number | null
  coverUrl: string | null
}
export type ExperienceValidation =
  | { ok: true; parsed: ParsedExperience }
  | { ok: false; errors: ValidationErrors }

const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateExperienceInput(input: ExperienceInput): ExperienceValidation {
  const errors: ValidationErrors = {}

  const title = input.title.trim()
  if (!title) errors.title = ['required']
  else if (title.length > 120) errors.title = ['too_long']

  const summary = input.summary.trim()
  if (summary.length > 400) errors.summary = ['too_long']

  const city = input.city.trim()
  if (!city) errors.city = ['required']
  else if (city.length > 80) errors.city = ['too_long']

  const priceRaw = input.priceAmount.trim()
  const price = Number(priceRaw)
  if (!priceRaw || !Number.isFinite(price)) errors.priceAmount = ['invalid_number']
  else if (price < 0) errors.priceAmount = ['invalid_number']

  if (!(EXPERIENCE_CURRENCIES as readonly string[]).includes(input.currency)) errors.currency = ['invalid']

  const durationRaw = input.durationMinutes.trim()
  let duration: number | null = null
  if (durationRaw) {
    const d = Number(durationRaw)
    if (!Number.isInteger(d) || d <= 0) errors.durationMinutes = ['invalid_number']
    else duration = d
  }

  const cover = input.coverUrl.trim()
  if (cover && !isHttpUrl(cover)) errors.coverUrl = ['invalid_url']

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    parsed: {
      title,
      summary: summary || null,
      description: input.description.trim() || null,
      city,
      priceAmount: Math.round(price * 100) / 100,
      currency: input.currency,
      durationMinutes: duration,
      coverUrl: cover || null,
    },
  }
}
