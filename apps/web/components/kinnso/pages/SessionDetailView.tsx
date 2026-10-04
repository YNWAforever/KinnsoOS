'use client'
import { useState } from 'react'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { rsvpToSessionAction } from '@/lib/sessions/rsvp-actions'
import { parseSessionEmbedUrl } from '@/lib/sessions/embed'
import type { PublicSession } from '@/lib/sessions/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

function EmbedFrame({ url, title }: { url: string; title: string }) {
  const parsed = parseSessionEmbedUrl(url)
  if (!parsed) return null
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        src={parsed.embedUrl}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

export function SessionDetailView({
  locale, t, session, viewerEmail,
}: {
  locale: Locale
  t: Messages['sessions']
  session: PublicSession
  viewerEmail: string | null
}) {
  const [email, setEmail] = useState(viewerEmail ?? '')
  const [hp, setHp] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' })

  const showLiveEmbed = (session.status === 'scheduled' || session.status === 'live') && session.embedUrl
  const showReplay = session.status === 'ended' && session.replayUrl
  const canRsvp = session.status !== 'cancelled'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    const result = await rsvpToSessionAction(session.id, email, hp)
    setStatus(result.ok ? 'done' : 'error')
  }

  const typeLabel: Record<string, string> = {
    destination_briefing: t.typeDestinationBriefing, ask_a_creator: t.typeAskACreator,
    merchant_spotlight: t.typeMerchantSpotlight, new_creator_intro: t.typeNewCreatorIntro,
  }

  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell>
        <Eyebrow>{typeLabel[session.type]}</Eyebrow>
        <h1 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink md:text-4xl">{session.title}</h1>
        <p className="mt-2 text-kinnso-ink/70">{dateTimeFmt.format(new Date(session.startsAt))}</p>
        {session.host ? <p className="mt-1 text-sm text-kinnso-ink/70">@{session.host.handle}</p> : null}
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{session.description}</p>

        {showLiveEmbed ? <div className="mt-8"><EmbedFrame url={session.embedUrl as string} title={session.title} /></div> : null}
        {showReplay ? <div className="mt-8"><EmbedFrame url={session.replayUrl as string} title={session.title} /></div> : null}

        <div className="mt-10 max-w-md">
          {!canRsvp ? (
            <p className="font-semibold text-kinnso-ink">{t.rsvpCancelledNotice}</p>
          ) : status === 'done' ? (
            <p className="font-semibold text-kinnso-ink">{t.rsvpConfirmed}</p>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-3">
              <label className="block text-sm font-semibold text-kinnso-ink">
                {t.rsvpEmailLabel}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="k2-input mt-1 w-full"
                />
              </label>
              {/* Honeypot: hidden from sighted users, off-screen instead of display:none so
                  simple bots that skip CSS-hidden fields still fill it in. */}
              <input
                type="text"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="absolute -left-[9999px]"
                aria-hidden="true"
              />
              <button type="submit" disabled={status === 'submitting'} className="k2-btn-primary">
                {t.rsvpSubmit}
              </button>
              {status === 'error' ? <p className="text-sm text-red-600">{t.rsvpError}</p> : null}
            </form>
          )}
        </div>
      </SectionShell>
    </div>
  )
}

export default SessionDetailView
