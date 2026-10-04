import { describe, it, expect } from 'vitest'
import { isMerchantStatus, isMerchantTier, normalizeMerchantDirectoryParams, MERCHANT_STATUSES, MERCHANT_TIERS } from '@/lib/admin/merchants-validation'

describe('merchants-validation', () => {
  it('recognizes valid statuses and tiers', () => {
    expect(MERCHANT_STATUSES).toEqual(['active', 'paused', 'suspended', 'archived'])
    expect(MERCHANT_TIERS).toEqual(['free', 'growth'])
    expect(isMerchantStatus('suspended')).toBe(true)
    expect(isMerchantStatus('banned')).toBe(false)
    expect(isMerchantTier('growth')).toBe(true)
    expect(isMerchantTier('pro')).toBe(false)
  })
  it('normalizes directory params, dropping invalid values', () => {
    expect(normalizeMerchantDirectoryParams({ q: '  acme ', status: 'active,bogus', tier: 'growth,free' }))
      .toEqual({ search: 'acme', statuses: ['active'], tiers: ['growth', 'free'] })
    expect(normalizeMerchantDirectoryParams({})).toEqual({ search: undefined, statuses: undefined, tiers: undefined })
  })
})
