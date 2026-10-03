import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { ReviewQueueRow } from '@/lib/admin/mission-review-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { SubmissionReviewAction } from '@/lib/missions/types'
import { SubmissionQueueRow } from '@/components/kinnso/admin/missions/SubmissionQueueRow'

type T = Messages['missionsOps']
type ReviewActionFn = (
  locale: Locale,
  submissionId: string,
  action: SubmissionReviewAction,
  reasonCategory: string | null,
  reasonText: string | null,
  missionId: string | null,
) => Promise<ActionResult<{ id: string }>>

/**
 * Ops review queue: every submission awaiting a decision, across all missions. Each row is
 * a SubmissionQueueRow (shared with MissionDetailView) which already reads its own
 * `row.missionId` for the review action, so this table never needs a page-level mission id.
 */
export function MissionReviewQueueView({
  t, locale, rows, reviewAction,
}: {
  t: T
  locale: Locale
  rows: ReviewQueueRow[]
  reviewAction: ReviewActionFn
}) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-kinnso-ink">{t.queueTitle}</h1>
      <p className="mb-4 text-sm text-kinnso-muted">{t.queueSubtitle}</p>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">{t.queueEmpty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-kinnso-muted">
            <tr className="border-b border-kinnso-edge">
              <th className="py-2 font-bold">{t.colMission}</th>
              <th className="py-2 font-bold">{t.colCreator}</th>
              <th className="py-2 font-bold">{t.colVerification}</th>
              <th className="py-2 font-bold">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SubmissionQueueRow key={row.submissionId} t={t} locale={locale} row={row} reviewAction={reviewAction} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default MissionReviewQueueView
