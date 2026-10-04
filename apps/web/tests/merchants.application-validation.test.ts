import { describe, expect, it } from 'vitest'

import {
  validateMerchantApplicationInput,
  type MerchantApplicationInput,
} from '@/lib/merchants/application-validation'

const valid = (overrides: Partial<MerchantApplicationInput> = {}): MerchantApplicationInput => ({
  companyName: 'Acme Travel',
  contactName: 'Jane Doe',
  contactEmail: 'jane@acme.test',
  websiteUrl: 'https://merchant.test',
  pitch: 'We run boutique tours.',
  ...overrides,
})

describe('validateMerchantApplicationInput website policy', () => {
  it('rejects insecure and reserved-example websites while accepting public HTTPS websites', () => {
    expect(validateMerchantApplicationInput(valid({ websiteUrl: 'http://merchant.test' })).websiteUrl).toBeTruthy()
    expect(
      validateMerchantApplicationInput(valid({ websiteUrl: 'https://wanderpack.example.com' })).websiteUrl,
    ).toBeTruthy()
    expect(validateMerchantApplicationInput(valid({ websiteUrl: 'https://merchant.test' })).websiteUrl).toBeUndefined()
  })
})
