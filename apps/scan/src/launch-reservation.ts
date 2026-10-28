import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type HandlerResult = { status: number; body: Record<string, unknown> }

type LaunchRequest = {
  kind: 'scan' | 'verification'
  creatorId: string
  jobId?: string
  submissionId?: string
  platform?: string | null
}

/**
 * The only launch-budget boundary for both workers. PostgreSQL serializes owner
 * reservations and commits the job mutation with its trailing-24h charge.
 * Never fall back to job counts or a process-local ledger on RPC failure.
 */
export async function reserveLaunch(
  db: SupabaseClient<Database>,
  request: LaunchRequest,
): Promise<{ jobId: string } | HandlerResult> {
  const { data, error } = await db.rpc('reserve_worker_launch', {
    p_kind: request.kind,
    p_creator_id: request.creatorId,
    p_job_id: request.jobId,
    p_submission_id: request.submissionId,
    p_platform: request.platform ?? undefined,
  }).single()

  if (error || !data) {
    console.error('[scan] launch reservation failed', error?.message)
    return { status: 500, body: { error: 'internal error' } }
  }
  if (!data.reason && data.job_id) return { jobId: data.job_id }

  switch (data.reason) {
    case 'creator_not_found':
      return { status: 404, body: { error: 'creator not found' } }
    case 'job_not_found':
      return { status: 404, body: { error: 'job not found' } }
    case 'submission_not_found':
      return { status: 404, body: { error: 'submission not found' } }
    case 'job_not_retryable':
      return { status: 409, body: { error: 'job is not in failed status' } }
    case 'no_social_handles':
      return { status: 400, body: { error: 'no social handles found for this creator' } }
    case 'verification_already_in_progress':
      return { status: 429, body: { error: 'verification already in progress' } }
    case 'active_job_exists':
    case 'too_many_active_jobs':
    case 'daily_quota_exceeded':
      return { status: 429, body: { error: 'rate limited', reason: data.reason } }
    default:
      // Unknown/malformed responses must never authorize paid work.
      return { status: 500, body: { error: 'internal error' } }
  }
}
