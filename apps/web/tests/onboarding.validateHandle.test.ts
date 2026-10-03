import { describe, it, expect } from 'vitest'
import { normalizeHandle, validateHandle, PLATFORMS } from '@/lib/onboarding/validateHandle'

describe('PLATFORMS', () => {
  it('is exactly instagram, youtube, threads', () => {
    expect(PLATFORMS).toEqual(['instagram', 'youtube', 'threads'])
  })
})

describe('normalizeHandle', () => {
  it('strips a leading @ and surrounding whitespace', () => {
    expect(normalizeHandle('  @Travel_HK ')).toBe('Travel_HK')
  })
  it('strips an instagram profile URL down to the handle', () => {
    expect(normalizeHandle('https://www.instagram.com/travel.hk/')).toBe('travel.hk')
  })
  it('strips a youtube @handle URL', () => {
    expect(normalizeHandle('https://youtube.com/@TravelHK')).toBe('TravelHK')
  })
  it('leaves a bare handle unchanged', () => {
    expect(normalizeHandle('travelhk')).toBe('travelhk')
  })
})

describe('validateHandle', () => {
  it('accepts a valid instagram handle', () => {
    expect(validateHandle('instagram', 'travel.hk')).toEqual({ ok: true, value: 'travel.hk' })
  })
  it('accepts a valid youtube handle', () => {
    expect(validateHandle('youtube', '@TravelHK')).toEqual({ ok: true, value: 'TravelHK' })
  })
  it('accepts a valid threads handle', () => {
    expect(validateHandle('threads', 'travel_hk')).toEqual({ ok: true, value: 'travel_hk' })
  })
  it('rejects an empty handle', () => {
    expect(validateHandle('instagram', '   ')).toEqual({ ok: false, error: 'empty' })
  })
  it('rejects instagram with illegal characters', () => {
    expect(validateHandle('instagram', 'bad handle!')).toEqual({ ok: false, error: 'format' })
  })
  it('rejects instagram longer than 30 chars', () => {
    expect(validateHandle('instagram', 'a'.repeat(31))).toEqual({ ok: false, error: 'length' })
  })
  it('rejects youtube longer than 30 chars', () => {
    expect(validateHandle('youtube', 'a'.repeat(31))).toEqual({ ok: false, error: 'length' })
  })
  it('rejects threads with a dot (threads disallows dots in our rule)', () => {
    expect(validateHandle('threads', 'a.b')).toEqual({ ok: false, error: 'format' })
  })
  it('rejects an unknown platform', () => {
    // runtime guard — platform param is string so no compile-time error
    expect(validateHandle('tiktok', 'x')).toEqual({ ok: false, error: 'platform' })
  })
})
