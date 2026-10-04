import { describe, expect, it } from 'vitest'
import { deriveStudioNextAction, type StudioSnapshot } from '@/lib/studio/next-action'

/** An active creator with a usable profile and nothing outstanding. */
function snapshot(overrides: Partial<StudioSnapshot> = {}): StudioSnapshot {
  return {
    handleCount: 1,
    missingPlatformCount: 0,
    guidesCount: 1,
    activeScanJob: false,
    affiliateOfferCount: 0,
    hasEarnings: true,
    dnaStale: false,
    ...overrides,
  }
}

describe('deriveStudioNextAction', () => {
  it('waits while a scan is running rather than proposing work that depends on the result', () => {
    const action = deriveStudioNextAction(
      snapshot({ activeScanJob: true, affiliateOfferCount: 5, guidesCount: 0, hasEarnings: false }),
    )
    expect(action.kind).toBe('await_scan')
  })

  // The thesis of this phase. mission_verified is 40 points against guide_published's
  // 15, travelpayouts offers cannot be tier-gated, and the payout is real money — so
  // when both are outstanding, earning wins.
  it('ranks earning above publishing a guide when both are outstanding', () => {
    const action = deriveStudioNextAction(
      snapshot({ affiliateOfferCount: 3, hasEarnings: false, guidesCount: 0 }),
    )
    expect(action.kind).toBe('start_earning')
    expect(action.path).toBe('/studio/offers')
  })

  it('does not propose earning to a creator who has connected no platform', () => {
    // Proof of a promoted link is verified by scanning the creator's own social
    // account; with nothing connected there is nothing to verify against.
    const action = deriveStudioNextAction(
      snapshot({ handleCount: 0, affiliateOfferCount: 3, hasEarnings: false, guidesCount: 0 }),
    )
    expect(action.kind).not.toBe('start_earning')
  })

  it('does not repeat the earning prompt once the creator has settled earnings', () => {
    const action = deriveStudioNextAction(
      snapshot({ affiliateOfferCount: 3, hasEarnings: true, guidesCount: 0 }),
    )
    expect(action.kind).toBe('publish_guide')
  })

  it('asks for a guide when the creator has none, because that is what lists them publicly', () => {
    const action = deriveStudioNextAction(snapshot({ guidesCount: 0 }))
    expect(action.kind).toBe('publish_guide')
    expect(action.path).toBe('/studio/guides/new')
  })

  it('suggests connecting the remaining platforms once earning and guides are handled', () => {
    const action = deriveStudioNextAction(snapshot({ missingPlatformCount: 2 }))
    expect(action.kind).toBe('connect_platforms')
  })

  it('suggests a rescan when the DNA has gone stale', () => {
    const action = deriveStudioNextAction(snapshot({ dnaStale: true }))
    expect(action.kind).toBe('refresh_dna')
    expect(action.path).toBe('/studio/scan')
  })

  it('reports nothing open rather than inventing an action', () => {
    const action = deriveStudioNextAction(snapshot())
    expect(action.kind).toBe('nothing_open')
    expect(action.path).toBeNull()
  })

  // Honesty: an empty catalogue must never read as "missions are coming".
  it('never proposes earning when the offer catalogue is empty', () => {
    const action = deriveStudioNextAction(
      snapshot({ affiliateOfferCount: 0, hasEarnings: false, guidesCount: 1, missingPlatformCount: 0 }),
    )
    expect(action.kind).toBe('nothing_open')
  })

  it('returns a locale-free path so the caller owns locale prefixing', () => {
    const action = deriveStudioNextAction(snapshot({ guidesCount: 0 }))
    expect(action.path?.startsWith('/studio')).toBe(true)
    expect(action.path).not.toMatch(/^\/(en|zh-hk|ja)\b/)
  })
})
