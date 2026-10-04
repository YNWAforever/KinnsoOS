import { type Tier, meetsTier } from '@/lib/contribution/tiers'

export interface CopilotPolicy {
  /** Vercel AI Gateway model slug. CONFIRM exact ids against the live gateway catalog. */
  model: string
  /** Max user messages per UTC calendar day. */
  dailyLimit: number
  /** Whether the n8n tool is exposed to the model for this tier. */
  n8nEnabled: boolean
}

// Gateway model slugs — confirm against the gateway model catalog before go-live.
const HAIKU = 'anthropic/claude-haiku-4.5'
const SONNET = 'anthropic/claude-sonnet-4.6'

const BASE: Record<Tier, { model: string; dailyLimit: number }> = {
  seed: { model: HAIKU, dailyLimit: 10 },
  rising: { model: HAIKU, dailyLimit: 30 },
  pro: { model: SONNET, dailyLimit: 80 },
  elite: { model: SONNET, dailyLimit: 200 },
}

/** Single source of truth for all per-tier Copilot knobs. */
export function policyForTier(tier: Tier): CopilotPolicy {
  return { ...BASE[tier], n8nEnabled: meetsTier(tier, 'rising') }
}
