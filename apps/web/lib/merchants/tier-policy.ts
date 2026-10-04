export type MerchantTier = 'free' | 'growth'
export interface TierPolicy { resultCap: number | null; filtersUnlocked: boolean; inviteQuota: number }
export function tierPolicy(tier: MerchantTier): TierPolicy {
  return tier === 'growth'
    ? { resultCap: null, filtersUnlocked: true, inviteQuota: 30 }
    : { resultCap: 3, filtersUnlocked: false, inviteQuota: 3 }
}
