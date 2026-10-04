'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { actionErrorMessage, actionSucceeded, type KinnsoActionResult } from '@/components/kinnso/action-result'
import { MissionCompensationSummary } from '@/components/kinnso/MissionCompensationSummary'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { SocialSignalBadge } from '@/components/kinnso/SocialSignalBadge'
import { SubmissionVerification } from '@/components/kinnso/SubmissionVerification'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import TierBadge from '@/components/kinnso/TierBadge'
import type { GatedTier } from '@/lib/contribution/tiers'
import { startVerification } from '@/lib/missions/verify-client'
import type { CreatorMissionDetail, MilestoneRow, ReceiptSubmissionRow } from '@/lib/missions/detail'
import type { Messages } from '@/lib/i18n/messages/en'

type SubmitResult = { ok: true; submissionId: string } | { ok: false; errors?: Record<string, string[]> }

type CreatorMissionDetailViewProps = {
  locale: string
  t: Messages['missionDetail']
  mission: CreatorMissionDetail
  onJoin: () => KinnsoActionResult | Promise<KinnsoActionResult>
  onApply: (note: string) => KinnsoActionResult | Promise<KinnsoActionResult>
  onSubmitMilestone: (input: { milestoneId: string; proofUrl: string; notes: string }) => Promise<SubmitResult>
  // Optional: only receipt_cashback missions render the repeatable receipt-submission
  // panel below (see mission.cta === 'active' && mission.missionType === 'receipt_cashback'),
  // so callers rendering any other mission type never need to supply this.
  onSubmitReceipt?: (input: { proofUrl: string }) => Promise<SubmitResult>
  lockedTier?: GatedTier | null
  gating?: { locked: string; lockedHelp: string }
}

function MilestoneSubmit({
  milestone, t, onSubmitMilestone,
}: {
  milestone: MilestoneRow
  t: Messages['missionDetail']
  onSubmitMilestone: CreatorMissionDetailViewProps['onSubmitMilestone']
}) {
  const [proofUrl, setProofUrl] = useState(milestone.proofUrl ?? '')
  const [notes, setNotes] = useState(milestone.notes ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(milestone.verification?.jobId ?? null)

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const result = await onSubmitMilestone({ milestoneId: milestone.id, proofUrl, notes })
      if (!result.ok) {
        setError(Object.values(result.errors ?? {}).flat()[0] ?? t.submitError)
        return
      }
      const started = await startVerification(result.submissionId)
      if ('jobId' in started) setJobId(started.jobId)
      else setError(t.submitError)
    } finally {
      setPending(false)
    }
  }

  const isResubmit = milestone.state === 'revision_requested'

  return (
    <div className="mt-3 space-y-2">
      {milestone.merchantFeedback && (
        <p className="rounded-md bg-kinnso-cream2 px-3 py-2 text-xs text-kinnso-ink">
          <span className="font-semibold">{t.merchantFeedbackLabel}:</span> {milestone.merchantFeedback}
        </p>
      )}
      {milestone.canSubmit && (
        <>
          <label className="block text-xs font-semibold text-kinnso-ink" htmlFor={`proof-${milestone.id}`}>{t.proofUrlLabel}</label>
          <input
            id={`proof-${milestone.id}`} className="k-input w-full" value={proofUrl}
            placeholder={t.proofUrlPlaceholder} onChange={(e) => setProofUrl(e.target.value)}
          />
          <label className="block text-xs font-semibold text-kinnso-ink" htmlFor={`notes-${milestone.id}`}>{t.submissionNotesLabel}</label>
          <textarea
            id={`notes-${milestone.id}`} className="k-input w-full" rows={2} value={notes}
            placeholder={t.submissionNotesPlaceholder} onChange={(e) => setNotes(e.target.value)}
          />
          {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
          <button type="button" className="k-btn-primary text-sm" disabled={pending} onClick={() => void submit()}>
            {isResubmit ? t.resubmitMilestone : t.submitMilestone}
          </button>
        </>
      )}
      {jobId && <SubmissionVerification jobId={jobId} t={t} />}
    </div>
  )
}

function receiptReasonLabel(t: Messages['missionDetail'], reason: string): string {
  switch (reason) {
    case 'unreadable': return t.receiptReasonUnreadable
    case 'wrong_venue': return t.receiptReasonWrongVenue
    case 'duplicate': return t.receiptReasonDuplicate
    case 'amount_unclear': return t.receiptReasonAmountUnclear
    default: return t.receiptReasonOther
  }
}

