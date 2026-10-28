import 'server-only'

import { AGENT_RATE_LIMIT } from '@/lib/agent/policy'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { getClientIp } from './client-ip'

const policies = {
  agent: { rpc: 'check_and_increment_agent_rate_limit', ...AGENT_RATE_LIMIT },
  checkout: { rpc: 'check_and_increment_checkout_rate_limit', maxRequests: 5, windowSeconds: 600 },
} as const

/** Only ledger mutation uses service credentials. Identity, limits and RPC names
 * come from the server; callers retain their session client for all product data. */
export async function checkServerRateLimit(kind: keyof typeof policies) {
  try {
    const policy = policies[kind]
    const ip = await getClientIp({ trustedOnly: true })
    const { data, error } = await createSupabaseServiceClient().rpc(policy.rpc, {
      p_ip: ip,
      p_max_requests: policy.maxRequests,
      p_window_seconds: policy.windowSeconds,
    })
    return { allowed: data === true && !error, failed: Boolean(error) }
  } catch {
    // Includes missing service credentials and transport failures. Never bypass quota.
    return { allowed: false, failed: true }
  }
}
