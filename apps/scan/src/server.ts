import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { loadConfig } from './config'
import { rateLimitDecision, RunLedger, type JobRecord } from './policy'
import { runScan, type ScanDeps } from './pipeline'
import { CompositeFetcher, FakeFetcher } from './fetchers'
import { ChatCompletionsClient, FakeLlm } from './llm'
import { handleScanRetry } from './scan-server'
import { handleVerifySubmission, handleVerifyRetry } from './verify-server'
import { sweepExpiredJobs } from './sweeper'

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const cfg = loadConfig()

// DB client — service_role, bypasses RLS for all writes
const db = createClient<Database>(cfg.supabaseUrl, cfg.serviceRoleKey, {
  auth: { persistSession: false },
})

// Auth client — anon key, used ONLY for auth.getUser(token) validation
const authClient = createClient(cfg.supabaseUrl, cfg.anonKey, {
  auth: { persistSession: false },
})

// Platform fetcher + LLM — real or fake depending on SCAN_FIXTURE_MODE
const fetcher = cfg.fixtureMode ? new FakeFetcher() : new CompositeFetcher(cfg.rapidApiKey, cfg.youtubeApiKey)
const llm = cfg.fixtureMode
  ? new FakeLlm()
  : new ChatCompletionsClient(cfg.llmApiKey, cfg.llmModel, cfg.llmBaseUrl)

if (cfg.fixtureMode) {
  console.info('[scan] ⚠️  FIXTURE MODE enabled — using fake fetchers and LLM')
}

// Shared deps bag passed to runScan
function makeDeps(): ScanDeps {
  return { db, fetcher, llm, model: cfg.llmModel }
}

// Process-wide ledger of launched verification runs — backs the per-creator
// daily cap, which cannot come from row counts alone because a retry reuses its
// row. See RunLedger for why in-process is the right trade here.
const verificationLedger = new RunLedger()

// ---------------------------------------------------------------------------
// Stale-job sweep
// ---------------------------------------------------------------------------

// Jobs are in-process fire-and-forget work with no durable queue, so a restart
// strands whatever rows were mid-flight in a non-terminal status. Sweep once at
// boot to retire rows an earlier process abandoned, then on an interval because
// a healthy long-lived container may not reboot again for weeks — and a row
// orphaned by THIS boot only becomes stale JOB_STALE_AFTER_MS later, i.e. long
// after the boot-time pass has run.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000

function sweepStaleJobs(): void {
  sweepExpiredJobs(db)
    .then((n) => {
      if (n > 0) console.warn(`[scan] swept ${n} stale job(s) to failed`)
    })
    .catch((err: unknown) => console.error('[scan] stale-job sweep failed', err))
}

