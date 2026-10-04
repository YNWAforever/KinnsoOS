'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Bot, Send } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import { TicketCard } from '@/components/kinnso/MarketPassport'

type UIMsg = { id: string; role: string; parts?: Array<{ type: string; text?: string }> }

function textOf(m: UIMsg): string {
  return (m.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
}

export function CreatorCopilotView({
  locale, t, configured, remaining, initialMessages,
}: {
  locale: Locale
  t: Messages['copilot']
  configured: boolean
  remaining: number
  initialMessages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
}) {
  const atLimit = remaining <= 0
  const { messages, sendMessage, status, clearError } = useChat({
    transport: new DefaultChatTransport({ api: '/api/copilot' }),
    messages: initialMessages.map((m) => ({ id: m.id, role: m.role, parts: [{ type: 'text', text: m.content }] })),
  } as never) as unknown as {
    messages: UIMsg[]
    sendMessage: (m: { text: string }, o?: unknown) => void
    status: string
    clearError: () => void
  }
  const [input, setInput] = useState('')
  const isError = status === 'error'

  if (!configured) {
    return (
      <main className="k-container py-16">
        <TicketCard className="p-8 text-center">
          <Bot aria-hidden="true" className="mx-auto h-8 w-8 text-kinnso-orange" />
          <h1 className="mt-3 text-2xl font-black text-kinnso-ink">{t.unconfiguredTitle}</h1>
          <p className="mt-2 text-kinnso-muted">{t.unconfiguredBody}</p>
        </TicketCard>
      </main>
    )
  }

  // Busy while the model is streaming/submitting; 'error' is a retry path, not a busy state.
  const busy = status !== 'ready' && status !== 'error'

  const onSend = () => {
    const text = input.trim()
    if (!text || atLimit || busy) return
    if (isError) clearError() // recover from a prior gateway/network failure before retrying
    sendMessage({ text }, { body: { locale } })
    setInput('')
  }

  return (
    <main className="k-container py-10">
      <header className="mb-6">
        <h1 className="k-display flex items-center gap-2"><Bot aria-hidden="true" className="h-7 w-7" /> {t.title}</h1>
        <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
      </header>

      <div className="space-y-4">
        {messages.length === 0 ? (
          <TicketCard className="p-6">
            <h2 className="text-lg font-bold text-kinnso-ink">{t.emptyTitle}</h2>
            <p className="mt-1 text-sm text-kinnso-muted">{t.emptyBody}</p>
          </TicketCard>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <span className="inline-block max-w-[80%] whitespace-pre-wrap rounded-2xl bg-kinnso-cream2 px-4 py-2 text-sm text-kinnso-ink">
                {textOf(m)}
              </span>
            </div>
          ))
        )}
        {busy ? <p className="text-sm text-kinnso-muted">{t.toolWorking}</p> : null}
        {isError ? (
          <p role="alert" className="text-sm font-medium text-kinnso-orange">{t.errorGeneric}</p>
        ) : null}
      </div>

      {atLimit ? (
        <TicketCard className="mt-6 p-5">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.limitTitle}</h2>
          <p className="mt-1 text-sm text-kinnso-muted">{t.limitBody}</p>
          <Link href={`/${locale}/studio/tier`} className="mt-3 inline-flex text-sm font-bold text-kinnso-orange">{t.limitUpsell}</Link>
        </TicketCard>
      ) : null}

      <div className="mt-6 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder={t.inputPlaceholder}
          disabled={atLimit}
          rows={2}
          className="k-input flex-1 resize-none disabled:opacity-60"
        />
        <button type="button" onClick={onSend} disabled={atLimit || busy} className="k-btn-primary inline-flex">
          {t.send} <Send aria-hidden="true" className="ml-2 h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-xs text-kinnso-muted">{t.disclaimer}</p>
    </main>
  )
}

export default CreatorCopilotView
