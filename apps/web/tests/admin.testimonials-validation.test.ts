import { describe, it, expect } from 'vitest'
import { validateTestimonialInput, type TestimonialInput } from '@/lib/admin/testimonials-validation'

const valid: TestimonialInput = {
  quote: 'KINNSO paid me for what I already knew.',
  authorName: 'Mei',
  authorRole: 'creator',
  locale: null,
  sortOrder: 0,
}

describe('validateTestimonialInput', () => {
  it('accepts a valid input (locale null = all locales)', () => {
    expect(validateTestimonialInput(valid)).toEqual({})
  })
  it('accepts a concrete locale', () => {
    expect(validateTestimonialInput({ ...valid, locale: 'zh-hk' })).toEqual({})
  })
  it('requires quote and author name', () => {
    const errors = validateTestimonialInput({ ...valid, quote: '  ', authorName: '' })
    expect(errors.quote).toBeTruthy()
    expect(errors.authorName).toBeTruthy()
  })
  it('rejects an unknown role', () => {
    expect(validateTestimonialInput({ ...valid, authorRole: 'influencer' as never }).authorRole).toBeTruthy()
  })
  it('rejects an unknown locale', () => {
    expect(validateTestimonialInput({ ...valid, locale: 'fr' as never }).locale).toBeTruthy()
  })
  it('rejects a fractional sort order', () => {
    expect(validateTestimonialInput({ ...valid, sortOrder: 1.5 }).sortOrder).toBeTruthy()
  })
  it('rejects a sort order beyond the int4 range', () => {
    expect(validateTestimonialInput({ ...valid, sortOrder: 2 ** 31 }).sortOrder).toBeTruthy()
    expect(validateTestimonialInput({ ...valid, sortOrder: -(2 ** 31) - 1 }).sortOrder).toBeTruthy()
  })
  it('accepts the int4 boundary values', () => {
    expect(validateTestimonialInput({ ...valid, sortOrder: 2147483647 }).sortOrder).toBeUndefined()
    expect(validateTestimonialInput({ ...valid, sortOrder: -2147483648 }).sortOrder).toBeUndefined()
  })
  it('rejects NaN (an emptied sort order field)', () => {
    expect(validateTestimonialInput({ ...valid, sortOrder: Number.NaN }).sortOrder).toBeTruthy()
  })
})
