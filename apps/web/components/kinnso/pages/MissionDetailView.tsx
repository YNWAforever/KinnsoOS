'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Locale } from '@/lib/i18n/config'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { SocialSignalBadge } from '@/components/kinnso/SocialSignalBadge'
import type { Messages } from '@/lib/i18n/messages/en'

type ReviewParticipantAction = 'approve' | 'reject'
type ReviewSubmissionAction = 'approve' | 'request_revision' | 'reject'
type SocialSignalStatus = 'verified_signal' | 'needs_review' | 'unavailable'

export type MissionDetail = {
  id: string
  title: string
  participants: Array<{ id: string; creatorName: string; creatorHandle?: string | null; status: string }>
  submissions: Array<{ id: string; creatorName?: string; creatorHandle?: string | null; status: string; snapshotStatus?: SocialSignalStatus }>
}

type MissionDetailViewProps = {
  locale: Locale
  t: Messages['missions']
  mission: MissionDetail
  onReviewParticipant: (participantId: string, action: ReviewParticipantAction) => KinnsoActionResult | Promise<KinnsoActionResult>
  onReviewSubmission: (submissionId: string, action: ReviewSubmissionAction) => KinnsoActionResult | Promise<KinnsoActionResult>
}

export function MissionDetailView({
  locale,
  t,
  mission,
  onReviewParticipant,
  onReviewSubmission,
}: MissionDetailViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

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

  return (
    <main className="k-container py-10">
      <Link href={`/${locale}/merchants/dashboard/missions`} className="text-sm font-semibold text-kinnso-orange hover:underline">
        <span aria-hidden="true">←</span> {t.backToQueue}
      </Link>
      <h1 className="mt-3 text-3xl font-black text-kinnso-ink">{mission.title}</h1>
      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.participants}</h2>
        <div className="mt-3 divide-y divide-kinnso-cream2 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
          {mission.participants.map((participant) => (
            <article key={participant.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {participant.creatorHandle ? (
                  <Link href={`/${locale}/c/${participant.creatorHandle}`} className="font-bold text-kinnso-ink hover:text-kinnso-orange hover:underline">
                    {participant.creatorName}
                  </Link>
                ) : (
                  <h3 className="font-bold text-kinnso-ink">{participant.creatorName}</h3>
                )}
                <MissionStatusBadge status={participant.status} />
              </div>
              {participant.status === 'applied' && (
                <div className="flex gap-2">
                  <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(() => onReviewParticipant(participant.id, 'approve'))}>
                    {t.approve}
                  </button>
                  <button type="button" className="k-btn-ghost text-sm" disabled={isPending} onClick={() => void runAction(() => onReviewParticipant(participant.id, 'reject'))}>
                    {t.reject}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {mission.submissions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.submitMilestone}</h2>
          <div className="mt-3 divide-y divide-kinnso-cream2 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
            {mission.submissions.map((submission) => (
              <article key={submission.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  {submission.creatorHandle && submission.creatorName ? (
                    <Link href={`/${locale}/c/${submission.creatorHandle}`} className="font-bold text-kinnso-ink hover:text-kinnso-orange hover:underline">
                      {submission.creatorName}
                    </Link>
                  ) : (
                    <h3 className="font-bold text-kinnso-ink">{submission.creatorName ?? submission.id}</h3>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <MissionStatusBadge status={submission.status} />
                    <SocialSignalBadge status={submission.snapshotStatus ?? 'unavailable'} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(() => onReviewSubmission(submission.id, 'approve'))}>
                    {t.approve}
                  </button>
                  <button type="button" className="k-btn-ghost text-sm" disabled={isPending} onClick={() => void runAction(() => onReviewSubmission(submission.id, 'request_revision'))}>
                    {t.requestRevision}
                  </button>
                  <button type="button" className="k-btn-ghost text-sm" disabled={isPending} onClick={() => void runAction(() => onReviewSubmission(submission.id, 'reject'))}>
                    {t.reject}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
