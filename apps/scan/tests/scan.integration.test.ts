/**
 * Integration tests for the apps/scan worker pipeline.
 *
 * Self-skip when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent (CI seeds
 * them into .env.test; local dev requires a manual .env.test).
 *
 * Uses FAKE fetch + LLM adapters — no real RapidAPI or OpenRouter calls.
 * Identifiers are disjoint from seed.sql to avoid conflicts with parallel test suites.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { runScan, type ScanDeps } from '../src/pipeline'
import { FakeFetcher } from '../src/fetchers'
import { FakeLlm } from '../src/llm'

// ---------------------------------------------------------------------------
// Self-skip guard
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

const run = SUPABASE_URL && SERVICE_ROLE_KEY ? describe : describe.skip

// Use placeholder values so createClient() doesn't throw at module load when
// env vars are absent (the describe.skip guard prevents any actual execution).
const svc = createClient<Database>(
  SUPABASE_URL ?? 'http://localhost:54321',
  SERVICE_ROLE_KEY ?? 'placeholder-service-role'
)
const anonClient = createClient(
  SUPABASE_URL ?? 'http://localhost:54321',
  ANON_KEY ?? 'placeholder-anon'
)

// ---------------------------------------------------------------------------
// Disjoint test identifiers (must NOT match any slug/id in supabase/seed.sql)
// ---------------------------------------------------------------------------

// We create real auth users so we get valid UUIDs that match creators.id (cascade trigger).
// Auth user emails must be unique; use a timestamp suffix to avoid CI re-run collisions.
const TIMESTAMP = Date.now()
const USER_A_EMAIL = `scan-test-${TIMESTAMP}-a@kinnso-test.invalid`
const USER_B_EMAIL = `scan-test-${TIMESTAMP}-b@kinnso-test.invalid`
const TEST_PASSWORD = 'Test1234!'

let USER_A_ID: string
let USER_B_ID: string

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Create two test auth users (the auth.users trigger auto-creates their creators rows)
  const { data: a, error: aErr } = await svc.auth.admin.createUser({
    email: USER_A_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (aErr || !a.user) throw new Error(`Failed to create user A: ${aErr?.message}`)
  USER_A_ID = a.user.id

  const { data: b, error: bErr } = await svc.auth.admin.createUser({
    email: USER_B_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (bErr || !b.user) throw new Error(`Failed to create user B: ${bErr?.message}`)
  USER_B_ID = b.user.id

  // Give the trigger a moment to create the creators rows
  await new Promise((r) => setTimeout(r, 200))

  // Insert IG handle for user A
  await svc
    .from('creator_social_handles')
    .insert({ creator_id: USER_A_ID, platform: 'instagram', handle: 'test_ig_handle' })
})

afterAll(async () => {
  // Delete auth users — cascades to creators, creator_social_handles,
  // creator_scan_jobs, creator_dna via ON DELETE CASCADE.
  if (USER_A_ID) await svc.auth.admin.deleteUser(USER_A_ID)
  if (USER_B_ID) await svc.auth.admin.deleteUser(USER_B_ID)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertJob(
  creatorId: string,
  status: string = 'queued',
  extra: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await svc
    .from('creator_scan_jobs')
    .insert({
      creator_id: creatorId,
      status: status as never,
      progress: { platforms: { instagram: 'pending' } } as never,
      ...extra,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insertJob failed: ${error?.message}`)
  return data.id
}

function makeDeps(opts: {
  failPlatforms?: ('instagram' | 'youtube' | 'threads')[]
  failLlm?: boolean
} = {}): ScanDeps {
  return {
    db: svc as never,
    fetcher: new FakeFetcher({}, opts.failPlatforms ?? []),
    llm: new FakeLlm(undefined, opts.failLlm ?? false),
    model: 'fake-model-integration',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

run('apps/scan integration — job lifecycle (fake adapters)', () => {
  it('happy path: job transitions queued→fetching→analyzing→ready and upserts creator_dna', async () => {
    const jobId = await insertJob(USER_A_ID)
    await runScan(makeDeps(), jobId)

    const { data: job } = await svc
      .from('creator_scan_jobs')
      .select('status, completed_at, progress')
      .eq('id', jobId)
      .single()
    expect(job!.status).toBe('ready')
    expect(job!.completed_at).not.toBeNull()

    const { data: dna } = await svc
      .from('creator_dna')
      .select('creator_id, status, ai_draft, final, scan_job_id')
      .eq('creator_id', USER_A_ID)
      .single()
    expect(dna).not.toBeNull()
    expect(dna!.status).toBe('draft')
    expect(dna!.scan_job_id).toBe(jobId)
    expect(dna!.ai_draft).toBeTruthy()
    // final must remain null (not touched by the scan pipeline)
    expect(dna!.final).toBeNull()
  })

  it('re-scan does NOT overwrite final when creator_dna already has final set', async () => {
    // Simulate a published DNA with a final value
    const customFinal = { bio: 'Creator-edited final bio', niches: ['food'] }
    await svc.from('creator_dna').upsert(
      {
        creator_id: USER_A_ID,
        ai_draft: { bio: 'Old AI draft' } as never,
        final: customFinal as never,
        status: 'published',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'creator_id' }
    )

    const jobId = await insertJob(USER_A_ID)
    await runScan(makeDeps(), jobId)

    const { data: dna } = await svc
      .from('creator_dna')
      .select('final, status, ai_draft')
      .eq('creator_id', USER_A_ID)
      .single()

    // final must be preserved
    expect(dna!.final).toEqual(customFinal)
    // ai_draft refreshed; status reset to draft
    expect(dna!.status).toBe('draft')
    expect(dna!.ai_draft).not.toEqual({ bio: 'Old AI draft' })
  })

  it('partial failure: IG fetch fails but YouTube succeeds → job reaches ready, IG marked failed in progress', async () => {
    // Add YouTube handle for user A
    await svc
      .from('creator_social_handles')
      .upsert(
        { creator_id: USER_A_ID, platform: 'youtube', handle: 'test_yt_handle' },
        { onConflict: 'creator_id,platform' }
      )

    const jobId = await insertJob(USER_A_ID)
    await runScan(makeDeps({ failPlatforms: ['instagram'] }), jobId)

    const { data: job } = await svc
      .from('creator_scan_jobs')
      .select('status, progress')
      .eq('id', jobId)
      .single()

    // YouTube returned data so the scan succeeded overall
    expect(job!.status).toBe('ready')
    const platforms = (job!.progress as { platforms: Record<string, string> }).platforms
    expect(platforms.instagram).toBe('failed')
    expect(platforms.youtube).toBe('ok')

    // Clean up extra handle
    await svc
      .from('creator_social_handles')
      .delete()
      .eq('creator_id', USER_A_ID)
      .eq('platform', 'youtube')
  })

  it('zero-data failure: all platforms fail → job status=failed', async () => {
    const jobId = await insertJob(USER_A_ID)
    await runScan(makeDeps({ failPlatforms: ['instagram', 'youtube', 'threads'] }), jobId)

    const { data: job } = await svc
      .from('creator_scan_jobs')
      .select('status, error, completed_at')
      .eq('id', jobId)
      .single()

    expect(job!.status).toBe('failed')
    expect(job!.error).toMatch(/All platform fetches failed/)
    expect(job!.completed_at).not.toBeNull()
  })

  it('retry ownership check: user B cannot retry a job owned by user A (404)', async () => {
    // Simulate the canRetry ownership check as exercised via the policy + the server route.
    // Here we test the policy layer directly with real job data from the DB.
    const { canRetry: canRetryFn } = await import('../src/policy')
    const jobId = await insertJob(USER_A_ID, 'failed')

    const { data: job } = await svc
      .from('creator_scan_jobs')
      .select('id, creator_id, status, created_at, updated_at')
      .eq('id', jobId)
      .single()

    const result = canRetryFn(
      { id: job!.id, creator_id: job!.creator_id, status: job!.status as never, created_at: job!.created_at, updated_at: job!.updated_at },
      USER_B_ID // user B tries to retry user A's job
    )
    expect(result).toEqual({ allowed: false, httpStatus: 404 })
  })

  it('retry ownership check: user A CAN retry their own failed job (200)', async () => {
    const { canRetry: canRetryFn } = await import('../src/policy')
    const jobId = await insertJob(USER_A_ID, 'failed')

    const { data: job } = await svc
      .from('creator_scan_jobs')
      .select('id, creator_id, status, created_at, updated_at')
      .eq('id', jobId)
      .single()

    const result = canRetryFn(
      { id: job!.id, creator_id: job!.creator_id, status: job!.status as never, created_at: job!.created_at, updated_at: job!.updated_at },
      USER_A_ID
    )
    expect(result).toEqual({ allowed: true, httpStatus: 200 })
  })

  it('rate-limit (429): blocks when a non-terminal job already exists', async () => {
    const { rateLimitDecision } = await import('../src/policy')
    const jobId = await insertJob(USER_A_ID, 'fetching')

    const { data: jobs } = await svc
      .from('creator_scan_jobs')
      .select('id, creator_id, status, created_at, updated_at')
      .eq('creator_id', USER_A_ID)
      .in('status', ['queued', 'fetching', 'analyzing'])

    const result = rateLimitDecision(
      (jobs as Array<{
        id: string
        creator_id: string
        status: 'queued' | 'fetching' | 'analyzing' | 'ready' | 'failed'
        created_at: string
        updated_at: string
      }> | null) ?? []
    )
    expect(result.limited).toBe(true)
    expect(result.reason).toBe('active_job_exists')

    // Clean up: set it to failed so other tests are not affected
    await svc
      .from('creator_scan_jobs')
      .update({ status: 'failed' as never, completed_at: new Date().toISOString() })
      .eq('id', jobId)
  })
})
