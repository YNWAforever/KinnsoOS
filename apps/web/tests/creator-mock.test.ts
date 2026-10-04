import { describe, it, expect } from 'vitest'
import { DnaSchema } from '@kinnso/scan'
import {
  getCreator,
  computeBreakdown,
  creatorLocations,
  sampleDna,
} from '@/lib/creator-mock'

describe('getCreator', () => {
  it('returns a known creator by handle', () => {
    const c = getCreator('maywanders')
    expect(c).toBeDefined()
    expect(c?.name).toBe('Maya Wong')
    expect(c?.handle).toBe('maywanders')
    expect(c?.tier).toBe('pro')
  })

  it('returns undefined for an unknown handle', () => {
    expect(getCreator('nobody')).toBeUndefined()
  })
})

describe('sampleDna', () => {
  it('is a valid @kinnso/scan Dna', () => {
    const parsed = DnaSchema.safeParse(sampleDna)
    expect(parsed.success).toBe(true)
    expect(sampleDna.platforms.every((p) => p.verified === false)).toBe(true)
  })
})

describe('creatorLocations — Fix 1 regression (city label)', () => {
  it('no city label contains a double-space (Hong Kong must not become "Hong  Kong")', () => {
    expect(creatorLocations.every((l) => !/\s{2,}/.test(l.city))).toBe(true)
  })

  it('at least one location city is exactly "Hong Kong" (single space)', () => {
    expect(creatorLocations.some((l) => l.city === 'Hong Kong')).toBe(true)
  })
})

describe('computeBreakdown', () => {
  it('total equals the sum of components (within rounding)', () => {
    const b = computeBreakdown(getCreator('nomadleo')!)
    const sum = b.reach + b.er + b.travel + b.diversity + b.recency
    expect(Math.abs(b.total - sum)).toBeLessThanOrEqual(0.5)
    expect(b.total).toBeGreaterThan(0)
  })
})
