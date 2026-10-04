import { describe, it, expect } from 'vitest'
import { policyForTier } from '@/lib/copilot/policy'
import { meetsTier, TIERS } from '@/lib/contribution/tiers'

describe('policyForTier', () => {
  it('gives seed pure chat (no n8n) on the Haiku-class model with the lowest limit', () => {
    const p = policyForTier('seed')
    expect(p.n8nEnabled).toBe(false)
    expect(p.dailyLimit).toBe(10)
    expect(p.model).toContain('haiku')
  })

  it('unlocks the n8n tool at rising and above', () => {
    expect(policyForTier('rising').n8nEnabled).toBe(true)
    expect(policyForTier('pro').n8nEnabled).toBe(true)
    expect(policyForTier('elite').n8nEnabled).toBe(true)
  })

  it('scales the daily limit up by tier', () => {
    const limits = TIERS.map((t) => policyForTier(t).dailyLimit)
    expect(limits).toEqual([10, 30, 80, 200])
  })

  it('uses a Sonnet-class model for pro/elite', () => {
    expect(policyForTier('pro').model).toContain('sonnet')
    expect(policyForTier('elite').model).toContain('sonnet')
  })

  it('keeps n8nEnabled in lockstep with meetsTier(tier, "rising")', () => {
    for (const t of TIERS) {
      expect(policyForTier(t).n8nEnabled).toBe(meetsTier(t, 'rising'))
    }
  })
})
