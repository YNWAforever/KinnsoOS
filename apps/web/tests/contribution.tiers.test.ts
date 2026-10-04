import { describe, it, expect } from 'vitest'
import { TIERS, POINT_WEIGHTS, TIER_THRESHOLDS, tierForPoints, progressToNext } from '@/lib/contribution/tiers'

describe('tierForPoints', () => {
  it('maps points to the right tier at every boundary', () => {
    expect(tierForPoints(0)).toBe('seed')
    expect(tierForPoints(49)).toBe('seed')
    expect(tierForPoints(50)).toBe('rising')
    expect(tierForPoints(149)).toBe('rising')
    expect(tierForPoints(150)).toBe('pro')
    expect(tierForPoints(399)).toBe('pro')
    expect(tierForPoints(400)).toBe('elite')
    expect(tierForPoints(99999)).toBe('elite')
  })
  it('clamps negative/garbage to seed', () => {
    expect(tierForPoints(-10)).toBe('seed')
  })
})

describe('progressToNext', () => {
  it('computes progress within a tier band', () => {
    const p = progressToNext(80) // rising band 50..150
    expect(p.tier).toBe('rising')
    expect(p.nextTier).toBe('pro')
    expect(p.points).toBe(80)
    expect(p.pointsForNext).toBe(70) // 150 - 80
    expect(p.pct).toBe(30) // (80-50)/(150-50)=30%
  })
  it('reports 100% and no next tier at elite', () => {
    const p = progressToNext(500)
    expect(p.tier).toBe('elite')
    expect(p.nextTier).toBeNull()
    expect(p.pointsForNext).toBeNull()
    expect(p.pct).toBe(100)
  })
  it('floors fractional points', () => {
    expect(progressToNext(50.9).tier).toBe('rising')
  })
})

describe('constants', () => {
  it('pins the canonical weights + ladder (sync with SQL migration)', () => {
    expect(POINT_WEIGHTS).toEqual({ dna_scan: 10, guide_published: 15, mission_verified: 40 })
    expect(TIERS).toEqual(['seed', 'rising', 'pro', 'elite'])
    expect(TIER_THRESHOLDS.map((t) => t.min)).toEqual([0, 50, 150, 400])
  })
})
