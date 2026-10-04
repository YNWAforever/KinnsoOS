import { NextResponse } from 'next/server'
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isAgentConfigured } from '@/lib/agent/config'
import { resolveConfiguredProductState } from '@/lib/product-state'
import { AGENT_MODEL, AGENT_RATE_LIMIT } from '@/lib/agent/policy'
import { makeAgentTools } from '@/lib/agent/tools'
import { appendAgentMessage, type AgentIdentity } from '@/lib/agent/queries'
import { getClientIp } from '@/lib/http/client-ip'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { validateChatMessages } from '@/lib/ai/chat-messages'

// Same bound, and the same reason, as the copilot route: `useChat` re-posts the
// whole conversation every turn, so without a cap a caller can grow the payload
// unbounded and feed it straight to the model on every request the IP limit
// still allows.
const MAX_AGENT_MESSAGES = 100
const MAX_AGENT_TOTAL_CHARS = 50_000

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Same streamText/tool-budget shape as app/api/copilot/route.ts (haiku model,
// stepCountIs(5), a handful of read-only search tools) — a real caller is
// synchronously waiting for the stream to start, so this matches the
// copilot's precedent for the same reason rather than the cron job's
// plan-capacity math (app/api/cron/travelpayouts-sync/route.ts). Anon vs
// signed-in identity resolution adds a cheap auth lookup + one rate-limit
// RPC before streamText is even called, not more model latency.
export const maxDuration = 30

const SYSTEM_PROMPT_BASE = `You are the KINNSO travel agent. Help travellers plan trips using
only the search tools available to you (searchGuides, searchArticles,
searchExperiences) — never invent a place, guide, or experience that a search didn't
return. Keep answers concise and conversational.`

function bookingAwareSystemPrompt(bookingLive: boolean): string {
  if (bookingLive) {
    return `${SYSTEM_PROMPT_BASE}\nWhen you recommend a bookable experience, mention it can be booked directly on KINNSO.`
  }
  return `${SYSTEM_PROMPT_BASE}\nDo not claim that an experience can be booked directly on KINNSO. Encourage travellers to save recommendations and explain that booking opens soon.`
}

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last) return ''
  const parts = (last as { parts?: Array<{ type: string; text?: string }> }).parts ?? []
  return parts.filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ').trim()
}

export async function POST(req: Request) {
  const { agentLive, bookingLive } = resolveConfiguredProductState()
  if (!agentLive) {
    return NextResponse.json({ error: 'agent_unavailable' }, { status: 503 })
  }
  if (!isAgentConfigured()) return NextResponse.json({ error: 'unconfigured' }, { status: 503 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const body = (await req.json().catch(() => ({}))) as {
    messages?: UIMessage[]; locale?: unknown; anonSessionId?: unknown
  }
  const validated = validateChatMessages(body.messages ?? [], {
    maxMessages: MAX_AGENT_MESSAGES,
    maxTotalChars: MAX_AGENT_TOTAL_CHARS,
  })
  // An empty conversation is a valid warm-up call here (unlike the copilot),
  // so only reject payloads that are actually oversized.
  if (!validated.ok && validated.reason === 'too_large') {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  }
  const messages = validated.ok ? validated.messages : []
  const locale: Locale = typeof body.locale === 'string' && isLocale(body.locale) ? body.locale : 'en'

  let identity: AgentIdentity
  if (user) {
    identity = { travelerUserId: user.id }
  } else {
    const anonSessionId = typeof body.anonSessionId === 'string' ? body.anonSessionId.trim() : ''
    // `agent_messages.anon_session_id` is a uuid column: a non-uuid would throw
    // inside appendAgentMessage (outside the stream's try/catch) as a 500.
    if (!UUID_PATTERN.test(anonSessionId)) {
      return NextResponse.json({ error: 'missing_anon_session_id' }, { status: 400 })
    }
    identity = { anonSessionId }
  }

  const ip = await getClientIp()
  const { data: allowed, error: rateLimitError } = await supabase.rpc('check_and_increment_agent_rate_limit', {
    p_ip: ip,
    p_max_requests: AGENT_RATE_LIMIT.maxRequests,
    p_window_seconds: AGENT_RATE_LIMIT.windowSeconds,
  })
  if (rateLimitError) {
    console.error('[agent] rate limit check failed', rateLimitError)
    return NextResponse.json({ error: 'rate_limit_check_failed' }, { status: 500 })
  }
  if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const text = lastUserText(messages)
  if (text) await appendAgentMessage(supabase, identity, 'user', text)

  const tools = makeAgentTools(supabase, locale)

  // Same rationale as the copilot route: this try/catch only guards
  // synchronous setup errors; gateway/auth/credit failures resolve lazily
  // during the stream and are surfaced via onError instead.
  try {
    const result = streamText({
      model: AGENT_MODEL,
      system: bookingAwareSystemPrompt(bookingLive),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      onError: ({ error }) => {
        console.error('[agent] stream error', error)
      },
      onFinish: async ({ text: out }: { text: string }) => {
        if (out) await appendAgentMessage(supabase, identity, 'assistant', out)
      },
    })
    return result.toUIMessageStreamResponse()
  } catch {
    return NextResponse.json({ error: 'gateway' }, { status: 502 })
  }
}
