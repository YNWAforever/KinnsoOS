// apps/web/tests/sessions.validation.test.ts
import { describe, it, expect } from 'vitest'
import { validateSessionInput, canGoLive } from '@/lib/sessions/validation'
import type { SessionInput } from '@/lib/sessions/types'

const validInput: SessionInput = {
  title: 'Tokyo late-night ramen: ask me anything',
  description: 'Bring your questions about ramen shops that stay open past midnight.',
  type: 'ask_a_creator',
  startsAt: '2027-01-15T18:00:00.000Z',
  durationMinutes: '45',
  embedUrl: '',
  replayUrl: '',
  destinationTags: 'Tokyo, Japan',
}

describe('validateSessionInput', () => {
  it('accepts a fully valid input and parses destinationTags/durationMinutes/startsAt', () => {
    const result = validateSessionInput(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parsed.destinationTags).toEqual(['Tokyo', 'Japan'])
      expect(result.parsed.durationMinutes).toBe(45)
      expect(result.parsed.startsAt).toBe('2027-01-15T18:00:00.000Z')
      expect(result.parsed.embedUrl).toBeNull()
      expect(result.parsed.replayUrl).toBeNull()
    }
  })

  it('rejects an empty title', () => {
    const result = validateSessionInput({ ...validInput, title: '  ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.title).toBeTruthy()
  })

  it('rejects an invalid session type', () => {
    const result = validateSessionInput({ ...validInput, type: 'not_a_real_type' as never })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.type).toBeTruthy()
  })

  it('rejects a non-positive or non-integer duration', () => {
    expect(validateSessionInput({ ...validInput, durationMinutes: '0' }).ok).toBe(false)
    expect(validateSessionInput({ ...validInput, durationMinutes: '12.5' }).ok).toBe(false)
    expect(validateSessionInput({ ...validInput, durationMinutes: '' }).ok).toBe(false)
  })

  it('rejects an unparsable startsAt', () => {
    const result = validateSessionInput({ ...validInput, startsAt: 'not a date' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.startsAt).toBeTruthy()
  })

  it('rejects a non-YouTube embedUrl', () => {
    const result = validateSessionInput({ ...validInput, embedUrl: 'https://zoom.us/j/123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.embedUrl).toBeTruthy()
  })

  it('rejects a non-YouTube replayUrl', () => {
    const result = validateSessionInput({ ...validInput, replayUrl: 'https://vimeo.com/123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.replayUrl).toBeTruthy()
  })

  it('accepts a valid YouTube embedUrl and stores it trimmed, as-given', () => {
    const result = validateSessionInput({ ...validInput, embedUrl: '  https://youtu.be/abc123  ' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed.embedUrl).toBe('https://youtu.be/abc123')
  })

  it('parses an empty destinationTags string to an empty array, and trims/drops blanks', () => {
    const result = validateSessionInput({ ...validInput, destinationTags: ' Tokyo ,, Japan ,' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed.destinationTags).toEqual(['Tokyo', 'Japan'])
  })

  it('preserves destinationTags casing as typed — case-insensitive matching against ops-curated destinations.match_terms happens on the read side (destination_tags_ci), not here', () => {
    const result = validateSessionInput({ ...validInput, destinationTags: 'Tokyo, JAPAN' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed.destinationTags).toEqual(['Tokyo', 'JAPAN'])
  })
})

describe('canGoLive', () => {
  it('is false without an embed_url', () => {
    expect(canGoLive({ embedUrl: null })).toBe(false)
  })
  it('is true with an embed_url', () => {
    expect(canGoLive({ embedUrl: 'https://youtu.be/abc123' })).toBe(true)
  })
})
