import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['missionsOps']

const CONFIDENCE_STYLE: Record<string, string> = {
  verified_signal: 'bg-emerald-100 text-emerald-800',
  needs_review: 'bg-amber-100 text-amber-800',
}

const CONFIDENCE_LABEL = (t: T): Record<string, string> => ({
  verified_signal: t.confidenceVerified,
  needs_review: t.confidenceNeedsReview,
})

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold'

/** status is mission_verification_jobs.confidence_status -- 'verified_signal' | 'needs_review' |
 * 'unavailable' | null (no verification job has run yet). 'unavailable' and null share one
 * label/style: both mean "ops cannot rely on this without a closer look." */
export function ConfidenceBadge({ status, t }: { status: string | null; t: T }) {
  const key = status ?? ''
  return (
    <span className={`${pill} ${CONFIDENCE_STYLE[key] ?? 'bg-slate-100 text-slate-600'}`}>
      {CONFIDENCE_LABEL(t)[key] ?? t.confidenceUnavailable}
    </span>
  )
}
