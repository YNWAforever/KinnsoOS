import { describe, expect, it } from 'vitest'
import { validateReviewInput } from '@/lib/reviews/validation'

describe('validateReviewInput', () => {
  it('accepts a valid rating with a trimmed body', () => {
    const result = validateReviewInput({ rating: 4, body: '  Great trip!  ' })
    expect(result).toEqual({ ok: true, parsed: { rating: 4, body: 'Great trip!' } })
  })

  it('treats an empty (or whitespace-only) body as null', () => {
    expect(validateReviewInput({ rating: 5, body: '' })).toEqual({ ok: true, parsed: { rating: 5, body: null } })
    expect(validateReviewInput({ rating: 5, body: '   ' })).toEqual({ ok: true, parsed: { rating: 5, body: null } })
  })

  it('accepts ratings at the exact boundary values 1 and 5', () => {
    for (const rating of [1, 5]) {
      const result = validateReviewInput({ rating, body: '' })
      expect(result.ok, `rating=${rating} should be accepted`).toBe(true)
    }
  })

  it('rejects a rating of 0 (below range)', () => {
    const result = validateReviewInput({ rating: 0, body: '' })
    expect(result).toEqual({ ok: false, errors: { rating: ['Choose a rating from 1 to 5 stars'] } })
  })

  it('rejects a rating above the valid range (e.g. 6, 100)', () => {
    for (const rating of [6, 100]) {
      const result = validateReviewInput({ rating, body: '' })
      expect(result.ok, `rating=${rating} should be rejected`).toBe(false)
      if (!result.ok) expect(result.errors.rating).toEqual(['Choose a rating from 1 to 5 stars'])
    }
  })

  it('rejects a non-integer rating (e.g. 4.5)', () => {
    const result = validateReviewInput({ rating: 4.5, body: '' })
    expect(result).toEqual({ ok: false, errors: { rating: ['Choose a rating from 1 to 5 stars'] } })
  })

  it('accepts a body at the exact 2000-character boundary', () => {
    const body = 'a'.repeat(2000)
    const result = validateReviewInput({ rating: 5, body })
    expect(result).toEqual({ ok: true, parsed: { rating: 5, body } })
  })

  it('rejects a body over 2000 characters', () => {
    const body = 'a'.repeat(2001)
    const result = validateReviewInput({ rating: 5, body })
    expect(result).toEqual({ ok: false, errors: { body: ['Keep your review under 2000 characters'] } })
  })

  it('checks the 2000-character cap against the trimmed body, not the raw untrimmed input', () => {
    // Padding with surrounding whitespace must not itself trip the 2000-char
    // cap -- the trimmed length (2000) is what's compared, not the raw
    // (2000 + padding) length.
    const body = `  ${'a'.repeat(2000)}  `
    const result = validateReviewInput({ rating: 5, body })
    expect(result).toEqual({ ok: true, parsed: { rating: 5, body: 'a'.repeat(2000) } })
  })

  it('reports both rating and body errors together when both are invalid', () => {
    const result = validateReviewInput({ rating: 0, body: 'a'.repeat(2001) })
    expect(result).toEqual({
      ok: false,
      errors: {
        rating: ['Choose a rating from 1 to 5 stars'],
        body: ['Keep your review under 2000 characters'],
      },
    })
  })
})
