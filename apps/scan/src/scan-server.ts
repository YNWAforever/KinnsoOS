import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { canRetry, type JobRecord } from './policy'
import type { HandlerResult } from './verify-server'

export interface ScanRetryDeps {
  db: SupabaseClient<Database>
  userId: string
  /**
   * Launches the pipeline for a job id. Injected rather than importing runScan
   * directly so the retry contract can be exercised without a real scan.
   */
  run: (jobId: string) => Promise<void>
}

/**
 * Retries a failed (or restart-stranded) scan job.
 *
 * Lives here rather than inline in server.ts so the concurrency contract below
 * is directly testable — server.ts is a bootstrap module with side effects at
 * import time.
 */
export async function handleScanRetry(
  deps: ScanRetryDeps,
  input: { jobId: string },
): Promise<HandlerResult> {
  const { db, userId, run } = deps
  const { jobId } = input
  const now = Date.now()

  // Use maybeSingle() so a genuinely non-existent jobId yields { data: null,
  // error: null } (rather than .single()'s PGRST116 error). This lets control
  // reach canRetry(null, …) → 404 "job not found" instead of leaking a 500.
  const { data: job, error: jobErr } = await db
    .from('creator_scan_jobs')
    .select('id, creator_id, status, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle()

  if (jobErr) return { status: 500, body: { error: 'internal error' } }

  const record: JobRecord | null = job
    ? {
        id: job.id,
        creator_id: job.creator_id,
        status: job.status as JobRecord['status'],
        created_at: job.created_at,
        updated_at: job.updated_at,
      }
    : null

  const check = canRetry(record, userId, now)

  if (!record || !check.allowed) {
    const status = check.httpStatus
    // canRetry never returns 401 — owner mismatch maps to 404 (job not found),
    // which both avoids leaking existence and stops the web client from wrongly
    // prompting re-login. Genuine bad/missing tokens are handled by the caller's
    // getVerifiedUser → 401 guard.
    const messages: Record<number, string> = {
      404: 'job not found',
      409: 'job is not in failed status',
    }
    return { status, body: { error: messages[status] } }
  }

  // Compare-and-swap on the exact row revision that was just validated. An
  // unconditional `.eq('id', …)` lets two concurrent retries both pass the
  // canRetry check and both launch the pipeline — double paid-API spend,
  // duplicate snapshots, interleaved status writes. The set_updated_at trigger
  // guarantees every write moves `updated_at`, so only the first reset matches.
  const { data: reset, error: resetErr } = await db
    .from('creator_scan_jobs')
    .update({
      status: 'queued',
      error: null as never,
      completed_at: null as never,
      updated_at: new Date(now).toISOString(),
    })
    .eq('id', jobId)
    .eq('status', record.status)
    .eq('updated_at', record.updated_at)
    .select('id')

  if (resetErr) {
    // A unique-violation (23505) means another active job already exists for this
    // creator (the partial unique index) — surface it as a 429, not a 500.
    if (resetErr.code === '23505') {
      return { status: 429, body: { error: 'rate limited', reason: 'active_job_exists' } }
    }
    console.error('[scan] retry reset failed', jobId, resetErr.message)
    return { status: 500, body: { error: 'internal error' } }
  }

  // Zero rows updated: a concurrent retry won the race and already re-queued it.
  if (!reset || reset.length === 0) {
    return { status: 409, body: { error: 'job is not in failed status' } }
  }

  run(jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled pipeline error on retry for job ${jobId}`, err)
  })

  return { status: 202, body: { jobId, retrying: true } }
}
