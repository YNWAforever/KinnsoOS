'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, useSyncExternalStore } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { PublicOffer } from '@/lib/offers/public-queries'
import {
  getCurrentJourneyId,
  hasAnalyticsConsent,
  subscribeToAnalyticsConsent,
  trackTravellerEvent,
} from '@/lib/analytics/client'

export type ClaimOffer = (
  offerId: string, creatorId: string, guideId: string | null, source: 'guide' | 'profile',
  options?: { locale?: Locale; journeyId?: string | null },
) => Promise<{ ok: boolean; claimId?: string; errors?: Record<string, string[]> }>

export function OfferClaimCard({
  t, locale, offer, creatorId, guideId, source, onClaim,
}: {
  t: { claimButton: string; validThrough: string; claimFailed: string }
  locale: Locale
  offer: PublicOffer
  creatorId: string
  guideId: string | null
  source: 'guide' | 'profile'
  onClaim: ClaimOffer
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)
  const consented = useSyncExternalStore(subscribeToAnalyticsConsent, hasAnalyticsConsent, () => false)
  const tracked = useRef(false)
  const viewedMetadata = useRef({
    locale, routeKey: source === 'guide' ? 'guide_detail' as const : 'creator_profile' as const,
    entityType: 'offer' as const, entityId: offer.id,
  })

  useEffect(() => {
    if (!consented || tracked.current) return
    tracked.current = true
    trackTravellerEvent('offer_viewed', viewedMetadata.current)
  }, [consented])

  function claim() {
    setFailed(false)
    startTransition(async () => {
      const journeyId = getCurrentJourneyId()
      const result = await onClaim(offer.id, creatorId, guideId, source, { locale, journeyId })
      if (result.ok && result.claimId) {
        trackTravellerEvent('offer_claimed', {
          locale, routeKey: source === 'guide' ? 'guide_detail' : 'creator_profile',
          entityType: 'offer', entityId: offer.id,
        })
        router.push(`/${locale}/offers/${result.claimId}`)
        return
      }
      // A cap-reached, already-claimed or no-longer-live offer used to render
      // nothing at all: the button simply stopped responding, which reads as a
      // broken page rather than an offer that is genuinely gone. The specific
      // reason stays server-side -- it would leak another visitor's claim state
      // and the merchant's remaining capacity -- but the outcome is now stated.
      setFailed(true)
    })
  }

  return (
    <div className="rounded-lg border border-kinnso-edge p-4 max-w-md">
      <p className="font-bold text-kinnso-ink">{offer.title}</p>
      <p className="mt-1 text-sm text-kinnso-muted">
        {offer.merchantName} · {t.validThrough} {new Date(offer.validTo).toLocaleDateString(locale, { timeZone: 'UTC' })}
      </p>
      <button
        disabled={isPending}
        onClick={claim}
        className="mt-3 rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {t.claimButton}
      </button>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-kinnso-ink/80">
          {t.claimFailed}
        </p>
      )}
    </div>
  )
}
