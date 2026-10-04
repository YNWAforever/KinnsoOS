import type { SettlementSource } from '@/lib/admin/creators-queries'

const STATUSES = ['onboarding', 'active', 'suspended', 'banned'] as const
export type CreatorStatus = (typeof STATUSES)[number]

const TIERS = ['seed', 'rising', 'pro', 'elite']
const DNA = ['published', 'draft', 'none']

export function isCreatorStatus(s: string): s is CreatorStatus {
  return (STATUSES as readonly string[]).includes(s)
}

export { validateReason, validateBulkIds } from '@/lib/admin/ops-validation'

export interface DirectoryParams {
  search?: string
  statuses?: string[]
  tiers?: string[]
  dna?: 'published' | 'draft' | 'none'
  verified?: boolean
}

type RawSearchParams = {
  q?: string
  status?: string
  tier?: string
  dna?: string
  verified?: string
}

const csv = (v: string | undefined, allowed: string[]): string[] | undefined => {
  if (!v) return undefined
  const parts = v.split(',').map((s) => s.trim()).filter((s) => allowed.includes(s))
  return parts.length ? parts : undefined
}

/** Map raw URL search params to validated RPC inputs (invalid values dropped). */
export function normalizeDirectoryParams(raw: RawSearchParams): DirectoryParams {
  const search = raw.q?.trim() || undefined
  const statuses = csv(raw.status, STATUSES as unknown as string[])
  const tiers = csv(raw.tier, TIERS)
  const dna = DNA.includes(raw.dna ?? '') ? (raw.dna as DirectoryParams['dna']) : undefined
  const verified = raw.verified === 'true' ? true : raw.verified === 'false' ? false : undefined
  return { search, statuses, tiers, dna, verified }
}

export const SETTLEMENT_STATUSES = ['not_started', 'pending', 'partially_paid', 'paid', 'disputed'] as const
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]

export const LEG_STATUSES = ['pending', 'paid'] as const
export type LegStatus = (typeof LEG_STATUSES)[number]

export function isSettlementStatus(s: string): s is SettlementStatus {
  return (SETTLEMENT_STATUSES as readonly string[]).includes(s)
}

export function isSettlementSource(v: string): v is SettlementSource {
  return v === 'affiliate' || v === 'mission_fee' || v === 'manual'
}

export function isLegStatus(s: string): s is LegStatus {
  return (LEG_STATUSES as readonly string[]).includes(s)
}
