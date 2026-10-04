'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Bot, Send, ThumbsDown, ThumbsUp, CalendarRange, Compass, MapPinned } from 'lucide-react'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { rateAgentMessageAction } from '@/lib/agent/actions'
import { hasAnalyticsConsent, subscribeToAnalyticsConsent, trackTravellerEvent } from '@/lib/analytics/client'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type UIMsg = { id: string; role: string; parts?: Array<{ type: string; text?: string }> }

function textOf(m: UIMsg): string {
  return (m.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
}

export function AgentChatView({ locale, t, configured, bookingLive, anonSessionId, viewerSignedIn, initialMessages = [] }: {
  locale: Locale
  t: Messages['agent']
  configured: boolean
  bookingLive: boolean
  anonSessionId: string
  viewerSignedIn: boolean
  initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
}) {
  const consented = useSyncExternalStore(subscribeToAnalyticsConsent, hasAnalyticsConsent, () => false)
  const tracked = useRef(false)
  const initialLocale = useRef(locale)

  useEffect(() => {
    if (!consented || tracked.current) return
    tracked.current = true
    trackTravellerEvent('agent_started', { locale: initialLocale.current, routeKey: 'agent' })
  }, [consented])

  const { messages, sendMessage, status, clearError } = useChat({
    transport: new DefaultChatTransport({ api: '/api/agent' }),
    messages: initialMessages.map((m) => ({ id: m.id, role: m.role, parts: [{ type: 'text', text: m.content }] })),
  } as never) as unknown as {
    messages: UIMsg[]
    sendMessage: (m: { text: string }, o?: unknown) => void
    status: string
    clearError: () => void
  }
  const [input, setInput] = useState('')
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({})
  const isError = status === 'error'
  const busy = status !== 'ready' && status !== 'error'

  if (!configured) {
    return (
      <main className="k2-container py-16">
        <div className="k2-card p-8 text-center">
          <Bot aria-hidden="true" className="mx-auto h-8 w-8 text-kinnso-orangeDark" />
          <h1 className="mt-3 text-2xl font-black text-kinnso-ink">{t.unconfiguredTitle}</h1>
          <p className="mt-2 text-kinnso-muted">{t.unconfiguredBody}</p>
        </div>
      </main>
    )
  }

  const onSend = () => {
    const text = input.trim()
    if (!text || busy) return
    if (isError) clearError()
    const body: { locale: Locale; anonSessionId?: string } = { locale }
    if (!viewerSignedIn) body.anonSessionId = anonSessionId
    sendMessage({ text }, { body })
    setInput('')
  }

  const onRate = async (messageId: string, rating: 'up' | 'down') => {
    setRatings((r) => ({ ...r, [messageId]: rating }))
    await rateAgentMessageAction(messageId, rating, viewerSignedIn ? null : anonSessionId)
  }

  const points = [
    { title: t.point1Title, body: t.point1Body, icon: <MapPinned aria-hidden="true" className="h-5 w-5" /> },
    { title: t.point2Title, body: t.point2Body, icon: <CalendarRange aria-hidden="true" className="h-5 w-5" /> },
    {
      title: bookingLive ? t.point3TitleBookingLive : t.point3TitleBookingWaitlist,
      body: bookingLive ? t.point3BodyBookingLive : t.point3BodyBookingWaitlist,
      icon: <Compass aria-hidden="true" className="h-5 w-5" />,
    },
  ]

  return (
    <main className="k2-container py-10">
      <header className="mb-6">
        <h1 className="k2-display flex items-center gap-2 text-3xl font-semibold"><Bot aria-hidden="true" className="h-7 w-7" /> {t.title}</h1>
        <p className="mt-2 text-kinnso-ink/70">{bookingLive ? t.bodyBookingLive : t.bodyBookingWaitlist}</p>
      </header>

      {messages.length === 0 ? (
        <div className="grid gap-5 md:grid-cols-3">
          {points.map((pt) => (
            <EditorialCard key={pt.title} title={pt.title}>
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{pt.icon}</span>
              {pt.body}
            </EditorialCard>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <span className="inline-block max-w-[80%] whitespace-pre-wrap rounded-2xl bg-kinnso-cream2 px-4 py-2 text-sm text-kinnso-ink">
                {textOf(m)}
              </span>
              {m.role === 'assistant' ? (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    aria-label={t.ratingUpLabel}
                    aria-pressed={ratings[m.id] === 'up'}
                    onClick={() => onRate(m.id, 'up')}
                    className="text-kinnso-muted hover:text-kinnso-orangeDark"
                  >
                    <ThumbsUp aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.ratingDownLabel}
                    aria-pressed={ratings[m.id] === 'down'}
                    onClick={() => onRate(m.id, 'down')}
                    className="text-kinnso-muted hover:text-kinnso-orangeDark"
                  >
                    <ThumbsDown aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-sm text-kinnso-muted">{t.toolWorking}</p> : null}
          {isError ? <p role="alert" className="text-sm font-medium text-kinnso-orangeDark">{t.errorGeneric}</p> : null}
        </div>
      )}

      <div className="mt-6 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder={t.inputPlaceholder}
          rows={2}
          className="k2-input flex-1 resize-none"
        />
        <button type="button" onClick={onSend} disabled={busy} className="k2-btn-primary inline-flex">
          {t.send} <Send aria-hidden="true" className="ml-2 h-4 w-4" />
        </button>
      </div>
    </main>
  )
}

export default AgentChatView
