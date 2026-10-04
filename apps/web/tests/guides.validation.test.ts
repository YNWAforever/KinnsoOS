import { describe, it, expect } from 'vitest'
import { validateGuideInput } from '@/lib/guides/validation'
import type { GuideInput } from '@/lib/guides/types'

const valid: GuideInput = {
  title: 'Shibuya Coffee Crawl',
  city: 'Tokyo',
  coverUrl: 'https://example.com/cover.jpg',
  summary: 'Seven quiet roasters in one afternoon.',
}

describe('validateGuideInput', () => {
  it('accepts valid input', () => {
    expect(validateGuideInput(valid)).toEqual({ ok: true, errors: {} })
  })
  it('requires title, summary, city, coverUrl', () => {
    const result = validateGuideInput({ title: ' ', city: '', coverUrl: '', summary: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.title).toContain('required')
    expect(result.errors.summary).toContain('required')
    expect(result.errors.city).toContain('required')
    expect(result.errors.coverUrl).toContain('required')
  })
  it('rejects a non-http(s) cover URL', () => {
    const result = validateGuideInput({ ...valid, coverUrl: 'ftp://nope' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.coverUrl).toContain('invalid_url')
  })
  it('rejects an over-long title', () => {
    const result = validateGuideInput({ ...valid, title: 'a'.repeat(121) })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.title).toContain('too_long')
  })
})
