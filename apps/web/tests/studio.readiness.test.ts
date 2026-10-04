import { describe, it, expect } from 'vitest'
import { computeReadiness, REQUIRED_PLATFORMS, FRESH_MAX_DAYS } from '@/lib/studio/readiness'
import type { Platform } from '@kinnso/scan'

const all: { platform: Platform }[] = [
  { platform: 'instagram' },
  { platform: 'youtube' },
  { platform: 'threads' },
]

describe('computeReadiness', () => {
  it('marks every item done for a complete, fresh, guide-published creator', () => {
    const r = computeReadiness({
      handles: all,
      guidesCount: 2,
      dnaUpdatedAtIso: '2026-06-01T00:00:00Z',
      now: new Date('2026-06-10T00:00:00Z'),
    })
    expect(r.total).toBe(4)
    expect(r.doneCount).toBe(4)
    expect(r.items.map((i) => i.id)).toEqual([
      'dna-ready',
      'write-guide',
      'connect-platforms',
      'dna-fresh',
    ])
  })

  it('dna-ready is always done', () => {
    const r = computeReadiness({
      handles: [],
      guidesCount: 0,
      dnaUpdatedAtIso: '2026-06-01T00:00:00Z',
      now: new Date('2026-06-02T00:00:00Z'),
    })
    expect(r.items.find((i) => i.id === 'dna-ready')!.done).toBe(true)
  })

  it('write-guide is todo with 0 guides and done with >=1', () => {
    const zero = computeReadiness({ handles: all, guidesCount: 0, dnaUpdatedAtIso: '2026-06-01T00:00:00Z', now: new Date('2026-06-02T00:00:00Z') })
    expect(zero.items.find((i) => i.id === 'write-guide')!.done).toBe(false)
    const one = computeReadiness({ handles: all, guidesCount: 1, dnaUpdatedAtIso: '2026-06-01T00:00:00Z', now: new Date('2026-06-02T00:00:00Z') })
    expect(one.items.find((i) => i.id === 'write-guide')!.done).toBe(true)
  })

  it('connect-platforms lists the missing platforms when partial', () => {
    const r = computeReadiness({
      handles: [{ platform: 'instagram' }],
      guidesCount: 1,
      dnaUpdatedAtIso: '2026-06-01T00:00:00Z',
      now: new Date('2026-06-02T00:00:00Z'),
    })
    const item = r.items.find((i) => i.id === 'connect-platforms')!
    expect(item.done).toBe(false)
    expect(item.detail.platformGap).toEqual({ connected: 1, total: 3, missing: ['youtube', 'threads'] })
  })

  it('connect-platforms is done with all three required platforms', () => {
    const r = computeReadiness({ handles: all, guidesCount: 1, dnaUpdatedAtIso: '2026-06-01T00:00:00Z', now: new Date('2026-06-02T00:00:00Z') })
    const item = r.items.find((i) => i.id === 'connect-platforms')!
    expect(item.done).toBe(true)
    expect(item.detail.platformGap!.missing).toEqual([])
  })

  it('dna-fresh: done when within the freshness window, stale past it', () => {
    const fresh = computeReadiness({ handles: all, guidesCount: 1, dnaUpdatedAtIso: '2026-05-01T00:00:00Z', now: new Date('2026-05-15T00:00:00Z') })
    const freshItem = fresh.items.find((i) => i.id === 'dna-fresh')!
    expect(freshItem.done).toBe(true)
    expect(freshItem.detail.freshness).toEqual({ days: 14, stale: false })

    const stale = computeReadiness({ handles: all, guidesCount: 1, dnaUpdatedAtIso: '2026-05-01T00:00:00Z', now: new Date('2026-07-05T00:00:00Z') })
    const staleItem = stale.items.find((i) => i.id === 'dna-fresh')!
    expect(staleItem.done).toBe(false)
    expect(staleItem.detail.freshness!.stale).toBe(true)
    expect(staleItem.detail.freshness!.days).toBe(65)
  })

  it('clamps negative freshness (future updated_at) to 0 days', () => {
    const r = computeReadiness({ handles: all, guidesCount: 1, dnaUpdatedAtIso: '2026-06-10T00:00:00Z', now: new Date('2026-06-01T00:00:00Z') })
    expect(r.items.find((i) => i.id === 'dna-fresh')!.detail.freshness!.days).toBe(0)
  })

  it('exposes the required-platforms list and freshness window', () => {
    expect(REQUIRED_PLATFORMS).toEqual(['instagram', 'youtube', 'threads'])
    expect(FRESH_MAX_DAYS).toBe(30)
  })
})
