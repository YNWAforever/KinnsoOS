import { describe, expect, it } from 'vitest'
import { normalizeHandle, resolveConfidence } from '../src/handle-match'

describe('normalizeHandle', () => {
  it('strips @, whitespace, trailing slash, lowercases', () => {
    expect(normalizeHandle('  @Traveler/ ')).toBe('traveler')
    expect(normalizeHandle(null)).toBe('')
  })
})

describe('resolveConfidence', () => {
  it('verified_signal when author matches creator handle', () => {
    expect(resolveConfidence({ authorHandle: '@Traveler', engagementCount: 10, postUrl: null }, 'traveler')).toBe('verified_signal')
  })
  it('needs_review when post resolves but author differs', () => {
    expect(resolveConfidence({ authorHandle: 'someone_else', engagementCount: null, postUrl: null }, 'traveler')).toBe('needs_review')
  })
  it('needs_review when the post has no author handle', () => {
    expect(resolveConfidence({ authorHandle: null, engagementCount: null, postUrl: null }, 'traveler')).toBe('needs_review')
  })
  it('unavailable when the post could not be fetched', () => {
    expect(resolveConfidence(null, 'traveler')).toBe('unavailable')
  })
  it('verified_signal via channel-id match even when handles differ', () => {
    expect(
      resolveConfidence(
        { authorHandle: 'whatever', authorId: 'UCabc', engagementCount: null, postUrl: null },
        'some-handle',
        'UCabc',
      ),
    ).toBe('verified_signal')
  })
  it('falls back to handle match (verified) when channel ids differ but handles match', () => {
    expect(
      resolveConfidence(
        { authorHandle: '@Traveler', authorId: 'UCother', engagementCount: null, postUrl: null },
        'traveler',
        'UCmine',
      ),
    ).toBe('verified_signal')
  })
  it('needs_review when channel ids AND handles both differ', () => {
    expect(
      resolveConfidence(
        { authorHandle: 'someone_else', authorId: 'UCother', engagementCount: null, postUrl: null },
        'traveler',
        'UCmine',
      ),
    ).toBe('needs_review')
  })
  it('verified_signal via handle when no expectedId is given (IG/Threads unchanged)', () => {
    expect(
      resolveConfidence({ authorHandle: '@Traveler', authorId: 'UCother', engagementCount: null, postUrl: null }, 'traveler'),
    ).toBe('verified_signal')
  })
})
