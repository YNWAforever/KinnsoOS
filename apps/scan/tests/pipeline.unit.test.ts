import { describe, it, expect, vi } from 'vitest'
import { runScan, type ScanDeps } from '../src/pipeline'
import { FakeFetcher } from '../src/fetchers'
import { FakeLlm } from '../src/llm'

// ---------------------------------------------------------------------------
// Minimal Supabase stub factory
// ---------------------------------------------------------------------------

type TableName = 'creator_scan_jobs' | 'creator_social_handles' | 'creator_dna'

interface RowStore {
  creator_scan_jobs: Record<string, Record<string, unknown>>
  creator_social_handles: Record<string, unknown>[]
  creator_dna: Record<string, Record<string, unknown>>
}

function makeDb(
  jobRow: Record<string, unknown>,
  handles: Array<{ platform: string; handle: string }>,
  options: { dnaConflict?: boolean } = {}
) {
  const store: RowStore = {
    creator_scan_jobs: { [jobRow.id as string]: { ...jobRow } },
    creator_social_handles: handles,
    creator_dna: {},
  }

  // Capture all updates so tests can assert on them
  const updates: Array<{ table: TableName; id: string; data: Record<string, unknown> }> = []
  const upserts: Array<{ table: TableName; data: Record<string, unknown> }> = []

  function chainSelect(table: TableName, rows: unknown[]) {
    const q = {
      data: null as unknown,
      error: null as null | { message: string },
      select: () => q,
      eq: (_col: string, val: unknown) => {
        if (table === 'creator_scan_jobs') {
          q.data = store.creator_scan_jobs[val as string] ?? null
        } else if (table === 'creator_social_handles') {
          q.data = rows
        }
        return q
      },
      single: () => ({ data: q.data, error: q.error }),
    }
    return q
  }

  const db = {
    _updates: updates,
    _upserts: upserts,
    _store: store,
    from: (table: TableName) => ({
      select: (_cols?: string) => chainSelect(table, table === 'creator_social_handles' ? handles : []),
      update: (data: Record<string, unknown>) => {
        return {
          eq: (col: string, val: unknown) => {
            const id = val as string
            if (table === 'creator_scan_jobs') {
              Object.assign(store.creator_scan_jobs[id] ?? {}, data)
            }
            updates.push({ table, id, data })
            return { data: null, error: null }
          },
        }
      },
      upsert: (data: Record<string, unknown>, _opts?: unknown) => {
        if (table === 'creator_dna') {
          store.creator_dna[data.creator_id as string] = { ...data }
        }
        upserts.push({ table, data })
        return { data: null, error: null }
      },
    }),
  }

  return db as unknown as import('@supabase/supabase-js').SupabaseClient<import('@kinnso/db').Database> & {
    _updates: typeof updates
    _upserts: typeof upserts
    _store: typeof store
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const JOB_ID = 'test-job-uuid'
const CREATOR_ID = 'test-creator-uuid'

const BASE_JOB = {
  id: JOB_ID,
  creator_id: CREATOR_ID,
  status: 'queued',
}

const IG_HANDLE = { platform: 'instagram', handle: 'test_ig' }

function makeDeps(
  db: ReturnType<typeof makeDb>,
  opts: { failPlatforms?: ('instagram' | 'youtube' | 'threads')[]; failLlm?: boolean } = {}
): ScanDeps {
  return {
    db: db as never,
    fetcher: new FakeFetcher({}, opts.failPlatforms ?? []),
    llm: new FakeLlm(undefined, opts.failLlm ?? false),
    model: 'fake-model',
  }
}

describe('runScan pipeline', () => {
  it('transitions through fetching → analyzing → ready for a successful scan', async () => {
    const db = makeDb(BASE_JOB, [IG_HANDLE])
    await runScan(makeDeps(db), JOB_ID)

    const statuses = db._updates
      .filter((u) => u.table === 'creator_scan_jobs' && u.data.status)
      .map((u) => u.data.status)
    expect(statuses).toEqual(['fetching', 'analyzing', 'ready'])
  })

  it('marks platform progress ok after successful fetch', async () => {
    const db = makeDb(BASE_JOB, [IG_HANDLE])
    await runScan(makeDeps(db), JOB_ID)

    const progressUpdates = db._updates.filter(
      (u) => u.table === 'creator_scan_jobs' && u.data.progress
    )
    const last = progressUpdates.at(-1)?.data.progress as { platforms: Record<string, string> }
    expect(last?.platforms?.instagram).toBe('ok')
  })

  it('upserts creator_dna after successful scan', async () => {
    const db = makeDb(BASE_JOB, [IG_HANDLE])
    await runScan(makeDeps(db), JOB_ID)

    expect(db._upserts.some((u) => u.table === 'creator_dna')).toBe(true)
    const dnaUpsert = db._upserts.find((u) => u.table === 'creator_dna')!
    expect(dnaUpsert.data.creator_id).toBe(CREATOR_ID)
    expect(dnaUpsert.data.scan_job_id).toBe(JOB_ID)
    expect(dnaUpsert.data.status).toBe('draft')
    // final must NOT be present in upsert data
    expect('final' in dnaUpsert.data).toBe(false)
  })

  it('marks the platform failed and continues when one platform fetch fails', async () => {
    const db = makeDb(BASE_JOB, [
      { platform: 'instagram', handle: 'ig_user' },
      { platform: 'youtube', handle: 'yt_user' },
    ])
    // IG fails, YouTube succeeds
    const deps = makeDeps(db, { failPlatforms: ['instagram'] })
    await runScan(deps, JOB_ID)

    const progressUpdates = db._updates
      .filter((u) => u.table === 'creator_scan_jobs' && u.data.progress)
      .map((u) => (u.data.progress as { platforms: Record<string, string> }).platforms)

    // At some point: instagram=failed
    expect(progressUpdates.some((p) => p.instagram === 'failed')).toBe(true)
    // Final state: youtube=ok (scan completed)
    const finalStatuses = db._updates
      .filter((u) => u.table === 'creator_scan_jobs' && u.data.status)
      .map((u) => u.data.status)
    expect(finalStatuses.at(-1)).toBe('ready')
  })

  it('fails the job when ALL platforms fail', async () => {
    const db = makeDb(BASE_JOB, [IG_HANDLE])
    const deps = makeDeps(db, { failPlatforms: ['instagram'] })
    await runScan(deps, JOB_ID)

    const finalStatus = db._updates
      .filter((u) => u.table === 'creator_scan_jobs' && u.data.status)
      .map((u) => u.data.status)
      .at(-1)
    expect(finalStatus).toBe('failed')
    const errorMsg = db._updates.find(
      (u) => u.table === 'creator_scan_jobs' && typeof u.data.error === 'string'
    )?.data.error as string
    expect(errorMsg).toMatch(/All platform fetches failed/)
  })

  it('retries LLM once and succeeds on the second attempt', async () => {
    const db = makeDb(BASE_JOB, [IG_HANDLE])
    let callCount = 0
    const llm = {
      async complete() {
        callCount++
        if (callCount === 1) throw new Error('transient LLM error')
        return JSON.stringify({
          bio: 'Retry success',
          niches: ['travel'],
          content_pillars: [],
          tone: [],
          audience: {},
          platforms: [],
          languages: ['en'],
        })
      },
    }
    const deps: ScanDeps = { db: db as never, fetcher: new FakeFetcher(), llm, model: 'model' }
    await runScan(deps, JOB_ID)
    expect(callCount).toBe(2)
    const finalStatus = db._updates
      .filter((u) => u.data.status)
      .map((u) => u.data.status)
      .at(-1)
    expect(finalStatus).toBe('ready')
  })

  it('fails the job after two LLM failures', async () => {
    const db = makeDb(BASE_JOB, [IG_HANDLE])
    const deps = makeDeps(db, { failLlm: true })
    await runScan(deps, JOB_ID)
    const finalStatus = db._updates
      .filter((u) => u.data.status)
      .map((u) => u.data.status)
      .at(-1)
    expect(finalStatus).toBe('failed')
  })
})
