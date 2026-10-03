'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { ReviewQueueRow } from '@/lib/admin/mission-review-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { SubmissionReviewAction } from '@/lib/missions/types'
import { ConfidenceBadge } from '@/components/kinnso/admin/missions/badges'
import { startVerification } from '@/lib/missions/verify-client'

type T = Messages['missionsOps']
type ReviewActionFn = (
  locale: Locale,
  submissionId: string,
  action: SubmissionReviewAction,
  reasonCategory: string | null,
  reasonText: string | null,
  missionId: string | null,
) => Promise<ActionResult<{ id: string }>>

// R11.0's original taxonomy -- used by every mission type except receipt_cashback.
const STANDARD_REASON_OPTIONS = (t: T): Array<{ value: string; label: string }> => [
  { value: 'format', label: t.reasonFormat },
  { value: 'key_message', label: t.reasonKeyMessage },
  { value: 'compliance', label: t.reasonCompliance },
  { value: 'quality', label: t.reasonQuality },
  { value: 'other', label: t.reasonOther },
]

// R12.2 Task 4's receipt-specific taxonomy -- used only for receipt_cashback submissions.
// Values must exactly match admin_review_submission's / the mission_review_events
// trigger's own receipt_cashback branch (supabase/migrations/20260822090300_r12_2_receipt_reason_taxonomy.sql),
// so the UI never offers an option the DB would reject.
const RECEIPT_REASON_OPTIONS = (t: T): Array<{ value: string; label: string }> => [
  { value: 'unreadable', label: t.reasonUnreadable },
  { value: 'wrong_venue', label: t.reasonWrongVenue },
  { value: 'duplicate', label: t.reasonDuplicate },
  { value: 'amount_unclear', label: t.reasonAmountUnclear },
  { value: 'other', label: t.reasonOther },
]

/** Mission-type-aware reason-category options, matching the DB's own enforcement exactly
 * (see RECEIPT_REASON_OPTIONS above). Any mission type other than receipt_cashback --
 * including null/unknown, which defaults to the original taxonomy -- keeps the R11.0 set. */
const reasonOptionsFor = (missionType: string | null, t: T): Array<{ value: string; label: string }> =>
  missionType === 'receipt_cashback' ? RECEIPT_REASON_OPTIONS(t) : STANDARD_REASON_OPTIONS(t)

// Only reject/request_revision open the reason-capture modal; approve fires immediately.
type PendingKind = 'reject' | 'request_revision' | null

/** Fires the scan worker's existing POST /verify-submission with the ops caller's OWN
 * session token. No polling/live-update here by design: this only re-queues the job, the
 * row's badge reflects the new result on the next page load. */
function RerunVerificationButton({ submissionId, t }: { submissionId: string; t: T }) {
  const [state, setState] = useState<'idle' | 'pending' | 'queued' | 'error'>('idle')
  // Approving/rejecting this same row while a rerun is in flight drops the row out of
  // getReviewQueue()'s result set on the next revalidation, unmounting this component before
  // startVerification's promise resolves -- guard the late setState against that.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  const rerun = () => {
    setState('pending')
    void startVerification(submissionId).then((res) => {
      if (mountedRef.current) setState('jobId' in res ? 'queued' : 'error')
    })
  }
  if (state === 'queued') return <p role="status" className="mt-1 text-xs text-kinnso-muted">{t.rerunQueued}</p>
  if (state === 'error') return <p role="status" className="mt-1 text-xs text-red-600">{t.rerunFailed}</p>
  return (
    <button
      type="button"
      onClick={rerun}
      disabled={state === 'pending'}
      className="mt-1 rounded-md border border-kinnso-edge px-2 py-0.5 text-xs font-bold text-kinnso-ink disabled:opacity-50"
    >
      {t.actRerunVerification}
    </button>
  )
}

/**
 * One row of the submission review queue -- extracted from MissionDetailView so it can be
 * shared with the queue page (Task 6). Fully self-contained: owns its own reject/request-
 * revision confirm modal and its own transition, so it drops in unmodified whether the
 * table around it lists one mission's submissions or every mission's.
 *
 * Always reads `row.missionId` for the 6th `reviewAction` arg (never a page-level prop) --
 * on the queue page different rows belong to different missions, and on the detail page
 * every row's `missionId` already equals that page's one mission (getMissionDetail filters
 * getReviewQueue()'s rows down to it), so this is behavior-preserving there too.
 */
