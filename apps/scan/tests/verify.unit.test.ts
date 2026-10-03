import { describe, expect, it } from 'vitest'
import { verifySubmission, type VerifyDeps } from '../src/verify'
import { FakeFetcher } from '../src/fetchers'

const JOB_ID = 'job-1'
const SUB_ID = 'sub-1'
const PARTICIPANT_ID = 'p-1'
const MISSION_ID = 'm-1'
const CREATOR_ID = 'creator-1'

type DbRows = {
  mission_verification_jobs?: unknown
  mission_milestone_submissions?: unknown
  mission_participants?: unknown
  creator_social_handles?: unknown
}

function makeDb(jobOverrides: Record<string, unknown> = {}, handle = 'traveler', rowOverrides: DbRows = {}) {
  const job = {
    id: JOB_ID, mission_milestone_submission_id: SUB_ID, creator_id: CREATOR_ID,
    platform: 'instagram', proof_url: 'https://www.instagram.com/p/Cabc/', status: 'queued',
    ...jobOverrides,
  }
  const updates: Array<{ table: string; data: Record<string, unknown> }> = []
  const inserts: Array<{ table: string; data: Record<string, unknown> }> = []

  const rows: Record<string, unknown> = {
    mission_verification_jobs: job,
    mission_milestone_submissions: { id: SUB_ID, mission_participant_id: PARTICIPANT_ID },
    mission_participants: { id: PARTICIPANT_ID, mission_id: MISSION_ID, creator_id: CREATOR_ID },
    creator_social_handles: { creator_id: CREATOR_ID, platform: 'instagram', handle },
    ...rowOverrides,
  }

  const db = {
    _updates: updates,
    _inserts: inserts,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }),
          single: async () => ({ data: rows[table], error: null }),
          maybeSingle: async () => ({ data: rows[table], error: null }),
        }),
      }),
      update: (data: Record<string, unknown>) => ({
        eq: async () => { updates.push({ table, data }); Object.assign(job as Record<string, unknown>, data); return { data: null, error: null } },
      }),
      insert: async (data: Record<string, unknown>) => { inserts.push({ table, data }); return { data: null, error: null } },
    }),
  }
  return db as never
}

const deps = (db: unknown, fetcher = new FakeFetcher()): VerifyDeps => ({ db: db as never, fetcher })

type TrackingDb = {
  _updates: Array<{ data: Record<string, unknown> }>
  _inserts: Array<{ table: string; data: Record<string, unknown> }>
}

describe('verifySubmission', () => {
  it('transitions fetching → ready and writes a verified_signal snapshot when the handle matches', async () => {
    const db = makeDb({}, 'fake_ig_user') // FakeFetcher returns authorHandle 'fake_ig_user'
    await verifySubmission(deps(db), JOB_ID)
    const statuses = (db as never as TrackingDb)._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses).toEqual(['fetching', 'ready'])
    const snapshot = (db as never as TrackingDb)._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('verified_signal')
    expect(snapshot.data.mission_milestone_submission_id).toBe(SUB_ID)
    expect(snapshot.data.mission_id).toBe(MISSION_ID)
  })

  it('writes needs_review when the handle does not match', async () => {
    const db = makeDb({}, 'someone_else')
    await verifySubmission(deps(db), JOB_ID)
    const snapshot = (db as never as TrackingDb)._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('needs_review')
  })

  it('writes unavailable when the post fetch fails', async () => {
    const db = makeDb()
    await verifySubmission(deps(db, new FakeFetcher({}, ['instagram'])), JOB_ID)
    const snapshot = (db as never as TrackingDb)._inserts
      .find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('unavailable')
    // still reaches ready — unavailable is a successful (manual-review) outcome
    const statuses = (db as never as TrackingDb)._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses[statuses.length - 1]).toBe('ready')
  })

  // FIX 2: null/unsupported proof URL must NOT attempt a snapshot insert
  // (that would violate the platform CHECK constraint); instead mark ready+unavailable.
  it('marks ready+unavailable without a snapshot insert when proof URL is unsupported', async () => {
    const db = makeDb({ proof_url: 'https://tiktok.com/@user/video/12345' })
    await verifySubmission(deps(db), JOB_ID)

    // No snapshot should have been inserted
    const snapshot = (db as never as TrackingDb)._inserts
      .find((i) => i.table === 'mission_social_snapshots')
    expect(snapshot).toBeUndefined()

    // Job must reach ready with unavailable confidence
    const statuses = (db as never as TrackingDb)._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses[statuses.length - 1]).toBe('ready')
    const readyUpdate = (db as never as TrackingDb)._updates.find((u) => u.data.status === 'ready')
    expect(readyUpdate?.data.confidence_status).toBe('unavailable')
  })

  it('marks ready+unavailable without a snapshot insert when proof URL is null', async () => {
    const db = makeDb({ proof_url: null })
    await verifySubmission(deps(db), JOB_ID)

    const snapshot = (db as never as TrackingDb)._inserts
      .find((i) => i.table === 'mission_social_snapshots')
    expect(snapshot).toBeUndefined()

    const statuses = (db as never as TrackingDb)._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses[statuses.length - 1]).toBe('ready')
  })

  // FIX 3: missing submission or participant must cause the job to reach `failed`
  // rather than inserting a dangling snapshot with null FKs.
  it('fails the job when the submission cannot be found', async () => {
    const db = makeDb({}, 'traveler', { mission_milestone_submissions: null })
    await verifySubmission(deps(db), JOB_ID)

    // No snapshot inserted
    const snapshot = (db as never as TrackingDb)._inserts
      .find((i) => i.table === 'mission_social_snapshots')
    expect(snapshot).toBeUndefined()

    // Job must end in failed
    const statuses = (db as never as TrackingDb)._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses[statuses.length - 1]).toBe('failed')
  })

  it('fails the job when the participant cannot be found', async () => {
    const db = makeDb({}, 'traveler', { mission_participants: null })
    await verifySubmission(deps(db), JOB_ID)

    const snapshot = (db as never as TrackingDb)._inserts
      .find((i) => i.table === 'mission_social_snapshots')
    expect(snapshot).toBeUndefined()

    const statuses = (db as never as TrackingDb)._updates.map((u) => u.data.status).filter(Boolean)
    expect(statuses[statuses.length - 1]).toBe('failed')
  })

  it('writes a verified_signal youtube snapshot via channel-id match', async () => {
    const db = makeDb({ platform: 'youtube', proof_url: 'https://www.youtube.com/watch?v=abc' }, 'any-handle')
    await verifySubmission(deps(db), JOB_ID) // FakeFetcher youtube post.authorId === resolveChannelId default
    const snapshot = (db as never as TrackingDb)._inserts.find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.platform).toBe('youtube')
    expect(snapshot.data.confidence_status).toBe('verified_signal')
  })

  it('falls back to handle match for youtube when channel ids differ', async () => {
    const db = makeDb({ platform: 'youtube', proof_url: 'https://www.youtube.com/watch?v=abc' }, 'matchme')
    const fetcher = new FakeFetcher({}, [], { youtube: { authorHandle: 'matchme', authorId: 'UCother', engagementCount: 1, postUrl: null } }, 'UCmine')
    await verifySubmission(deps(db, fetcher), JOB_ID)
    const snapshot = (db as never as TrackingDb)._inserts.find((i) => i.table === 'mission_social_snapshots')!
    expect(snapshot.data.confidence_status).toBe('verified_signal')
  })
})
