import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import {
  normalize,
  buildPrompt,
  parseDna,
  minViable,
  type PlatformFetcher,
  type LlmClient,
  type Platform,
  type NormalizedSignals,
} from '@kinnso/scan'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'fetching' | 'analyzing' | 'ready' | 'failed'
export type PlatformProgress = 'pending' | 'ok' | 'failed'

export interface ScanDeps {
  db: SupabaseClient<Database>
  fetcher: PlatformFetcher
  llm: LlmClient
  model: string
}

// ---------------------------------------------------------------------------
// DB helpers (thin wrappers so callers don't scatter `.from()` calls)
// ---------------------------------------------------------------------------

async function setJobStatus(
  db: SupabaseClient<Database>,
  jobId: string,
  status: JobStatus,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await db
    .from('creator_scan_jobs')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', jobId)
  if (error) throw new Error(`setJobStatus(${status}) failed: ${error.message}`)
}

async function setJobProgress(
  db: SupabaseClient<Database>,
  jobId: string,
  platforms: Record<string, PlatformProgress>
): Promise<void> {
  const { error } = await db
    .from('creator_scan_jobs')
    .update({ progress: { platforms }, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  if (error) throw new Error(`setJobProgress failed: ${error.message}`)
}

async function upsertDna(
  db: SupabaseClient<Database>,
  creatorId: string,
  jobId: string,
  aiDraft: unknown,
  source: unknown,
  model: string,
  thin: boolean,
  platforms: Record<string, PlatformProgress>
): Promise<void> {
  // MUST NOT touch `final` — preserved across re-scans.
  // Uses raw SQL via rpc or a carefully scoped upsert.
  const { error } = await db.from('creator_dna').upsert(
    {
      creator_id: creatorId,
      ai_draft: aiDraft as never,
      source: source as never,
      scan_job_id: jobId,
      model,
      draft_ready_at: new Date().toISOString(),
      status: 'draft',
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'creator_id',
      // ignoreDuplicates: false → performs update on conflict
    }
  )
  // Supabase upsert updates ALL provided columns on conflict — `final` is not in the upsert
  // object, so it will NOT be overwritten. `status` is reset to 'draft' intentionally.
  if (error) throw new Error(`upsertDna failed: ${error.message}`)

  // Update thin marker on the job row — PRESERVE the accumulated per-platform
  // statuses by writing them back alongside the thin flag.
  const { error: e2 } = await db
    .from('creator_scan_jobs')
    .update({
      progress: { platforms, thin } as never,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
  if (e2) throw new Error(`setThin failed: ${e2.message}`)
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the full scan pipeline for the given job.
 * Always called in the background after the HTTP 202 has been returned.
 *
 * @param deps - Injected DB client, fetcher, and LLM (allows fake injection in tests).
 * @param jobId - The `creator_scan_jobs.id` to operate on.
 */
export async function runScan(deps: ScanDeps, jobId: string): Promise<void> {
  const { db, fetcher, llm, model } = deps

  // ── 1. Load the job to get creator_id + handles ───────────────────────────
  const { data: job, error: jobErr } = await db
    .from('creator_scan_jobs')
    .select('id, creator_id, status')
    .eq('id', jobId)
    .single()
  if (jobErr || !job) {
    console.error('[scan] runScan: job not found', jobId, jobErr?.message)
    return
  }

  const creatorId = job.creator_id

  const { data: handles, error: handlesErr } = await db
    .from('creator_social_handles')
    .select('platform, handle')
    .eq('creator_id', creatorId)
  if (handlesErr) {
    await setJobStatus(db, jobId, 'failed', { error: 'Could not load handles', completed_at: new Date().toISOString() })
    return
  }

  // ── 2. Fetching phase ──────────────────────────────────────────────────────
  await setJobStatus(db, jobId, 'fetching', { started_at: new Date().toISOString() })

  const progress: Record<string, PlatformProgress> = {}
  for (const h of handles ?? []) {
    progress[h.platform] = 'pending'
  }
  await setJobProgress(db, jobId, progress)

  const signals: NormalizedSignals[] = []
  const rawSnapshots: Record<string, unknown> = {}

  for (const h of handles ?? []) {
    const platform = h.platform as Platform
    try {
      const raw = await fetcher.fetch(platform, h.handle)
      rawSnapshots[platform] = raw
      const sig = normalize(platform, h.handle, raw)
      signals.push(sig)
      progress[platform] = 'ok'
    } catch (err) {
      console.warn(`[scan] platform fetch failed: ${platform}`, (err as Error).message)
      progress[platform] = 'failed'
    }
    // Update progress after each platform
    await setJobProgress(db, jobId, progress)
  }

  // ── 3. Zero-data guard ────────────────────────────────────────────────────
  if (signals.length === 0) {
    await setJobStatus(db, jobId, 'failed', {
      error: 'All platform fetches failed — no data to analyze.',
      completed_at: new Date().toISOString(),
    })
    return
  }

  // ── 4. Analyzing phase ─────────────────────────────────────────────────────
  await setJobStatus(db, jobId, 'analyzing')

  const messages = buildPrompt(signals)

  let llmText: string
  try {
    llmText = await llm.complete(messages)
  } catch (firstErr) {
    console.warn('[scan] LLM first attempt failed, retrying once…', (firstErr as Error).message)
    try {
      llmText = await llm.complete(messages)
    } catch (secondErr) {
      // Surface a capped, single-line reason into job.error (client-readable via
      // owner RLS) so a failure is diagnosable in one shot — e.g. "fetch failed"
      // or "LLM endpoint returned HTTP 404: …". The API key lives only in the
      // Authorization header, never in these provider error bodies, so this is
      // safe; the full untruncated error still goes to the server logs.
      const reason = (secondErr as Error).message.replace(/\s+/g, ' ').slice(0, 200)
      console.error('[scan] LLM failed after retry', jobId, (secondErr as Error).message)
      await setJobStatus(db, jobId, 'failed', {
        error: `AI analysis failed: ${reason}`,
        completed_at: new Date().toISOString(),
      })
      return
    }
  }

  // ── 5. Parse + min-viable check ───────────────────────────────────────────
  let parsed: ReturnType<typeof parseDna>
  try {
    parsed = parseDna(llmText)
  } catch (parseErr) {
    // parseDna embeds a slice of raw LLM output in its message; keep that detail
    // in server logs only, and store a generic user-safe message in job.error
    // (client-readable via owner RLS).
    console.error('[scan] DNA parse failed', jobId, (parseErr as Error).message)
    await setJobStatus(db, jobId, 'failed', {
      error: 'AI analysis could not be parsed, please retry.',
      completed_at: new Date().toISOString(),
    })
    return
  }

  const thin = !minViable(parsed.dna)

  // ── 6. Upsert creator_dna (preserving `final`) ────────────────────────────
  try {
    await upsertDna(db, creatorId, jobId, parsed.dna, rawSnapshots, model, thin, progress)
  } catch (upsertErr) {
    // The raw PostgREST/Postgres error names tables, columns and constraints,
    // and `job.error` is owner-readable via RLS — so keep the detail in the
    // server logs and store a generic message, exactly as the parse path above.
    console.error('[scan] DNA upsert failed', jobId, (upsertErr as Error).message)
    await setJobStatus(db, jobId, 'failed', {
      error: 'Could not save the analysis result, please retry.',
      completed_at: new Date().toISOString(),
    })
    return
  }

  // ── 7. Mark job ready ─────────────────────────────────────────────────────
  await setJobStatus(db, jobId, 'ready', { completed_at: new Date().toISOString() })
  console.info(`[scan] job ${jobId} completed — thin=${thin}, platforms=${Object.keys(progress).join(',')}`)
}
