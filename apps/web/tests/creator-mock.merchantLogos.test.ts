import { describe, it, expect } from 'vitest'
import { merchantLogos, creators } from '@/lib/creator-mock'

describe('homepage mock data', () => {
  it('exposes a non-empty merchantLogos string list', () => {
    expect(Array.isArray(merchantLogos)).toBe(true)
    expect(merchantLogos.length).toBeGreaterThanOrEqual(5)
    expect(merchantLogos.every((m) => typeof m === 'string' && m.length > 0)).toBe(true)
  })
  it('still exposes creators for the featured carousel', () => {
    expect(creators.length).toBeGreaterThanOrEqual(5)
    expect(typeof creators[0].handle).toBe('string')
  })
})
