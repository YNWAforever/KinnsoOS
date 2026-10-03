// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateExperienceInput } from '@/lib/experiences/validation'

const valid = {
  title: 'Sunset junk boat tour',
  summary: 'Two hours on Victoria Harbour.',
  description: 'Full description here.',
  city: 'Hong Kong',
  priceAmount: '480',
  currency: 'HKD',
  durationMinutes: '120',
  coverUrl: 'https://example.com/cover.jpg',
}

describe('validateExperienceInput', () => {
  it('accepts a valid input and returns parsed numbers', () => {
    const res = validateExperienceInput(valid)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.parsed.priceAmount).toBe(480)
      expect(res.parsed.durationMinutes).toBe(120)
    }
  })

  it('requires title, city, and price', () => {
    const res = validateExperienceInput({ ...valid, title: ' ', city: '', priceAmount: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors.title).toBeTruthy()
      expect(res.errors.city).toBeTruthy()
      expect(res.errors.priceAmount).toBeTruthy()
    }
  })

  it('rejects negative prices, unknown currencies, and non-integer durations', () => {
    const res = validateExperienceInput({ ...valid, priceAmount: '-5', currency: 'EUR', durationMinutes: '1.5' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors.priceAmount).toBeTruthy()
      expect(res.errors.currency).toBeTruthy()
      expect(res.errors.durationMinutes).toBeTruthy()
    }
  })

  it('allows empty duration and cover, but rejects a non-http cover', () => {
    const ok = validateExperienceInput({ ...valid, durationMinutes: '', coverUrl: '' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.parsed.durationMinutes).toBeNull()
    const bad = validateExperienceInput({ ...valid, coverUrl: 'javascript:alert(1)' })
    expect(bad.ok).toBe(false)
  })
})
