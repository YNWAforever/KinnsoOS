'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { ReceiptRow, TicketCard } from '@/components/kinnso/MarketPassport'
import type { Messages } from '@/lib/i18n/messages/en'

export type AffiliateOfferCard = {
  id: string
  title: string
  summary: string
  category: string | null
  compensation: string
  programUrl: string | null
  participant: { id: string; status: string } | null
  partnerLinks: Array<{ id: string; partnerUrl: string; subId: string }>
}

/** Show enough of the per-creator sub_id to be recognizable without dumping ~110 chars. */
function shortenSubId(subId: string): string {
  return subId.length > 22 ? `${subId.slice(0, 12)}…${subId.slice(-8)}` : subId
}

type StudioOffersViewProps = {
  t: Messages['studioOffers']
  offers: AffiliateOfferCard[]
  onJoin: (missionId: string) => KinnsoActionResult | Promise<KinnsoActionResult>
  onCreateLink: (missionParticipantId: string, originalUrl: string) => KinnsoActionResult | Promise<KinnsoActionResult>
  linkSetupPending?: boolean
}

export function StudioOffersView({ t, offers, onJoin, onCreateLink, linkSetupPending = false }: StudioOffersViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const runAction = async (action: () => KinnsoActionResult | Promise<KinnsoActionResult>) => {
    setActionError(null)
    setIsPending(true)
    try {
      const result = await action()
      setActionError(actionErrorMessage(result))
      if (actionSucceeded(result)) router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  const copyLink = async (id: string, url: string) => {
    await navigator.clipboard?.writeText(url)
    setCopiedId(id)
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.heading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.subtitle}</p>
      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}
      {offers.length === 0 ? (
        <p className="mt-8 text-sm text-kinnso-muted">{t.empty}</p>
      ) : (
        <div className="mt-6 grid gap-4">
          {offers.map((offer) => {
            const activeParticipantId = offer.participant?.status === 'active' ? offer.participant.id : null
            return (
              <TicketCard key={offer.id} as="article" className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <h2 className="text-lg font-bold text-kinnso-ink">{offer.title}</h2>
                    <p className="text-sm text-kinnso-muted">{offer.summary}</p>
                    {offer.category && (
                      <p className="text-xs text-kinnso-muted">{t.category}: {offer.category}</p>
                    )}
                    <MissionCompensationSummary text={`${t.commission}: ${offer.compensation}`} />
                  </div>
                  {offer.participant && <MissionStatusBadge status={offer.participant.status} />}
                </div>
                {offer.partnerLinks.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {offer.partnerLinks.map((link) => (
                      <li key={link.id}>
                        <ReceiptRow
                          label={link.partnerUrl}
                          value={
                            <button
                              type="button"
                              className="k-btn-ghost text-xs"
                              onClick={() => void copyLink(link.id, link.partnerUrl)}
                            >
                              {copiedId === link.id ? t.copied : t.copy}
                            </button>
                          }
                        />
                        {link.subId && (
                          <p className="mt-1 text-xs text-kinnso-muted">
                            {t.trackingId}:{' '}
                            <code className="font-mono" title={link.subId}>
                              {shortenSubId(link.subId)}
                            </code>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!offer.participant && (
                    <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(() => onJoin(offer.id))}>
                      {t.join}
                    </button>
                  )}
                  {activeParticipantId && offer.programUrl && (
                    linkSetupPending ? (
                      <p className="text-xs text-kinnso-muted">{t.setupNotConfigured}</p>
                    ) : (
                      <button
                        type="button"
                        className="k-btn-ghost text-sm"
                        disabled={isPending}
                        onClick={() => void runAction(() => onCreateLink(activeParticipantId, offer.programUrl as string))}
                      >
                        {t.generateLink}
                      </button>
                    )
                  )}
                  {offer.programUrl && (
                    <a className="k-btn-ghost text-sm" href={offer.programUrl} target="_blank" rel="noreferrer">
                      {t.viewProgram}
                    </a>
                  )}
                </div>
              </TicketCard>
            )
          })}
        </div>
      )}
    </main>
  )
}
