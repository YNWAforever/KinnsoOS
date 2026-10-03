import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { JOB_STALE_AFTER_MS } from './policy'

/**
 * Marks jobs stranded by a restart as failed.
 *
 * There is no durable queue: `runScan`/`verifySubmission` are launched in-process
 * after the HTTP 202, so a redeploy, OOM kill or crash leaves whatever rows were
 * mid-flight sitting in a non-terminal status with nothing left to advance them.
 * The runtime staleness rules in policy.ts stop those rows from locking a
 * creator out, but only this sweep actually retires them — otherwise every
 * restart adds another permanent zombie to the table, and the owner's UI shows
 * a scan that spins forever.
 *
 * Idempotent and safe to run concurrently with live jobs: the `updated_at`
 * cutoff is derived from JOB_STALE_AFTER_MS, which is set well above the
 * worst-case bounded runtime of a single job.
 *
 * @returns the number of rows retired, for logging.
 */
export async function sweepExpiredJobs(
  db: SupabaseClient<Database>,
  now: number = Date.now()
): Promise<number> {
  const cutoff = new Date(now - JOB_STALE_AFTER_MS).toISOString()
  const timestamp = new Date(now).toISOString()
  let swept = 0

  const { data: scanRows, error: scanErr } = await db
    .from('creator_scan_jobs')
    .update({
      status: 'failed',
      // User-facing (owner-readable via RLS) and actionable: retry is the fix,
      // and canRetry() now accepts this row.
      error: 'The scan was interrupted before it finished. Please retry.',
      completed_at: timestamp,
      updated_at: timestamp,
    })
    .in('status', ['queued', 'fetching', 'analyzing'])
    .lt('updated_at', cutoff)
    .select('id')

  if (scanErr) console.error('[scan] stale scan-job sweep failed', scanErr.message)
  else swept += scanRows?.length ?? 0

  const { data: verifyRows, error: verifyErr } = await db
    .from('mission_verification_jobs')
    .update({
      status: 'failed',
      error: 'Verification was interrupted before it finished. Please retry.',
      completed_at: timestamp,
      updated_at: timestamp,
    } as never)
    .in('status', ['queued', 'fetching'])
    .lt('updated_at', cutoff)
    .select('id')

  if (verifyErr) console.error('[scan] stale verification-job sweep failed', verifyErr.message)
  else swept += verifyRows?.length ?? 0

  return swept
}
