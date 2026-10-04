import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/auth/safe-next'

describe('safeNext', () => {
  it('accepts an in-app path under the caller locale', () => {
    expect(safeNext('/en/ops/accept-invite?token=abc', 'en')).toBe('/en/ops/accept-invite?token=abc')
  })

  it('accepts a percent-encoded in-app path', () => {
    expect(safeNext(encodeURIComponent('/en/ops/accept-invite?token=abc'), 'en')).toBe(
      '/en/ops/accept-invite?token=abc',
    )
  })

  it.each([
    ['absolute url', 'https://evil.test/steal'],
    ['scheme-relative', '//evil.test/steal'],
    ['backslash scheme-relative', '/\\evil.test'],
    ['not a path', 'evil.test'],
    ['protocol-ish', 'javascript:alert(1)'],
  ])('rejects %s', (_label, value) => {
    expect(safeNext(value, 'en')).toBeNull()
  })

  it('rejects a header-splitting control character', () => {
    expect(safeNext('/en/studio\r\nLocation: https://evil.test', 'en')).toBeNull()
  })

  it('rejects a path for a different locale', () => {
    expect(safeNext('/zh-hk/studio', 'en')).toBeNull()
  })

  it('rejects an unknown first segment', () => {
    expect(safeNext('/notalocale/studio', 'en')).toBeNull()
  })

  it('returns null for missing or blank input', () => {
    expect(safeNext(undefined, 'en')).toBeNull()
    expect(safeNext('   ', 'en')).toBeNull()
  })
})
