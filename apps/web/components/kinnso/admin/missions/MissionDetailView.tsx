'use client'
import { useState, useTransition } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MissionDetail } from '@/lib/admin/mission-review-queries'
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
type PolicyActionFn = (locale: Locale, missionId: string, policy: string) => Promise<ActionResult<{ id: string }>>

function AutoApprovePolicyToggle({
  t, locale, missionId, initialPolicy, policyAction,
}: {
  t: T
  locale: Locale
  missionId: string
  initialPolicy: string
  policyAction: PolicyActionFn
}) {
  const [policy, setPolicy] = useState(initialPolicy)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()

  const onChange = (next: string) => {
    const previous = policy
    setPolicy(next)
    setStatus('idle')
    startTransition(async () => {
      const res = await policyAction(locale, missionId, next)
      if (res.ok) {
        setStatus('saved')
      } else {
        // Roll back the optimistic value -- the RPC never wrote, so leaving the select on
        // `next` would show an ops user a policy that isn't actually in effect.
        setPolicy(previous)
        setStatus('error')
      }
    })
  }

  return (
    <div className="mb-4 flex items-center gap-2">
      <label htmlFor="auto-approve-policy" className="text-sm font-bold text-kinnso-ink">
        {t.autoApprovePolicyLabel}
      </label>
      <select
        id="auto-approve-policy"
        value={policy}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-kinnso-edge p-1 text-sm"
      >
        <option value="off">{t.autoApprovePolicyOff}</option>
        <option value="verified_signal_only">{t.autoApprovePolicyOn}</option>
      </select>
      {status === 'saved' && <span role="status" className="text-xs text-emerald-700">{t.autoApprovePolicySaved}</span>}
      {status === 'error' && <span role="status" className="text-xs text-red-600">{t.autoApprovePolicyError}</span>}
    </div>
  )
}

export function MissionDetailView({
  t, locale, detail, reviewAction, policyAction,
}: {
  t: T
  locale: Locale
  detail: MissionDetail
  reviewAction: ReviewActionFn
  policyAction: PolicyActionFn
}) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-kinnso-ink">{detail.mission.title}</h1>
      <p className="mb-4 text-sm text-kinnso-muted">
        {detail.mission.missionSource} · {detail.mission.missionType} · {detail.mission.status}
      </p>

      <AutoApprovePolicyToggle
        t={t}
        locale={locale}
        missionId={detail.mission.id}
        initialPolicy={detail.mission.autoApprovePolicy}
        policyAction={policyAction}
      />

      {detail.submissions.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">—</p>
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
            {detail.submissions.map((row) => (
              <SubmissionQueueRow key={row.submissionId} t={t} locale={locale} row={row} reviewAction={reviewAction} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default MissionDetailView