export function SubmissionQueueRow({
  t, locale, row, reviewAction,
}: {
  t: T
  locale: Locale
  row: ReviewQueueRow
  reviewAction: ReviewActionFn
}) {
  const [pendingKind, setPendingKind] = useState<PendingKind>(null)
  const [reasonCategory, setReasonCategory] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const selectRef = useRef<HTMLSelectElement>(null)

  // Focus the reason-category select when the confirm dialog opens.
  useEffect(() => { if (pendingKind) selectRef.current?.focus() }, [pendingKind])

  const open = (kind: 'reject' | 'request_revision') => {
    setPendingKind(kind)
    setReasonCategory('')
    setReasonText('')
    setError(null)
  }
  const cancel = () => {
    setPendingKind(null)
    setReasonCategory('')
    setReasonText('')
    setError(null)
  }

  const approve = () => {
    setError(null)
    startTransition(async () => {
      const res = await reviewAction(locale, row.submissionId, 'approve', null, null, row.missionId)
      if (!res.ok) setError(res.errors.form?.[0] ?? null)
    })
  }

  const confirm = () => {
    if (!pendingKind) return
    if (!reasonCategory) {
      setError(t.reasonCategoryPlaceholder)
      return
    }
    startTransition(async () => {
      const res = await reviewAction(
        locale,
        row.submissionId,
        pendingKind,
        reasonCategory,
        reasonText.trim() || null,
        row.missionId,
      )
      if (res.ok) cancel()
      else setError(res.errors.form?.[0] ?? null)
    })
  }

  return (
    <>
      <tr className="border-b border-kinnso-edge/60 align-top">
        <td className="py-2 font-bold text-kinnso-ink">{row.missionTitle}</td>
        <td className="py-2 text-kinnso-muted">{row.creatorId ? row.creatorId.slice(0, 8) : '—'}</td>
        <td className="py-2">
          <ConfidenceBadge status={row.confidenceStatus} t={t} />
          {row.status === 'submitted' && row.confidenceStatus !== 'verified_signal' && (
            <RerunVerificationButton submissionId={row.submissionId} t={t} />
          )}
        </td>
        <td className="py-2">
          {row.status === 'revision_requested' ? (
            <span className="rounded-full bg-kinnso-edge/40 px-2 py-1 text-xs font-bold text-kinnso-muted">
              {t.waitingOnCreator}
            </span>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={approve}
                disabled={isPending}
                className="rounded-md bg-kinnso-orange px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
              >
                {t.actApprove}
              </button>
              <button
                type="button"
                onClick={() => open('reject')}
                disabled={isPending}
                className="rounded-md border border-kinnso-edge px-2 py-1 text-xs font-bold text-kinnso-ink disabled:opacity-50"
              >
                {t.actReject}
              </button>
              <button
                type="button"
                onClick={() => open('request_revision')}
                disabled={isPending}
                className="rounded-md border border-kinnso-edge px-2 py-1 text-xs font-bold text-kinnso-ink disabled:opacity-50"
              >
                {t.actRequestRevision}
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* Reject / request-revision confirm panel -- mirrors CreatorPayoutsView's money-action modal. */}
      {pendingKind && (
        <tr>
          <td colSpan={4} className="p-0">
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="review-confirm-title"
              onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}
            >
              <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                <p id="review-confirm-title" className="mb-3 text-sm font-bold text-kinnso-ink">
                  {pendingKind === 'reject' ? t.actReject : t.actRequestRevision}
                </p>
                <p className="mb-2 text-xs text-kinnso-muted">{row.missionTitle}</p>
                <select
                  ref={selectRef}
                  value={reasonCategory}
                  onChange={(e) => setReasonCategory(e.target.value)}
                  aria-label={t.reasonCategoryPlaceholder}
                  className="mb-2 w-full rounded-md border border-kinnso-edge p-2 text-sm"
                >
                  <option value="">{t.reasonCategoryPlaceholder}</option>
                  {reasonOptionsFor(row.missionType, t).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  className="mb-2 w-full rounded-md border border-kinnso-edge p-2 text-sm"
                  rows={3}
                />
                {error && <p className="mb-2 text-xs font-bold text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={isPending}
                    className="rounded-md border border-kinnso-edge px-3 py-1 text-sm font-bold text-kinnso-ink"
                  >
                    {t.actCancel}
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={isPending || !reasonCategory}
                    className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {t.actApply}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default SubmissionQueueRow
