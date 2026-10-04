import { describe, expect, it } from 'vitest'
import { validateCheckoutInput } from '@/lib/experiences/booking-validation'

describe('validateCheckoutInput', () => {
  it('accepts a valid signed-in input with no guest email required', () => {
    const result = validateCheckoutInput({ availabilityId: 'a1', qty: '2' }, { requireGuestEmail: false })
    expect(result).toEqual({ ok: true, parsed: { availabilityId: 'a1', qty: 2, guestEmail: null } })
  })

  it('accepts a valid guest input with an email', () => {
    const result = validateCheckoutInput(
      { availabilityId: 'a1', qty: '1', guestEmail: 'Traveler@Example.com' },
      { requireGuestEmail: true },
    )
    expect(result).toEqual({ ok: true, parsed: { availabilityId: 'a1', qty: 1, guestEmail: 'traveler@example.com' } })
  })

  it('rejects a missing availabilityId', () => {
    const result = validateCheckoutInput({ availabilityId: '', qty: '1' }, { requireGuestEmail: false })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.availabilityId).toBeTruthy()
  })

  it('rejects a non-integer, zero, or excessive qty', () => {
    for (const qty of ['0', '-1', '1.5', 'abc', '11']) {
      const result = validateCheckoutInput({ availabilityId: 'a1', qty }, { requireGuestEmail: false })
      expect(result.ok, `qty=${qty} should be rejected`).toBe(false)
    }
  })

  it('accepts qty at the exact boundary values 1 and 10', () => {
    for (const qty of ['1', '10']) {
      const result = validateCheckoutInput({ availabilityId: 'a1', qty }, { requireGuestEmail: false })
      expect(result.ok, `qty=${qty} should be accepted`).toBe(true)
    }
  })

  it('rejects a missing or malformed guest email when required', () => {
    const missing = validateCheckoutInput({ availabilityId: 'a1', qty: '1' }, { requireGuestEmail: true })
    expect(missing.ok).toBe(false)
    const malformed = validateCheckoutInput(
      { availabilityId: 'a1', qty: '1', guestEmail: 'not-an-email' },
      { requireGuestEmail: true },
    )
    expect(malformed.ok).toBe(false)
  })

  it('ignores a supplied guest email when the caller is signed in', () => {
    const result = validateCheckoutInput(
      { availabilityId: 'a1', qty: '1', guestEmail: 'ignored@example.com' },
      { requireGuestEmail: false },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed.guestEmail).toBeNull()
  })
})
