import { describe, it, expect } from 'vitest'
import { truncate, pickNiches, safeImageUrl } from '@/lib/seo/og/data'

describe('truncate', () => {
  it('returns the string unchanged when within the limit', () => {
    expect(truncate('Kyoto Tea Houses', 40)).toBe('Kyoto Tea Houses')
  })
  it('cuts and adds an ellipsis past the limit', () => {
    const out = truncate('a'.repeat(60), 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('pickNiches', () => {
  it('keeps at most 3 by default', () => {
    expect(pickNiches(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c'])
  })
  it('returns all when fewer than the cap', () => {
    expect(pickNiches(['a'])).toEqual(['a'])
  })
})

describe('safeImageUrl', () => {
  it('allows a normal https CDN url', () => {
    expect(safeImageUrl('https://cdn.kinnso.ai/covers/x.jpg')).toBe('https://cdn.kinnso.ai/covers/x.jpg')
  })
  it('rejects null/empty/malformed', () => {
    expect(safeImageUrl(null)).toBeUndefined()
    expect(safeImageUrl('')).toBeUndefined()
    expect(safeImageUrl('not a url')).toBeUndefined()
  })
  it('rejects non-https', () => {
    expect(safeImageUrl('http://cdn.kinnso.ai/x.jpg')).toBeUndefined()
  })
  it('rejects internal/loopback/link-local hosts (SSRF)', () => {
    expect(safeImageUrl('https://localhost/x')).toBeUndefined()
    expect(safeImageUrl('https://127.0.0.1/x')).toBeUndefined()
    expect(safeImageUrl('https://10.0.0.5/x')).toBeUndefined()
    expect(safeImageUrl('https://192.168.1.1/x')).toBeUndefined()
    expect(safeImageUrl('https://172.16.0.1/x')).toBeUndefined()
    expect(safeImageUrl('https://169.254.169.254/latest/meta-data/')).toBeUndefined()
  })
  it('rejects IPv6 internal literals — bracketed hostnames bypassed the old `=== "::1"` check', () => {
    expect(safeImageUrl('https://[::1]/x')).toBeUndefined() // loopback
    expect(safeImageUrl('https://[::]/x')).toBeUndefined() // unspecified
    expect(safeImageUrl('https://[fd00::1]/x')).toBeUndefined() // unique-local (fc00::/7)
    expect(safeImageUrl('https://[fe80::1]/x')).toBeUndefined() // link-local (fe80::/10)
    expect(safeImageUrl('https://[::ffff:127.0.0.1]/x')).toBeUndefined() // IPv4-mapped loopback
  })
  it('rejects internal IPv4 written as a decimal/hex integer (URL normalises it)', () => {
    expect(safeImageUrl('https://2130706433/x')).toBeUndefined() // 127.0.0.1
    expect(safeImageUrl('https://0x7f000001/x')).toBeUndefined() // 127.0.0.1
  })
})
