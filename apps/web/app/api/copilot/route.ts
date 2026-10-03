import { NextResponse } from 'next/server'
import { streamText, stepCountIs, convertToModelMessages, type ToolSet, type UIMessage } from 'ai'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getCreatorStoredTier } from '@/lib/contribution/queries'
import { policyForTier } from '@/lib/copilot/policy'
import { isCopilotConfigured } from '@/lib/copilot/config'
import { buildCopilotSystemPrompt } from '@/lib/copilot/system-prompt'
import { validateCopilotMessages } from '@/lib/copilot/request'
import { makeN8nTool } from '@/lib/copilot/tools/n8n'
import { appendMessage, countUserMessagesToday } from '@/lib/copilot/queries'
import { DnaSchema } from '@kinnso/scan'
import { isLocale } from '@/lib/i18n/config'

export const maxDuration = 30

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last) return ''
  const parts = (last as { parts?: Array<{ type: string; text?: string }> }).parts ?? []
  return parts.filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ').trim()
}

export async function POST(req: Request) {
  if (!isCopilotConfigured()) return NextResponse.json({ error: 'unconfigured' }, { status: 503 })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = await resolveViewerRole(supabase)
  if (role !== 'creator') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { messages?: UIMessage[]; locale?: unknown }
  const check = validateCopilotMessages(body.messages)
  if (!check.ok) return NextResponse.json({ error: check.reason === 'too_large' ? 'payload_too_large' : 'invalid_request' }, { status: check.reason === 'too_large' ? 413 : 400 })
  const messages = check.messages
  const locale = typeof body.locale === 'string' && isLocale(body.locale) ? body.locale : 'en'

  const { data: dnaRow } = await supabase.from('creator_dna').select('final').eq('creator_id', user.id).single()
  const parsed = DnaSchema.safeParse((dnaRow as { final?: unknown } | null)?.final)
  if (!parsed.success) return NextResponse.json({ error: 'no_dna' }, { status: 409 })
  const dna = parsed.data

  const policy = policyForTier(await getCreatorStoredTier(supabase, user.id))

  const used = await countUserMessagesToday(supabase, user.id)
  if (used >= policy.dailyLimit) {
    return NextResponse.json({ error: 'limit', limit: policy.dailyLimit }, { status: 429 })
  }

  const text = lastUserText(messages)
  if (text) await appendMessage(supabase, user.id, 'user', text)

  const tools: ToolSet = policy.n8nEnabled
    ? { n8n: makeN8nTool({ id: user.id, niches: dna.niches, locales: dna.audience.top_locales ?? [] }) }
    : {}

  // The try/catch only guards SYNCHRONOUS setup errors (e.g. convertToModelMessages on
  // malformed input). Gateway/auth/credit failures resolve lazily and surface DURING the
  // stream — after a 200 is sent — so they cannot be caught here; `onError` makes them
  // observable server-side (the default just console.errors with no context) and the
  // client renders them via useChat's status==='error'.
  try {
    const result = streamText({
      model: policy.model,
      system: buildCopilotSystemPrompt(dna, locale),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      onError: ({ error }) => {
        console.error('[copilot] stream error', error)
      },
      onFinish: async ({ text: out }: { text: string }) => {
        if (out) await appendMessage(supabase, user.id, 'assistant', out)
      },
    })
    return result.toUIMessageStreamResponse()
  } catch {
    return NextResponse.json({ error: 'gateway' }, { status: 502 })
  }
}
