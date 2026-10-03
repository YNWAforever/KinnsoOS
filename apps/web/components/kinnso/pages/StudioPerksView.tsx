'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { PerkCard } from '@/lib/perks/list'
import type { ActionResult } from '@/lib/admin/result'
import { TicketCard, RouteStamp } from '@/components/kinnso/MarketPassport'

type RedeemResult = ActionResult<{ redemptionType: 'code' | 'link'; value: string }>

/** Only http(s) values are safe to put in an href — guards against a javascript: value. */
const isHttpUrl = (v: string) => /^https?:\/\//i.test(v.trim())

function Reveal({ t, value, type }: { t: Messages['perks']['catalog']; value: string; type: 'code' | 'link' }) {
  const [copied, setCopied] = useState(false)
  if (type === 'link' && isHttpUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-block rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white">
        {t.openDeal}
      </a>
    )
  }
  // A code value, or a link that failed the http(s) guard, is shown as copyable text —
  // never rendered into an href, so a malformed/unsafe value can't become a clickable link.
  async function copy() {
    try {
      await navigator.clipboard?.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="rounded bg-kinnso-cream2 px-3 py-1 font-mono text-kinnso-ink">{value}</code>
      <button onClick={copy} className="rounded-full border border-kinnso-edge px-3 py-1 text-sm font-bold text-kinnso-ink">
        {copied ? t.copied : t.copyCode}
      </button>
    </div>
  )
}

function PerkCardItem({
  t, locale, card, onRedeem,
}: {
  t: Messages['perks']
  locale: Locale
  card: PerkCard
  onRedeem: (perkId: string) => Promise<RedeemResult>
}) {
  const c = t.catalog
  const [revealed, setRevealed] = useState<{ type: 'code' | 'link'; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function reveal() {
    setPending(true)
    setError(null)
    const r = await onRedeem(card.id)
    setPending(false)
    if (r.ok) setRevealed({ type: r.redemptionType, value: r.value })
    else setError(r.errors.form?.[0] ?? c.redeemFailed)
  }

  return (
    <TicketCard className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-kinnso-muted">{card.partnerName}</span>
        {card.state === 'redeemed' && <RouteStamp className="bg-kinnso-orange/10 text-kinnso-orange">{c.redeemed}</RouteStamp>}
        {card.state === 'locked' && <RouteStamp className="bg-kinnso-cream2 text-kinnso-muted">{c.lockedBadge}</RouteStamp>}
      </div>
      <h3 className="mt-2 text-lg font-bold text-kinnso-ink">{card.title}</h3>
      <p className="mt-1 text-sm text-kinnso-muted">{card.summary}</p>
      <p className="mt-2 text-sm font-bold text-kinnso-orange">{card.discountLabel}</p>

      {card.state === 'locked' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-kinnso-muted">
          <Lock aria-hidden="true" className="h-4 w-4" />
          <span>{c.requiresTier.replace('{tier}', card.minTier ? t.tierLabels[card.minTier] : '')}</span>
          <Link href={`/${locale}/studio/tier`} className="font-bold text-kinnso-orange">{c.unlockCta}</Link>
        </div>
      )}

      {(card.state === 'redeemable' || card.state === 'redeemed') && !revealed && (
        <button onClick={reveal} disabled={pending}
          className="mt-3 rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {card.state === 'redeemed' ? c.reveal : c.redeem}
        </button>
      )}
      {revealed && <Reveal t={c} value={revealed.value} type={revealed.type} />}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </TicketCard>
  )
}

export function StudioPerksView({
  locale, t, cards, onRedeem,
}: {
  locale: Locale
  t: Messages['perks']
  cards: PerkCard[]
  onRedeem: (perkId: string) => Promise<RedeemResult>
}) {
  return (
    <main className="k-container py-10">
      <h1 className="k-display">{t.catalog.heading}</h1>
      <p className="mt-2 text-kinnso-muted">{t.catalog.subtitle}</p>
      {cards.length === 0 ? (
        <p className="mt-8 text-kinnso-muted">{t.catalog.empty}</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <PerkCardItem key={card.id} t={t} locale={locale} card={card} onRedeem={onRedeem} />
          ))}
        </div>
      )}
    </main>
  )
}

export default StudioPerksView
