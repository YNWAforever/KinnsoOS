import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { PostFetcher } from './fetchers'
import { parseProofUrl } from './proof-url'
import { verifySubmission } from './verify'
import {
  isJobActive,
  isJobExpired,
  verificationRateLimitDecision,
  type RunLedger,
} from './policy'

export interface VerifyServerDeps {
  db: SupabaseClient<Database>
  fetcher: PostFetcher
  userId: string
  /**
   * Per-creator run ledger backing the daily cap. Required (not optional) so a
   * new call site cannot silently opt out of throttling — every path that can
   * spend money must go through it.
   */
  ledger: RunLedger
}

export type HandlerResult = {
  status: number
  body: Record<string, unknown>
}

/** Non-terminal statuses in mission_verification_jobs (it has no 'analyzing'). */
const ACTIVE_VERIFICATION_STATUSES = ['queued', 'fetching']

/**
 * Counts the creator's live verification jobs.
 *
 * Rows stranded by a restart are excluded (see JOB_STALE_AFTER_MS): a zombie
 * must not permanently consume one of the creator's concurrency slots.
 *
 * @returns the count, or null if the query failed (caller maps that to a 500).
 */
async function countActiveVerifications(
  db: SupabaseClient<Database>,
  creatorId: string,
  now: number,
): Promise<number | null> {
  const { data, error } = await db
    .from('mission_verification_jobs')
    .select('id, status, updated_at')
    .eq('creator_id', creatorId)
    .in('status', ACTIVE_VERIFICATION_STATUSES)

  if (error) {
    console.error('[scan] failed to count active verification jobs', error.message)
    return null
  }
  const rows = (data ?? []) as unknown as Array<{ status: string; updated_at: string }>
  return rows.filter((j) => isJobActive(j, now)).length
}

/**
 * True when userId is an active kinnso_ops_members row. Fails CLOSED (returns false) on a
 * query error -- an ops-membership check that can't complete must never be treated as passing.
 */
async function isActiveOpsCaller(db: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('kinnso_ops_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) {
    console.error('[scan] failed to check ops membership', error.message)
    return false
  }
  return !!data
}

/**
 * Applies the per-creator verification limits.
 *
 * Both the submit and the retry path go through this: a verification run costs
 * up to two upstream calls × four attempts of real money, and retry is the
 * cheaper attack — it reuses one row, so nothing derived from row counts alone
 * would ever throttle it.
 *
 * @returns a 429 HandlerResult when limited, or null when the run may proceed.
 */
async function checkVerificationLimits(
  deps: VerifyServerDeps,
  now: number,
): Promise<HandlerResult | null> {
  const { db, userId, ledger } = deps

  const activeCount = await countActiveVerifications(db, userId, now)
  if (activeCount === null) return { status: 500, body: { error: 'internal error' } }

  const decision = verificationRateLimitDecision(activeCount, ledger.count(userId, now))
  if (decision.limited) {
    return { status: 429, body: { error: 'rate limited', reason: decision.reason } }
  }
  return null
}

