import { describe, it, expect } from 'vitest'
import { feedItems } from '@/lib/creator-mock'

describe('feedItems mock', () => {
  it('exposes at least 6 feed items with the required shape', () => {
    expect(feedItems.length).toBeGreaterThanOrEqual(6)
    for (const f of feedItems) {
      expect(typeof f.id).toBe('string')
      expect(typeof f.creatorHandle).toBe('string')
      expect(typeof f.creatorName).toBe('string')
      expect(typeof f.avatar).toBe('string')
      expect(typeof f.image).toBe('string')
      expect(typeof f.caption).toBe('string')
      expect(typeof f.city).toBe('string')
      expect(typeof f.saves).toBe('number')
      expect(typeof f.postedAgo).toBe('string')
    }
  })
})
