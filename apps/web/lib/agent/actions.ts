'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export type RateAgentMessageResult = { ok: true } | { ok: false }

export async function rateAgentMessageAction(
  messageId: string,
  rating: 'up' | 'down',
  anonSessionId: string | null,
): Promise<RateAgentMessageResult> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('rate_agent_message', {
    p_message_id: messageId,
    p_rating: rating,
    // The generated RPC arg type only declares `string | undefined` (Postgres'
    // `default null` maps to an optional TS property, not a nullable one), but the
    // SQL function treats an explicit NULL identically to an omitted argument --
    // passing `null` through here is correct at runtime, just not expressible in
    // the generated type without this assertion.
    p_anon_session_id: anonSessionId as string | undefined,
  })
  if (error) {
    console.error('[agent:rate] rate_agent_message failed', error)
    return { ok: false }
  }
  return { ok: true }
}
