import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { PostFetcher } from './fetchers'
import { parseProofUrl } from './proof-url'
import { verifySubmission } from './verify'
import { reserveLaunch, type HandlerResult } from './launch-reservation'

export interface VerifyServerDeps {
  db: SupabaseClient<Database>
  fetcher: PostFetcher
  userId: string
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

export async function handleVerifySubmission(
  deps: VerifyServerDeps,
  input: { submissionId: string },
): Promise<HandlerResult> {
  const { db, fetcher, userId } = deps
  const { submissionId } = input

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

  const proofUrl = (submission as { proof_urls?: string[] }).proof_urls?.[0] ?? null
  const parsed = proofUrl ? parseProofUrl(proofUrl) : null

  const reserved = await reserveLaunch(db, {
    kind: 'verification', creatorId: ownerId, submissionId, platform: parsed?.platform,
  })
  if ('status' in reserved) return reserved
  const { jobId } = reserved
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
  const { db, fetcher, userId } = deps
  const { jobId } = input

  const reserved = await reserveLaunch(db, { kind: 'verification', creatorId: userId, jobId })
  if ('status' in reserved) return reserved

  verifySubmission({ db, fetcher }, jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled verification retry error for job ${jobId}`, err)
  })

  return { status: 202, body: { jobId, retrying: true } }
}
