import { describe, it, expect } from 'vitest'
import { tierPolicy, type MerchantTier } from '@/lib/merchants/tier-policy'
describe('tierPolicy', () => {
  it('free: capped, filters locked, 3 invites', () => {
    expect(tierPolicy('free')).toEqual({ resultCap: 3, filtersUnlocked: false, inviteQuota: 3 })
  })
  it('growth: uncapped, filters unlocked, 30 invites', () => {
    const p = tierPolicy('growth' as MerchantTier)
    expect(p.resultCap).toBeNull(); expect(p.filtersUnlocked).toBe(true); expect(p.inviteQuota).toBe(30)
  })
})
