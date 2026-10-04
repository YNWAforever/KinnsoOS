import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { PostFetcher } from './fetchers'
import { parseProofUrl } from './proof-url'
import { resolveConfidence } from './handle-match'

export interface VerifyDeps {
  db: SupabaseClient<Database>
  fetcher: PostFetcher
}

type VerifyStatus = 'fetching' | 'ready' | 'failed'

async function setJobStatus(
  db: SupabaseClient<Database>,
  jobId: string,
  status: VerifyStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db
    .from('mission_verification_jobs')
    .update({ status, updated_at: new Date().toISOString(), ...extra } as never)
    .eq('id', jobId)
  if (error) throw new Error(`setJobStatus(${status}) failed: ${error.message}`)
}

export async function verifySubmission(deps: VerifyDeps, jobId: string): Promise<void> {
  const { db, fetcher } = deps

  const { data: job, error: jobErr } = await db
    .from('mission_verification_jobs')
    .select('id, mission_milestone_submission_id, creator_id, platform, proof_url, status')
    .eq('id', jobId)
    .single()
  if (jobErr || !job) {
    console.error('[scan] verifySubmission: job not found', jobId, jobErr?.message)
    return
  }

  try {
    await setJobStatus(db, jobId, 'fetching', { started_at: new Date().toISOString() })

    // Resolve submission → participant → mission for snapshot FKs.
    const { data: submission } = await db
      .from('mission_milestone_submissions')
      .select('id, mission_participant_id')
      .eq('id', job.mission_milestone_submission_id)
      .single()
    const { data: participant } = await db
      .from('mission_participants')
      .select('id, mission_id, creator_id')
      .eq('id', submission?.mission_participant_id ?? '')
      .single()

    // FIX 3: Guard against missing submission or participant to avoid inserting
    // a dangling snapshot with null FKs that violates integrity constraints.
    if (!submission || !participant) {
      throw new Error('submission or participant not found')
    }

    const platform = (job.platform ?? '') as 'instagram' | 'threads' | 'youtube'
    const { data: handleRow } = await db
      .from('creator_social_handles')
      .select('handle')
      .eq('creator_id', job.creator_id)
      .eq('platform', platform)
      .maybeSingle()

    // FIX 2: When the proof URL can't be parsed (unsupported domain / malformed),
    // skip the snapshot insert (which would violate the platform CHECK constraint)
    // and mark the job ready with confidence_status='unavailable' for manual review.
    const parsed = job.proof_url ? parseProofUrl(job.proof_url) : null
    if (!parsed) {
      await setJobStatus(db, jobId, 'ready', {
        confidence_status: 'unavailable',
        completed_at: new Date().toISOString(),
      })
      console.info(`[scan] verification ${jobId} ready — confidence=unavailable (unsupported proof URL)`)
      return
    }

    const post = await fetcher.fetchPost(parsed.platform, parsed.id)
    // YouTube uses a hybrid match: resolve the creator's handle to a canonical
    // channel id so resolveConfidence can match on id first, handle second.
    const expectedId =
      parsed.platform === 'youtube' && handleRow?.handle
        ? await fetcher.resolveChannelId(handleRow.handle)
        : null
    const confidence = resolveConfidence(post, handleRow?.handle ?? null, expectedId)

    const { error: snapErr } = await db.from('mission_social_snapshots').insert({
      mission_id: participant.mission_id,
      mission_participant_id: submission.mission_participant_id,
      mission_milestone_submission_id: job.mission_milestone_submission_id,
      platform: parsed.platform,
      handle: handleRow?.handle ?? null,
      proof_url: job.proof_url,
      engagement_count: post?.engagementCount ?? null,
      confidence_status: confidence,
      fetched_at: new Date().toISOString(),
    } as never)
    if (snapErr) throw new Error(`snapshot insert failed: ${snapErr.message}`)

    await setJobStatus(db, jobId, 'ready', {
      confidence_status: confidence,
      completed_at: new Date().toISOString(),
    })
    console.info(`[scan] verification ${jobId} ready — confidence=${confidence}`)
  } catch (err) {
    const reason = (err as Error).message.replace(/\s+/g, ' ').slice(0, 200)
    console.error('[scan] verifySubmission failed', jobId, (err as Error).message)
    await setJobStatus(db, jobId, 'failed', { error: reason, completed_at: new Date().toISOString() }).catch(() => {})
  }
}
