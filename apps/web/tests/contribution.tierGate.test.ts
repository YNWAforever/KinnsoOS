import { describe, expect, it } from 'vitest'
import { tierRank, meetsTier } from '@/lib/contribution/tiers'

describe('tierRank', () => {
  it('orders the ladder seed < rising < pro < elite', () => {
    expect(tierRank('seed')).toBe(0)
    expect(tierRank('rising')).toBe(1)
    expect(tierRank('pro')).toBe(2)
    expect(tierRank('elite')).toBe(3)
  })
})

describe('meetsTier', () => {
  it('returns true for a null requirement regardless of tier', () => {
    expect(meetsTier('seed', null)).toBe(true)
    expect(meetsTier('elite', null)).toBe(true)
  })

  it('requires the creator tier to be at or above the requirement', () => {
    expect(meetsTier('seed', 'rising')).toBe(false)
    expect(meetsTier('rising', 'rising')).toBe(true)
    expect(meetsTier('pro', 'rising')).toBe(true)
    expect(meetsTier('elite', 'rising')).toBe(true)
    expect(meetsTier('rising', 'pro')).toBe(false)
    expect(meetsTier('pro', 'pro')).toBe(true)
    expect(meetsTier('elite', 'pro')).toBe(true)
    expect(meetsTier('pro', 'elite')).toBe(false)
    expect(meetsTier('elite', 'elite')).toBe(true)
  })
})
