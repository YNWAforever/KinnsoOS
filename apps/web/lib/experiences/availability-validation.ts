import type { AvailabilityInput } from '@/lib/experiences/availability-types'

export type ValidationErrors = Record<string, string[]>
export type ParsedAvailability = { date: string; capacity: number }
export type AvailabilityValidation =
  | { ok: true; parsed: ParsedAvailability }
  | { ok: false; errors: ValidationErrors }

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Deliberately does NOT reject past dates client-side — the public read policy
 * (experience_availability_public_read, `date >= current_date`) already keeps a past
 * date from ever being bookable, and "today's server date" isn't reliably knowable in
 * every calling context. A past date a merchant adds simply never becomes visible.
 */
export function validateAvailabilityInput(input: AvailabilityInput): AvailabilityValidation {
  const errors: ValidationErrors = {}

  const date = input.date.trim()
  const dateMatch = DATE_RE.exec(date)
  if (!dateMatch) {
    errors.date = ['invalid_date']
  } else {
    const [, yStr, mStr, dStr] = dateMatch
    const y = Number(yStr)
    const m = Number(mStr)
    const d = Number(dStr)
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      errors.date = ['invalid_date']
    }
  }

  const capacityRaw = input.capacity.trim()
  const capacity = Number(capacityRaw)
  if (!capacityRaw || !Number.isInteger(capacity) || capacity < 1) {
    errors.capacity = ['invalid_number']
  }

  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, parsed: { date, capacity } }
}
