import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'
import type { SubmissionReviewAction } from '@/lib/missions/types'

const reviewQueuePath = (locale: Locale) => `/${locale}/admin/missions/review`
const missionDetailPath = (locale: Locale, missionId: string) => `/${locale}/admin/missions/${missionId}`

/** DB raise-message → friendly copy. admin_review_submission raises these bare messages. */
const FRIENDLY: Record<string, string> = {
  forbidden: 'Active ops access is required.',
  bad_action: 'Invalid review action.',
  reason_required: 'A reason category is required for this action.',
  bad_reason_category: 'Invalid reason category.',
  not_found: 'That submission no longer exists. Refresh and try again.',
  stale_status: 'This submission has already been reviewed. Refresh and try again.',
  bad_policy: 'Invalid auto-approve policy.',
  insufficient_budget: 'The merchant budget cannot cover this fee — fund it before approving.',
  currency_mismatch: 'Budget currency does not match this mission.',
}

const mapError = (message: string, fallback: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => message.includes(k))
  return key ? FRIENDLY[key] : fallback
}

/**
 * Ops review decision on a mission milestone submission, via the audited
 * admin_review_submission RPC. `reasonCategory` is pre-validated here (present whenever
 * `action !== 'approve'`) as defense-in-depth/better UX -- the RPC enforces the same rule
 * server-side with its own `reason_required` raise, so this check can never be bypassed
 * by skipping the action layer.
 *
 * The review-queue path is always revalidated. When `missionId` is supplied (the caller
 * knows it, e.g. from the mission detail page), the mission detail page is revalidated
 * too, so approving/rejecting from either surface keeps both caches fresh.
 */
export async function reviewSubmissionOpsAction(
  locale: Locale,
  submissionId: string,
  action: SubmissionReviewAction,
  reasonCategory: string | null,
  reasonText: string | null,
  missionId: string | null = null,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  if (action !== 'approve' && !reasonCategory?.trim()) return formError(FRIENDLY.reason_required)

  const { error } = await supabase.rpc('admin_review_submission', {
    p_submission_id: submissionId,
    p_action: action,
    p_reason_category: reasonCategory,
    p_reason_text: reasonText,
  })
  if (error) {
    console.error('[admin:missions] reviewSubmissionOpsAction failed', error)
    return formError(mapError(error.message, 'Submission could not be reviewed'))
  }
  revalidatePath(reviewQueuePath(locale))
  if (missionId) revalidatePath(missionDetailPath(locale, missionId))
  return { ok: true, id: submissionId }
}

/**
 * Ops-only setter for a mission's auto_approve_policy, via the audited
 * admin_set_mission_auto_approve_policy RPC. Revalidates only the mission detail page --
 * this never shows up in the review queue itself.
 */
export async function setMissionAutoApprovePolicyAction(
  locale: Locale,
  missionId: string,
  policy: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase.rpc('admin_set_mission_auto_approve_policy', {
    p_mission_id: missionId,
    p_policy: policy,
  })
  if (error) {
    console.error('[admin:missions] setMissionAutoApprovePolicyAction failed', error)
    return formError(mapError(error.message, 'Could not update the policy'))
  }
  revalidatePath(missionDetailPath(locale, missionId))
  return { ok: true, id: missionId }
}
