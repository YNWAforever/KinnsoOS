import { describe, it, expect } from 'vitest'
import { validatePerkInput, slugify, uniqueSlug, type PerkInput } from '@/lib/admin/perks-validation'

const valid: PerkInput = {
  partnerName: 'Klook', title: 'Klook 10% off', summary: 'Save on activities',
  category: 'Travel', discountLabel: '10% off', minTier: 'pro',
  redemptionType: 'code', redemptionValue: 'KINNSO10', sortOrder: 0, active: true,
}

describe('validatePerkInput', () => {
  it('returns no errors for a valid input', () => {
    expect(validatePerkInput(valid)).toEqual({})
  })
  it('flags blank required fields', () => {
    const e = validatePerkInput({ ...valid, partnerName: '  ', redemptionValue: '' })
    expect(e.partnerName).toBeTruthy()
    expect(e.redemptionValue).toBeTruthy()
  })
  it('rejects an invalid tier and redemption type', () => {
    const e = validatePerkInput({ ...valid, minTier: 'gold' as never, redemptionType: 'qr' as never })
    expect(e.minTier).toBeTruthy()
    expect(e.redemptionType).toBeTruthy()
  })
  it('accepts a null tier (open to all)', () => {
    expect(validatePerkInput({ ...valid, minTier: null }).minTier).toBeUndefined()
  })
  it('rejects a non-integer sort order', () => {
    expect(validatePerkInput({ ...valid, sortOrder: 1.5 }).sortOrder).toBeTruthy()
  })
  it('rejects a non-http(s) link value (javascript: scheme)', () => {
    const e = validatePerkInput({ ...valid, redemptionType: 'link', redemptionValue: 'javascript:alert(1)' })
    expect(e.redemptionValue).toBeTruthy()
  })
  it('rejects a malformed link value', () => {
    const e = validatePerkInput({ ...valid, redemptionType: 'link', redemptionValue: 'not a url' })
    expect(e.redemptionValue).toBeTruthy()
  })
  it('accepts an https link value', () => {
    const e = validatePerkInput({ ...valid, redemptionType: 'link', redemptionValue: 'https://klook.com/deal' })
    expect(e.redemptionValue).toBeUndefined()
  })
  it('does not URL-validate a code value', () => {
    const e = validatePerkInput({ ...valid, redemptionType: 'code', redemptionValue: 'SAVE10' })
    expect(e.redemptionValue).toBeUndefined()
  })
})

describe('slugify', () => {
  it('kebab-cases and strips punctuation', () => {
    expect(slugify('Klook 10% off!')).toBe('klook-10-off')
  })
  it('falls back to "perk" for empty results', () => {
    expect(slugify('!!!')).toBe('perk')
  })
})

describe('uniqueSlug', () => {
  it('returns the base when free', () => {
    expect(uniqueSlug('klook', [])).toBe('klook')
  })
  it('suffixes on collision', () => {
    expect(uniqueSlug('klook', ['klook', 'klook-2'])).toBe('klook-3')
  })
})
