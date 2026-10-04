// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { validateAvailabilityInput } from '@/lib/experiences/availability-validation'

describe('validateAvailabilityInput', () => {
  it('accepts a valid date and capacity', () => {
    const res = validateAvailabilityInput({ date: '2026-08-01', capacity: '10' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.parsed).toEqual({ date: '2026-08-01', capacity: 10 })
    }
  })

  it('rejects 2026-02-30 (February never has 30 days)', () => {
    const res = validateAvailabilityInput({ date: '2026-02-30', capacity: '10' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.date).toEqual(['invalid_date'])
  })

  it('rejects 2026-04-31 (April only has 30 days)', () => {
    const res = validateAvailabilityInput({ date: '2026-04-31', capacity: '10' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.date).toEqual(['invalid_date'])
  })

  it('accepts 2024-02-29 (2024 is a leap year)', () => {
    const res = validateAvailabilityInput({ date: '2024-02-29', capacity: '10' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.parsed).toEqual({ date: '2024-02-29', capacity: 10 })
    }
  })

  it('rejects 2026-02-29 (2026 is not a leap year)', () => {
    const res = validateAvailabilityInput({ date: '2026-02-29', capacity: '10' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.date).toEqual(['invalid_date'])
  })

  it('rejects a structurally malformed date', () => {
    const res = validateAvailabilityInput({ date: 'not-a-date', capacity: '10' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.date).toEqual(['invalid_date'])
  })

  it('rejects capacity of 0', () => {
    const res = validateAvailabilityInput({ date: '2026-08-01', capacity: '0' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.capacity).toEqual(['invalid_number'])
  })

  it('rejects a non-numeric capacity', () => {
    const res = validateAvailabilityInput({ date: '2026-08-01', capacity: 'abc' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.capacity).toEqual(['invalid_number'])
  })

  it('accepts a valid capacity alongside a valid date', () => {
    const res = validateAvailabilityInput({ date: '2026-08-01', capacity: '10' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.parsed.capacity).toBe(10)
      expect(res.parsed.date).toBe('2026-08-01')
    }
  })
})
