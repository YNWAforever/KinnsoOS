import { describe, expect, it } from 'vitest'
import { cssUrl } from '@/lib/utils'

describe('cssUrl', () => {
  it('round-trips a plain https URL without breaking the token', () => {
    const out = cssUrl('https://cdn.example.com/cover.jpg')
    expect(out).toBe('url("https://cdn.example.com/cover.jpg")')
    // Only the wrapping quotes — no stray quotes inside that would close early.
    const inner = out.slice('url("'.length, -2)
    expect(inner).not.toContain('"')
    expect(inner).not.toContain(' ')
  })

  it('does not leave an unescaped double quote inside the token', () => {
    const out = cssUrl('https://evil.example.com/a")background:red;("')
    const inner = out.slice('url("'.length, -2)
    // Any double-quote that survived must be backslash-escaped.
    expect(inner).not.toMatch(/(^|[^\\])"/)
    // Parens from the input must be percent-encoded, not raw.
    expect(inner).not.toContain('(')
    expect(inner).not.toContain(')')
  })

  it('encodes spaces so the value is a single unbroken token', () => {
    const out = cssUrl('https://cdn.example.com/my cover.jpg')
    expect(out).toContain('%20')
    const inner = out.slice('url("'.length, -2)
    expect(inner).not.toContain(' ')
  })

  it('neutralizes single quotes and parens from arbitrary input', () => {
    const inner = cssUrl(`https://x.test/a'b(c)d`).slice('url("'.length, -2)
    expect(inner).not.toContain("'")
    expect(inner).not.toContain('(')
    expect(inner).not.toContain(')')
  })
})
