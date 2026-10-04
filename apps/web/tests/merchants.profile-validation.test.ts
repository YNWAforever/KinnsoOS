import { describe, expect, it } from 'vitest'

import { validateMerchantProfileInput, type MerchantProfileInput } from '@/lib/merchants/profile-validation'

const valid = (overrides: Partial<MerchantProfileInput> = {}): MerchantProfileInput => ({
  companyName: 'Acme Travel',
  contactName: 'Jane',
  contactEmail: 'jane@acme.test',
  websiteUrl: 'https://merchant.test',
  tagline: 'Boutique tours in Hong Kong',
  city: 'Hong Kong',
  logoUrl: '',
  ...overrides,
})

describe('validateMerchantProfileInput website policy', () => {
  it('rejects insecure and reserved-example websites while accepting public HTTPS websites', () => {
    expect(validateMerchantProfileInput(valid({ websiteUrl: 'http://merchant.test' })).websiteUrl).toBeTruthy()
    expect(validateMerchantProfileInput(valid({ websiteUrl: 'https://wanderpack.example.com' })).websiteUrl).toBeTruthy()
    expect(validateMerchantProfileInput(valid({ websiteUrl: 'https://merchant.test' })).websiteUrl).toBeUndefined()
  })
})