// Renders the repeatable-receipt submission flow for a receipt_cashback mission in place
// of the fixed-milestone-checklist section: a "Submit a receipt" form (reusing the same
// plain proof-URL field pattern MilestoneSubmit above uses -- this codebase has no actual
// file-upload widget anywhere to reuse instead), a running count against
// max_receipts_per_creator when set, and the full submission history (every submission
// against the one repeatable milestone, not just the latest) with each rejected/
// revision-requested entry's reason from mission_review_events.
function ReceiptSubmissions({
  mission, t, onSubmitReceipt,
}: {
  mission: CreatorMissionDetail
  t: Messages['missionDetail']
  onSubmitReceipt?: CreatorMissionDetailViewProps['onSubmitReceipt']
}) {
  const [proofUrl, setProofUrl] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<ReceiptSubmissionRow[]>(mission.receiptSubmissions)

  const activeCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'approved').length
  const capReached = mission.maxReceiptsPerCreator != null && activeCount >= mission.maxReceiptsPerCreator

  async function submit() {
    if (!onSubmitReceipt) return
    setPending(true)
    setError(null)
    try {
      const result = await onSubmitReceipt({ proofUrl })
      if (!result.ok) {
        setError(Object.values(result.errors ?? {}).flat()[0] ?? t.submitError)
        return
      }
      setSubmissions((prev) => [
        { id: result.submissionId, status: 'submitted', proofUrls: [proofUrl.trim()], notes: null, submittedAt: new Date().toISOString(), rejectionReason: null },
        ...prev,
      ])
      setProofUrl('')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-kinnso-ink">{t.receiptsHeading}</h2>
      {mission.maxReceiptsPerCreator != null && (
        <p className="mt-1 text-sm text-kinnso-muted">{t.receiptCountLabel(activeCount, mission.maxReceiptsPerCreator)}</p>
      )}

      {capReached ? (
        <p role="status" className="mt-3 text-sm font-semibold text-kinnso-ink">{t.receiptCapReached}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-semibold text-kinnso-ink" htmlFor="receipt-proof-url">{t.receiptProofUrlLabel}</label>
          <input
            id="receipt-proof-url" className="k-input w-full" value={proofUrl}
            placeholder={t.receiptProofUrlPlaceholder} onChange={(e) => setProofUrl(e.target.value)}
          />
          {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
          <button type="button" className="k-btn-primary text-sm" disabled={pending || !proofUrl.trim()} onClick={() => void submit()}>
            {t.submitReceipt}
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {submissions.length === 0 ? (
          <p className="text-sm text-kinnso-muted">{t.receiptSubmissionsEmpty}</p>
        ) : (
          submissions.map((submission) => (
            <TicketCard key={submission.id} as="article" className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-kinnso-muted">{submission.submittedAt?.slice(0, 10)}</span>
                <MissionStatusBadge status={submission.status} />
              </div>
              {submission.rejectionReason && (
                <p className="mt-2 text-xs text-red-700">
                  <span className="font-semibold">{t.rejectionReasonLabel}:</span> {receiptReasonLabel(t, submission.rejectionReason)}
                </p>
              )}
            </TicketCard>
          ))
        )}
      </div>
    </section>
  )
}

export function CreatorMissionDetailView({ locale, t, mission, onJoin, onApply, onSubmitMilestone, onSubmitReceipt, lockedTier, gating }: CreatorMissionDetailViewProps) {
  const router = useRouter()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [note, setNote] = useState('')

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
      <Link href={`/${locale}/studio/missions`} className="text-sm text-kinnso-muted">
        ← {t.back}
      </Link>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-3xl font-black text-kinnso-ink">{mission.title}</h1>
        <div className="flex flex-none items-center gap-2">
          <MissionStatusBadge status={mission.participantStatus ?? mission.status} />
          {mission.effort && (
            <span className="inline-flex rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs font-semibold text-kinnso-ink">
              {t.effortBadgeLabel(mission.effort)}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2">
        <MissionCompensationSummary text={mission.compensation} />
      </div>

      {actionError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.briefHeading}</h2>
        <p className="mt-2 text-sm leading-relaxed text-kinnso-muted">{mission.summary}</p>
      </section>

      {mission.deliverables.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.deliverablesHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.deliverables.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.requirements.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.requirementsHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.requirements.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.dos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.dosHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.dos.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.donts.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.dontsHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.donts.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.keyMessages.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.keyMessagesHeading}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-kinnso-muted">
            {mission.keyMessages.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      )}

      {mission.referenceLinks.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.referenceLinksHeading}</h2>
          <ul className="mt-2 space-y-1">
            {mission.referenceLinks.map((link, index) => (
              <li key={index} className="truncate text-sm">
                <a href={link} className="text-kinnso-blue underline" target="_blank" rel="noreferrer">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lockedTier && (mission.cta === 'join' || mission.cta === 'apply') && (
        <div className="mt-6 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-kinnso-ink">{gating?.locked}</span>
            <TierBadge tier={lockedTier} />
          </div>
          <p className="text-sm text-kinnso-muted">{gating?.lockedHelp}</p>
        </div>
      )}

      {!lockedTier && mission.cta === 'join' && (
        <div className="mt-6">
          <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(onJoin)}>
            {t.join}
          </button>
        </div>
      )}

      {!lockedTier && mission.cta === 'apply' && (
        <div className="mt-6 grid gap-2">
          <label htmlFor="application-note" className="text-sm font-bold text-kinnso-ink">{t.applyNoteLabel}</label>
          <textarea
            id="application-note"
            className="k-input min-h-[96px]"
            placeholder={t.applyNotePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div>
            <button type="button" className="k-btn-primary text-sm" disabled={isPending} onClick={() => void runAction(() => onApply(note))}>
              {t.apply}
            </button>
          </div>
        </div>
      )}

      {mission.cta === 'awaiting' && (
        <div className="mt-6 rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
          <h2 className="font-bold text-kinnso-ink">{t.awaitingTitle}</h2>
          <p className="mt-1 text-sm text-kinnso-muted">{t.awaitingBody}</p>
        </div>
      )}

      {mission.cta === 'rejected' && (
        <div className="mt-6 rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
          <h2 className="font-bold text-kinnso-ink">{t.rejectedTitle}</h2>
          <p className="mt-1 text-sm text-kinnso-muted">{t.rejectedBody}</p>
        </div>
      )}

      {(mission.couponCode || mission.partnerLinks.length > 0) && (
        <section className="mt-8 grid gap-3">
          {mission.couponCode && (
            <div className="rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
              <h2 className="font-bold text-kinnso-ink">{t.couponHeading}</h2>
              <p className="mt-1 text-sm text-kinnso-muted">
                {t.couponCodeLabel}: <span className="font-mono font-semibold text-kinnso-ink">{mission.couponCode}</span>
              </p>
            </div>
          )}
          {mission.partnerLinks.length > 0 && (
            <div className="rounded-2xl border border-kinnso-cream2 bg-white p-4 shadow-kinnso">
              <h2 className="font-bold text-kinnso-ink">{t.partnerLinksHeading}</h2>
              <ul className="mt-2 space-y-1">
                {mission.partnerLinks.map((link) => (
                  <li key={link.id} className="truncate text-sm">
                    <a href={link.partnerUrl} className="text-kinnso-blue underline" target="_blank" rel="noreferrer">
                      {link.partnerUrl || t.openLink}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {mission.cta === 'active' && mission.missionType === 'receipt_cashback' && (
        <ReceiptSubmissions mission={mission} t={t} onSubmitReceipt={onSubmitReceipt} />
      )}

      {mission.cta === 'active' && mission.missionType !== 'receipt_cashback' && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-kinnso-ink">{t.milestonesHeading}</h2>
          {mission.milestones.length === 0 ? (
            <p className="mt-3 text-sm text-kinnso-muted">{t.notStarted}</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {mission.milestones.map((milestone) => (
                <TicketCard key={milestone.id} as="article" className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-bold text-kinnso-ink">{milestone.title}</h3>
                      {milestone.description && <p className="mt-1 text-sm text-kinnso-muted">{milestone.description}</p>}
                      {milestone.dueAt && <p className="mt-1 text-xs text-kinnso-muted">{t.dueLabel} {milestone.dueAt.slice(0, 10)}</p>}
                    </div>
                    <div className="flex flex-none flex-wrap gap-2">
                      {milestone.state === 'none' ? (
                        <span className="inline-flex rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs font-semibold text-kinnso-muted">
                          {t.notStarted}
                        </span>
                      ) : (
                        <>
                          <MissionStatusBadge status={milestone.state} />
                          {milestone.signal && <SocialSignalBadge status={milestone.signal} />}
                        </>
                      )}
                    </div>
                  </div>
                  <MilestoneSubmit milestone={milestone} t={t} onSubmitMilestone={onSubmitMilestone} />
                </TicketCard>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
