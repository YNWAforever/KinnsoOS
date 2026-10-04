// apps/web/lib/sessions/waitlist-actions.ts
'use server'

import { getClientIp } from '@/lib/http/client-ip'
import { isLocale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const RSVP_RATE_LIMIT = { maxRequests: 10, windowSeconds: 3600 } as const

export type SessionWaitlistResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'rate_limited' | 'failed' }

export async function joinSessionWaitlistAction(
  locale: string,
  email: string,
  hp?: string,
): Promise<SessionWaitlistResult> {
  if (hp) return { ok: true }

  const normalized = String(email ?? '').trim().toLowerCase()
  if (!isLocale(locale) || !EMAIL_RE.test(normalized) || normalized.length > 254) {
    return { ok: false, error: 'invalid' }
  }

  const supabase = await createSupabaseServerClient()
  const ip = await getClientIp()
  const { data: allowed, error: rateLimitError } = await supabase.rpc(
    'check_and_increment_rsvp_rate_limit',
    {
      p_ip: ip,
      p_max_requests: RSVP_RATE_LIMIT.maxRequests,
      p_window_seconds: RSVP_RATE_LIMIT.windowSeconds,
    },
  )

  if (rateLimitError) {
    console.error('[sessions:waitlist] rate limit check failed', rateLimitError)
    return { ok: false, error: 'failed' }
  }
  if (!allowed) return { ok: false, error: 'rate_limited' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const serviceSupabase = createSupabaseServiceClient()
  const { error } = await serviceSupabase.from('session_waitlist').insert({
    email: normalized,
    user_id: user?.id ?? null,
    locale,
  })

  if (error && error.code !== '23505') {
    console.error('[sessions:waitlist] insert failed', error)
    return { ok: false, error: 'failed' }
  }

  return { ok: true }
}
