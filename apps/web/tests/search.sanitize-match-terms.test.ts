// apps/web/tests/search.sanitize-match-terms.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeMatchTerm, sanitizeMatchTerms } from '@/lib/search/sanitize-match-terms'

describe('sanitizeMatchTerm', () => {
  it('strips PostgREST-unsafe punctuation and collapses whitespace', () => {
    expect(sanitizeMatchTerm('Shibuya, (Ward)')).toBe('Shibuya Ward')
  })
  it('preserves letters, numbers, spaces, and hyphens', () => {
    expect(sanitizeMatchTerm('Ho-Chi-Minh City 2')).toBe('Ho-Chi-Minh City 2')
  })
  it('trims leading/trailing whitespace produced by stripped punctuation', () => {
    expect(sanitizeMatchTerm(' Tokyo! ')).toBe('Tokyo')
  })
})

describe('sanitizeMatchTerms', () => {
  it('drops sub-minLength fragments as noise', () => {
    expect(sanitizeMatchTerms(['', ' ', 'x'])).toEqual([])
  })
  it('sanitizes every term and de-duplicates while preserving first-seen order', () => {
    expect(sanitizeMatchTerms(['Tokyo', 'Hong Kong, (HK)', 'Tokyo'])).toEqual(['Tokyo', 'Hong Kong HK'])
  })
  it('honors a custom minLength', () => {
    expect(sanitizeMatchTerms(['x', 'yz'], 1)).toEqual(['x', 'yz'])
  })
})