export async function handleVerifySubmission(
  deps: VerifyServerDeps,
  input: { submissionId: string },
): Promise<HandlerResult> {
  const { db, fetcher, userId, ledger } = deps
  const { submissionId } = input
  const now = Date.now()

  const { data: submission, error: subErr } = await db
    .from('mission_milestone_submissions')
    .select('id, proof_urls, mission_participant_id, mission_participants!inner(creator_id)')
    .eq('id', submissionId)
    .maybeSingle()

  if (subErr) return { status: 500, body: { error: 'internal error' } }

  const ownerId = (submission as { mission_participants?: { creator_id?: string } } | null)
    ?.mission_participants?.creator_id
  if (!submission || !ownerId) {
    return { status: 404, body: { error: 'submission not found' } }
  }
  // An ops caller may trigger re-verification on a submission they don't own -- checked only
  // when the fast owner-match path fails, so a creator's own request never pays this extra
  // round trip.
  if (ownerId !== userId && !(await isActiveOpsCaller(db, userId))) {
    return { status: 404, body: { error: 'submission not found' } }
  }

  // Throttle BEFORE inserting: a rejected run should leave no row behind. Scoped to the
  // submission's OWNER, never the caller -- an ops-initiated re-run must spend the SAME
  // creator-owned quota a creator-initiated one would, not some separate (and likely
  // nonexistent, since ops members aren't creators) bucket keyed by the ops member's own id.
  const limited = await checkVerificationLimits({ ...deps, userId: ownerId }, now)
  if (limited) return limited

  const proofUrl = (submission as { proof_urls?: string[] }).proof_urls?.[0] ?? null
  const parsed = proofUrl ? parseProofUrl(proofUrl) : null

  const { data: job, error: insertErr } = await db
    .from('mission_verification_jobs')
    .insert({
      mission_milestone_submission_id: submissionId,
      creator_id: ownerId,
      platform: parsed?.platform ?? null,
      proof_url: proofUrl,
      status: 'queued',
    } as never)
    .select('id')
    .single()

  if (insertErr || !job) {
    if (insertErr?.code === '23505') {
      return { status: 429, body: { error: 'verification already in progress' } }
    }
    console.error('[scan] failed to insert verification job', insertErr?.message)
    return { status: 500, body: { error: 'internal error' } }
  }

  const jobId = job.id
  ledger.record(ownerId, now)
  // Fire-and-forget
  verifySubmission({ db, fetcher }, jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled verification error for job ${jobId}`, err)
  })

  return { status: 202, body: { jobId } }
}

export async function handleVerifyRetry(
  deps: VerifyServerDeps,
  input: { jobId: string },
): Promise<HandlerResult> {
  const { db, fetcher, userId, ledger } = deps
  const { jobId } = input
  const now = Date.now()

  const { data: job, error: jobErr } = await db
    .from('mission_verification_jobs')
    .select('id, creator_id, status, updated_at')
    .eq('id', jobId)
    .maybeSingle()

  if (jobErr) return { status: 500, body: { error: 'internal error' } }
  if (!job || job.creator_id !== userId) {
    return { status: 404, body: { error: 'job not found' } }
  }
  // A job stranded by a restart never reaches 'failed' on its own, so accept it
  // here too — otherwise the submission's active-job unique index blocks
  // re-verification forever.
  const liveness = { status: job.status, updated_at: (job as { updated_at: string }).updated_at }
  if (job.status !== 'failed' && !isJobExpired(liveness, now)) {
    return { status: 409, body: { error: 'job is not in failed status' } }
  }

  const limited = await checkVerificationLimits(deps, now)
  if (limited) return limited

  // Compare-and-swap on the exact row revision that was just validated. An
  // unconditional `.eq('id', …)` lets two concurrent retries both pass the
  // status check above and both launch the pipeline — double spend, duplicate
  // snapshots, interleaved status writes. Every write to this table bumps
  // `updated_at`, so only the first reset can match.
  const { data: reset, error: resetErr } = await db
    .from('mission_verification_jobs')
    .update({ status: 'queued', error: null, completed_at: null, updated_at: new Date(now).toISOString() } as never)
    .eq('id', jobId)
    .eq('status', job.status)
    .eq('updated_at', liveness.updated_at)
    .select('id')

  if (resetErr) {
    if (resetErr.code === '23505') {
      return { status: 429, body: { error: 'verification already in progress' } }
    }
    console.error('[scan] verification retry reset failed', jobId, resetErr.message)
    return { status: 500, body: { error: 'internal error' } }
  }

  // Zero rows updated: another retry won the race and already re-queued the job.
  if (!reset || reset.length === 0) {
    return { status: 409, body: { error: 'job is not in failed status' } }
  }

  ledger.record(userId, now)
  verifySubmission({ db, fetcher }, jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled verification retry error for job ${jobId}`, err)
  })

  return { status: 202, body: { jobId, retrying: true } }
}