sweepStaleJobs()
// unref() so the timer never keeps the process alive on its own.
setInterval(sweepStaleJobs, SWEEP_INTERVAL_MS).unref()

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getVerifiedUser(
  authHeader: string | undefined
): Promise<{ id: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono()

/**
 * Inbound body ceiling. The only body any route reads is
 * `{"submissionId": "<uuid>"}`, so 8 KiB is already orders of magnitude more
 * than needed. Without a limit Hono buffers the whole request before the
 * handler runs, letting one unauthenticated POST exhaust the memory of the
 * single worker process and kill every in-flight job with it.
 */
const MAX_REQUEST_BODY_BYTES = 8 * 1024

// CORS: the web app calls this worker cross-origin from the browser
// (NEXT_PUBLIC_SCAN_URL) with an Authorization header, which triggers a
// preflight OPTIONS. The allowed origin comes from config (required in
// production, '*' for local dev) — see loadConfig.
app.use(
  '*',
  cors({
    origin: cfg.webOrigin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }),
)

// Mounted before any route so the limit applies to every path, including ones
// added later that do not read a body today.
app.use(
  '*',
  bodyLimit({
    maxSize: MAX_REQUEST_BODY_BYTES,
    onError: (c) => c.json({ error: 'request body too large' }, 413),
  }),
)

if (cfg.webOrigin === '*') {
  console.warn('[scan] ⚠️  CORS origin is "*" — set WEB_ORIGIN to the web app origin outside local dev')
}

// GET /health
app.get('/health', (c) => c.json({ ok: true }))

// POST /scan — insert a new scan job and run pipeline in background
app.post('/scan', async (c) => {
  // 1. Authenticate
  const user = await getVerifiedUser(c.req.header('Authorization'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const creatorId = user.id

  // 2. Load existing jobs for rate-limit check
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25h buffer
  const { data: existingJobs, error: jobsErr } = await db
    .from('creator_scan_jobs')
    .select('id, creator_id, status, created_at, updated_at')
    .eq('creator_id', creatorId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (jobsErr) {
    console.error('[scan] failed to load existing jobs for rate-limit check', jobsErr.message)
    return c.json({ error: 'internal error' }, 500)
  }

  // Also include any non-terminal jobs older than 25h (active guard)
  const { data: activeJobs } = await db
    .from('creator_scan_jobs')
    .select('id, creator_id, status, created_at, updated_at')
    .eq('creator_id', creatorId)
    .in('status', ['queued', 'fetching', 'analyzing'])

  const allJobs: JobRecord[] = [
    ...((existingJobs as JobRecord[]) ?? []),
    ...((activeJobs as JobRecord[]) ?? []).filter(
      (j) => !existingJobs?.some((e) => e.id === j.id)
    ),
  ]

  const limitCheck = rateLimitDecision(allJobs)
  if (limitCheck.limited) {
    return c.json({ error: 'rate limited', reason: limitCheck.reason }, 429)
  }

  // 3. Require at least one handle
  const { data: handles, error: handlesErr } = await db
    .from('creator_social_handles')
    .select('platform, handle')
    .eq('creator_id', creatorId)

  if (handlesErr) return c.json({ error: 'internal error' }, 500)
  if (!handles || handles.length === 0) {
    return c.json({ error: 'no social handles found for this creator' }, 400)
  }

  // 4. Insert job
  const platforms = Object.fromEntries(handles.map((h) => [h.platform, 'pending']))
  const { data: job, error: insertErr } = await db
    .from('creator_scan_jobs')
    .insert({
      creator_id: creatorId,
      status: 'queued',
      progress: { platforms } as never,
    })
    .select('id')
    .single()

  if (insertErr || !job) {
    // A unique-violation (23505) on the partial unique index means another active
    // job already exists for this creator — a concurrent POST /scan that raced past
    // the app-level active-job check. Map it to 429, matching that check's contract.
    if (insertErr?.code === '23505') {
      return c.json({ error: 'rate limited', reason: 'active_job_exists' }, 429)
    }
    console.error('[scan] failed to insert job', insertErr?.message)
    return c.json({ error: 'internal error' }, 500)
  }

  const jobId = job.id

  // 5. Return 202 immediately, then run pipeline in background (fire-and-forget)
  const response = c.json({ jobId }, 202)
  runScan(makeDeps(), jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled pipeline error for job ${jobId}`, err)
  })
  return response
})

// POST /scan/:jobId/retry — retry a failed scan job
app.post('/scan/:jobId/retry', async (c) => {
  const user = await getVerifiedUser(c.req.header('Authorization'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const jobId = c.req.param('jobId')
  const result = await handleScanRetry(
    { db, userId: user.id, run: (id) => runScan(makeDeps(), id) },
    { jobId },
  )
  return c.json(result.body, result.status as never)
})

// POST /verify-submission — insert a verification job and run pipeline in background
app.post('/verify-submission', async (c) => {
  const user = await getVerifiedUser(c.req.header('Authorization'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => ({}))) as { submissionId?: string }
  const submissionId = body.submissionId
  if (!submissionId) return c.json({ error: 'submissionId is required' }, 400)

  const result = await handleVerifySubmission(
    { db, fetcher, userId: user.id, ledger: verificationLedger },
    { submissionId },
  )
  return c.json(result.body, result.status as never)
})

// POST /verify-submission/:jobId/retry — retry a failed verification job
app.post('/verify-submission/:jobId/retry', async (c) => {
  const user = await getVerifiedUser(c.req.header('Authorization'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const jobId = c.req.param('jobId')
  const result = await handleVerifyRetry(
    { db, fetcher, userId: user.id, ledger: verificationLedger },
    { jobId },
  )
  return c.json(result.body, result.status as never)
})

// Fail closed
app.onError((err, c) => {
  console.error('[scan-app] unhandled error', err)
  return c.json({ error: 'internal error' }, 500)
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

serve({ fetch: app.fetch, port: cfg.port })
console.info(`[scan-app] listening on port ${cfg.port}`)
