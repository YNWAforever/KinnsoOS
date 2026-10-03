// apps/web/lib/sessions/rsvp-actions.ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/http/client-ip'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const RSVP_RATE_LIMIT = { maxRequests: 10, windowSeconds: 3600 } as const

export type RsvpResult = { ok: true } | { ok: false; error: 'invalid' | 'rate_limited' | 'cancelled' | 'failed' }

/**
 * Anon-or-authenticated RSVP insert (session_rsvps_insert RLS, D-R5-5). `hp` is the
 * form honeypot: bots that fill it get a fake success and no insert (same shield as
 * submitMerchantApplicationAction). A unique-violation (23505) on (session_id, email) is
 * success, not failure — re-RSVPing is a no-op and this doubles as an
 * email-enumeration shield. Uses the SSR-aware server client (not the public
 * client) specifically so a signed-in visitor's user_id is attached.
 *
 * Also verifies the target session is not cancelled (and exists) before inserting.
 * This is a defense-in-depth app-layer check that mirrors the RLS policy's own
 * `exists (... cs.status <> 'cancelled')` clause — the RLS policy is the real
 * enforcement boundary, but checking here first gives a clean, specific error
 * instead of a raw RLS-insert failure. A missing session is treated the same as
 * cancelled: neither is available to RSVP to.
 */
export async function rsvpToSessionAction(sessionId: string, email: string, hp?: string): Promise<RsvpResult> {
  if (hp) return { ok: true }
  const normalized = String(email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) return { ok: false, error: 'invalid' }

  const supabase = await createSupabaseServerClient()
  const ip = await getClientIp()
  const { data: allowed, error: rateLimitError } = await supabase.rpc('check_and_increment_rsvp_rate_limit', {
    p_ip: ip,
    p_max_requests: RSVP_RATE_LIMIT.maxRequests,
    p_window_seconds: RSVP_RATE_LIMIT.windowSeconds,
  })
  if (rateLimitError) {
    console.error('[sessions:rsvp] rate limit check failed', rateLimitError)
    return { ok: false, error: 'failed' }
  }
  if (!allowed) return { ok: false, error: 'rate_limited' }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('community_sessions')
    .select('status')
    .eq('id', sessionId)
    .maybeSingle()
  if (sessionError) {
    console.error('[sessions:rsvp] session status lookup failed', sessionError)
    return { ok: false, error: 'failed' }
  }
  if (!sessionRow || sessionRow.status === 'cancelled') return { ok: false, error: 'cancelled' }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('session_rsvps').insert({
    session_id: sessionId,
    email: normalized,
    user_id: user?.id ?? null,
  })
  if (error && error.code !== '23505') {
    console.error('[sessions:rsvp] rsvp failed', error)
    return { ok: false, error: 'failed' }
  }
  return { ok: true }
}
