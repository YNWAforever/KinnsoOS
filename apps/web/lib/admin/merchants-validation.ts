export const MERCHANT_STATUSES = ['active', 'paused', 'suspended', 'archived'] as const
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number]
export const MERCHANT_TIERS = ['free', 'growth'] as const
export type MerchantTier = (typeof MERCHANT_TIERS)[number]

export function isMerchantStatus(s: string): s is MerchantStatus {
  return (MERCHANT_STATUSES as readonly string[]).includes(s)
}
export function isMerchantTier(s: string): s is MerchantTier {
  return (MERCHANT_TIERS as readonly string[]).includes(s)
}

export interface MerchantDirectoryParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
}
type RawSearchParams = { q?: string; status?: string; tier?: string }

const csv = (v: string | undefined, allowed: readonly string[]): string[] | undefined => {
  if (!v) return undefined
  const parts = v.split(',').map((s) => s.trim()).filter((s) => allowed.includes(s))
  return parts.length ? parts : undefined
}

/** Map raw URL search params to validated RPC inputs (invalid values dropped). */
export function normalizeMerchantDirectoryParams(raw: RawSearchParams): MerchantDirectoryParams {
  return {
    search: raw.q?.trim() || undefined,
    statuses: csv(raw.status, MERCHANT_STATUSES),
    tiers: csv(raw.tier, MERCHANT_TIERS),
  }
}
