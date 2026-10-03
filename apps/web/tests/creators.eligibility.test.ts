import { describe, expect, it } from 'vitest'
import {
  directoryGaps,
  isDirectoryListed,
  type DirectoryEligibility,
} from '@/lib/creators/eligibility'

function creator(overrides: Partial<DirectoryEligibility> = {}): DirectoryEligibility {
  return {
    status: 'active',
    handle: 'may',
    publicProfile: { platforms: [] },
    publishedGuideCount: 1,
    isListed: false,
    ...overrides,
  }
}

describe('isDirectoryListed', () => {
  it('lists an active creator with a handle, a profile, and a published guide', () => {
    expect(isDirectoryListed(creator())).toBe(true)
  })

  it('lists via the ops override even with no published guide', () => {
    expect(isDirectoryListed(creator({ publishedGuideCount: 0, isListed: true }))).toBe(true)
  })

  it('does not list a creator whose only guides are drafts', () => {
    // The readiness checklist's "write a guide" item counts drafts, so this is
    // exactly the case where the two would disagree if the rule were restated.
    expect(isDirectoryListed(creator({ publishedGuideCount: 0 }))).toBe(false)
  })

  it.each([
    ['not active', { status: 'onboarding' }],
    ['no handle', { handle: null }],
    ['no public profile', { publicProfile: null }],
  ])('does not list a creator with %s', (_label, patch) => {
    expect(isDirectoryListed(creator(patch as Partial<DirectoryEligibility>))).toBe(false)
  })
})

describe('directoryGaps', () => {
  it('is empty when the creator is listed', () => {
    expect(directoryGaps(creator())).toEqual([])
  })

  it('names the published guide as the gap for an otherwise-complete profile', () => {
    expect(directoryGaps(creator({ publishedGuideCount: 0 }))).toEqual(['no_published_guide'])
  })

  it('never asks the creator to set the ops override themselves', () => {
    const gaps = directoryGaps(creator({ publishedGuideCount: 0, status: 'onboarding' }))
    expect(gaps).not.toContain('ops_override_only')
    expect(gaps).toContain('not_active')
  })

  it('reports every gap so the creator sees the whole path, not just the first step', () => {
    expect(directoryGaps(creator({ handle: null, publicProfile: null, publishedGuideCount: 0 })))
      .toEqual(['no_handle', 'no_public_profile', 'no_published_guide'])
  })
})
