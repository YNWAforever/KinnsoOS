'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import TierBadge from '@/components/kinnso/TierBadge'
import { segmentMissions } from '@/lib/missions/list'
import type { GatedTier } from '@/lib/contribution/tiers'
import type { Messages } from '@/lib/i18n/messages/en'
import type { MissionType } from '@/lib/missions/types'

export type CreatorMissionCard = {
  id: string
  title: string
  summary: string
  missionSource: 'merchant' | 'travelpayouts'
  missionType: MissionType
  status: string
  participant: { id: string; status: string; source: string } | null
  partnerLinks: Array<{ id: string; partnerUrl: string }>
  programUrl: string | null
  compensation: string
  milestoneCount: number
  submittedCount: number
  locked: boolean
  requiredTier: GatedTier | null
  funded: boolean
}

type CreatorMissionsViewProps = {
  locale: string
  t: Messages['missions']
  missions: CreatorMissionCard[]
  onJoin: (missionId: string) => KinnsoActionResult | Promise<KinnsoActionResult>
  onAccept: (missionId: string) => KinnsoActionResult | Promise<KinnsoActionResult>
}

const isMerchantInvitation = (mission: CreatorMissionCard) =>
  mission.participant?.status === 'invited' && mission.participant.source === 'merchant_invite'

export function CreatorMissionsView({ locale, t, missions, onJoin, onAccept }: CreatorMissionsViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const invitations = missions.filter(isMerchantInvitation)
  const { mine, available } = segmentMissions(missions.filter((mission) => !isMerchantInvitation(mission)))

  const getJoinLabel = (missionType: CreatorMissionCard['missionType']) =>
    missionType === 'coupon_affiliate' ? t.joinMission : t.applyMission

  const detailHref = (missionId: string) => `/${locale}/studio/missions/${missionId}`

  const runAction = async (missionId: string, action: () => KinnsoActionResult | Promise<KinnsoActionResult>) => {
    setActionError(null)
    setPendingId(missionId)
    try {
      const result = await action()
      setActionError(actionErrorMessage(result))
      if (actionSucceeded(result)) router.refresh()
    } finally {
      setPendingId(null)
    }
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.missionQueue}</h1>
      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}

      {invitations.length > 0 && (
        <section className="mt-8" aria-label={t.invitationsTitle}>
          <h2 className="text-lg font-bold text-kinnso-ink">{t.invitationsTitle}</h2>
          <div className="mt-4 grid gap-4">
            {invitations.map((mission) => (
              <TicketCard key={mission.id} as="article" className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <h3 className="text-lg font-bold text-kinnso-ink">{mission.title}</h3>
                    <p className="text-sm text-kinnso-muted">{mission.summary}</p>
                    <MissionCompensationSummary text={mission.compensation} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <MissionStatusBadge status={mission.participant?.status ?? mission.status} />
                    {mission.funded && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        {t.fundedBadge}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <Link href={detailHref(mission.id)} className="k-btn-ghost text-sm">
                    {t.viewDetails}
                  </Link>
                  <button
                    type="button"
                    className="k-btn-primary text-sm"
                    disabled={pendingId === mission.id}
                    onClick={() => void runAction(mission.id, () => onAccept(mission.id))}
                  >
                    {t.acceptInvite}
                  </button>
                </div>
              </TicketCard>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8" aria-label={t.myMissions}>
        <h2 className="text-lg font-bold text-kinnso-ink">{t.myMissions}</h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-sm text-kinnso-muted">{t.myMissionsEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-4">
            {mine.map((mission) => (
              <TicketCard key={mission.id} as="article" className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <h3 className="text-lg font-bold text-kinnso-ink">{mission.title}</h3>
                    <p className="text-sm text-kinnso-muted">{mission.summary}</p>
                    <MissionCompensationSummary text={mission.compensation} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <MissionStatusBadge status={mission.participant?.status ?? mission.status} />
                    {mission.funded && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        {t.fundedBadge}
                      </span>
                    )}
                  </div>
                </div>
                {mission.milestoneCount > 0 && (
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-kinnso-cream2">
                      <div
                        className="h-full rounded-full bg-kinnso-ink"
                        style={{ width: `${Math.round((mission.submittedCount / mission.milestoneCount) * 100)}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-xs text-kinnso-muted">
                      {mission.submittedCount} / {mission.milestoneCount} {t.milestoneProgress}
                    </span>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <Link href={detailHref(mission.id)} className="k-btn-ghost text-sm">
                    {t.viewDetails}
                  </Link>
                </div>
              </TicketCard>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10" aria-label={t.availableMissions}>
        <h2 className="text-lg font-bold text-kinnso-ink">{t.availableMissions}</h2>
        {available.length === 0 ? (
          <p className="mt-3 text-sm text-kinnso-muted">{t.availableEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-4">
            {available.map((mission) => (
              <TicketCard key={mission.id} as="article" className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <h3 className="text-lg font-bold text-kinnso-ink">{mission.title}</h3>
                    <p className="text-sm text-kinnso-muted">{mission.summary}</p>
                    <MissionCompensationSummary text={mission.compensation} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <MissionStatusBadge status={mission.status} />
                    {mission.funded && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        {t.fundedBadge}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <Link href={detailHref(mission.id)} className="k-btn-ghost text-sm">
                    {t.viewDetails}
                  </Link>
                  {mission.locked && mission.requiredTier ? (
                    <>
                      <span className="text-xs font-semibold text-kinnso-muted">{t.locked}</span>
                      <TierBadge tier={mission.requiredTier} />
                      <button type="button" className="k-btn-primary text-sm" disabled aria-disabled="true">
                        {getJoinLabel(mission.missionType)}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="k-btn-primary text-sm"
                      disabled={pendingId === mission.id}
                      onClick={() => void runAction(mission.id, () => onJoin(mission.id))}
                    >
                      {getJoinLabel(mission.missionType)}
                    </button>
                  )}
                </div>
              </TicketCard>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
