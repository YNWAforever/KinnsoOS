import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { resolveR73LocalLiveConfig } from './helpers/r7-3-local-live-config'

/**
 * Phase 2 slice 1 -- the trip write path.
 * Migration: supabase/migrations/20260911120000_p2_1_trip_write_path.sql
 *
 * These RPCs exist because `trips.head_revision_no` is deliberately absent from
 * the column-level UPDATE grant, so only a definer function can mint a
 * revision. That makes them the one place optimistic concurrency can be
 * enforced -- which is worth testing against a live database rather than
 * mocking, because the guarantee comes from `select ... for update` and a
 * transaction, not from application code.
 *
 * Same fail-closed local-live opt-in as the other live suites.
 */

const liveConfig = resolveR73LocalLiveConfig(process.env)
const d = liveConfig ? describe : describe.skip
const hookTimeout = 60000

const svc = liveConfig ? createClient<Database>(liveConfig.url, liveConfig.serviceRoleKey) : null
const anon = liveConfig ? createClient<Database>(liveConfig.url, liveConfig.anonKey) : null

const password = 'Test1234!p21'

async function signedInClient(email: string) {
  if (!liveConfig || !svc) throw new Error('local live-test config is not enabled')
  const { error: createError } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  expect(createError, `createUser failed for ${email}: ${createError?.message}`).toBeNull()
  const client = createClient<Database>(liveConfig.url, liveConfig.anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull()
  return client
}

d('Phase 2 trip write path: revisions and optimistic concurrency (live)', () => {
  const runId = randomUUID()
  let travellerA: Awaited<ReturnType<typeof signedInClient>>
  let travellerB: Awaited<ReturnType<typeof signedInClient>>
  let userAId = ''
  let userBId = ''

  beforeAll(async () => {
    travellerA = await signedInClient(`p2-wp-a-${runId}@example.test`)
    travellerB = await signedInClient(`p2-wp-b-${runId}@example.test`)
    userAId = (await travellerA.auth.getUser()).data.user!.id
    userBId = (await travellerB.auth.getUser()).data.user!.id
  }, hookTimeout)

  afterAll(async () => {
    if (!svc) return
    // Asserted, not fire-and-forget: these deletions were failing silently
    // (the append-only trigger blocked the authorship SET NULL) and the
    // accumulating rows were the only visible symptom of a real defect.
    for (const id of [userAId, userBId].filter(Boolean)) {
      const { error } = await svc.auth.admin.deleteUser(id)
      expect(error, `cleanup failed for ${id}: ${error?.message}`).toBeNull()
    }
  }, hookTimeout)

  async function newTrip(title: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await travellerA.rpc('create_trip', { p_title: title, ...extra })
    expect(error, `create_trip failed: ${error?.message}`).toBeNull()
    return data as string
  }

  // ---- create --------------------------------------------------------------

  it('creates a trip owned by the caller and mints revision 1', async () => {
    const tripId = await newTrip('Kyoto in spring', { p_timezone: 'Asia/Tokyo' })

    const trip = await svc!
      .from('trips')
      .select('owner_user_id, title, timezone, head_revision_no, start_date')
      .eq('id', tripId)
      .single()
    expect(trip.data!.owner_user_id).toBe(userAId)
    expect(trip.data!.title).toBe('Kyoto in spring')
    expect(trip.data!.timezone).toBe('Asia/Tokyo')
    expect(trip.data!.head_revision_no).toBe(1)
    // Undated is the default and a real state, not a sentinel date.
    expect(trip.data!.start_date).toBeNull()

    const revs = await svc!
      .from('trip_revisions')
      .select('revision_no, change_kind, author_user_id, parent_revision_no')
      .eq('trip_id', tripId)
    expect(revs.data).toHaveLength(1)
    expect(revs.data![0].revision_no).toBe(1)
    expect(revs.data![0].change_kind).toBe('create')
    expect(revs.data![0].author_user_id).toBe(userAId)
    expect(revs.data![0].parent_revision_no).toBeNull()
  })

  it('cannot create a trip in another account', async () => {
    // There is no owner argument: ownership comes from auth.uid() inside the
    // definer function, so misattribution is not expressible rather than being
    // merely rejected.
    const tripId = await newTrip('Whose trip is this')
    const trip = await svc!.from('trips').select('owner_user_id').eq('id', tripId).single()
    expect(trip.data!.owner_user_id).toBe(userAId)
    expect(trip.data!.owner_user_id).not.toBe(userBId)
  })

  it('rejects an invalid time zone at creation, leaving no trip behind', async () => {
    const before = await svc!.from('trips').select('id').eq('owner_user_id', userAId)
    const { error } = await travellerA.rpc('create_trip', {
      p_title: 'Nowhere',
      p_timezone: 'Mars/Olympus',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('invalid_time_zone')

    // The insert and the revision are in one transaction, so a rejected zone
    // must not leave a half-created trip.
    const after = await svc!.from('trips').select('id').eq('owner_user_id', userAId)
    expect(after.data!.length).toBe(before.data!.length)
  })

  it('is unavailable to an anonymous caller', async () => {
    const created = await anon!.rpc('create_trip', { p_title: 'Anon trip' })
    expect(created.error).not.toBeNull()
    const updated = await anon!.rpc('update_trip', { p_trip_id: randomUUID(), p_expected_revision: 1 })
    expect(updated.error).not.toBeNull()
    const deleted = await anon!.rpc('delete_trip', { p_trip_id: randomUUID(), p_expected_revision: 1 })
    expect(deleted.error).not.toBeNull()
  })

  // ---- update: compare-and-set --------------------------------------------

  it('advances the revision and logs an edit', async () => {
    const tripId = await newTrip('Draft title')

    const { data, error } = await travellerA.rpc('update_trip', {
      p_trip_id: tripId,
      p_expected_revision: 1,
      p_title: 'Kyoto, properly',
    })
    expect(error, `update_trip failed: ${error?.message}`).toBeNull()
    expect(data).toBe(2)

    const trip = await svc!.from('trips').select('title, head_revision_no').eq('id', tripId).single()
    expect(trip.data!.title).toBe('Kyoto, properly')
    expect(trip.data!.head_revision_no).toBe(2)

    const rev = await svc!
      .from('trip_revisions')
      .select('change_kind, parent_revision_no')
      .eq('trip_id', tripId)
      .eq('revision_no', 2)
      .single()
    expect(rev.data!.change_kind).toBe('edit')
    expect(rev.data!.parent_revision_no).toBe(1)
  })

  it('refuses a stale revision and changes nothing', async () => {
    const tripId = await newTrip('Original')
    await travellerA.rpc('update_trip', { p_trip_id: tripId, p_expected_revision: 1, p_title: 'First edit' })

    // A second editor still holding revision 1.
    const { error } = await travellerA.rpc('update_trip', {
      p_trip_id: tripId,
      p_expected_revision: 1,
      p_title: 'Clobbered',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('trip_revision_conflict')

    const trip = await svc!.from('trips').select('title, head_revision_no').eq('id', tripId).single()
    expect(trip.data!.title).toBe('First edit')
    expect(trip.data!.head_revision_no).toBe(2)

    // A refused write must not leave a revision behind either.
    const revs = await svc!.from('trip_revisions').select('revision_no').eq('trip_id', tripId)
    expect(revs.data).toHaveLength(2)
  })

  it('lets exactly one of two concurrent editors win', async () => {
    const tripId = await newTrip('Contested')

    const [first, second] = await Promise.all([
      travellerA.rpc('update_trip', { p_trip_id: tripId, p_expected_revision: 1, p_title: 'Editor one' }),
      travellerA.rpc('update_trip', { p_trip_id: tripId, p_expected_revision: 1, p_title: 'Editor two' }),
    ])

    // Whether the two interleave or serialise, the second to reach the
    // compare-and-set sees head=2 against expected=1. `select ... for update`
    // is what stops them both reading head=1 and both applying.
    const failures = [first, second].filter((r) => r.error)
    const wins = [first, second].filter((r) => !r.error)
    expect(wins).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(failures[0].error!.message).toContain('trip_revision_conflict')

    const trip = await svc!.from('trips').select('title, head_revision_no').eq('id', tripId).single()
    expect(trip.data!.head_revision_no).toBe(2)
    expect(['Editor one', 'Editor two']).toContain(trip.data!.title)

    const revs = await svc!.from('trip_revisions').select('revision_no').eq('trip_id', tripId)
    expect(revs.data).toHaveLength(2)
  })

  it('refuses to touch a trip owned by someone else, without revealing it exists', async () => {
    const tripId = await newTrip('Private to A')

    const { error } = await travellerB.rpc('update_trip', {
      p_trip_id: tripId,
      p_expected_revision: 1,
      p_title: 'Taken over',
    })
    expect(error).not.toBeNull()
    // Deliberately the same error a nonexistent id gives, so the response
    // cannot be used to probe which trip ids exist.
    expect(error!.message).toContain('trip_not_found')

    const missing = await travellerB.rpc('update_trip', {
      p_trip_id: randomUUID(),
      p_expected_revision: 1,
      p_title: 'Nothing here',
    })
    expect(missing.error!.message).toBe(error!.message)

    const trip = await svc!.from('trips').select('title').eq('id', tripId).single()
    expect(trip.data!.title).toBe('Private to A')
  })

  // ---- dates ---------------------------------------------------------------

  it('logs a date change as its own kind, and can return a trip to undated', async () => {
    const tripId = await newTrip('Dateable')

    const dated = await travellerA.rpc('update_trip', {
      p_trip_id: tripId,
      p_expected_revision: 1,
      p_start_date: '2030-06-01',
    })
    expect(dated.error, `dating failed: ${dated.error?.message}`).toBeNull()

    const datedRev = await svc!
      .from('trip_revisions').select('change_kind').eq('trip_id', tripId).eq('revision_no', 2).single()
    expect(datedRev.data!.change_kind).toBe('set_dates')

    // Clearing needs its own flag: NULL already means "leave alone" for every
    // optional argument, so without it an undated trip could never be restored.
    const cleared = await travellerA.rpc('update_trip', {
      p_trip_id: tripId,
      p_expected_revision: 2,
      p_clear_start_date: true,
    })
    expect(cleared.error, `clearing failed: ${cleared.error?.message}`).toBeNull()

    const trip = await svc!.from('trips').select('start_date, head_revision_no').eq('id', tripId).single()
    expect(trip.data!.start_date).toBeNull()
    expect(trip.data!.head_revision_no).toBe(3)
  })

  it('rejects a request that both sets and clears the start date', async () => {
    const tripId = await newTrip('Ambiguous')
    const { error } = await travellerA.rpc('update_trip', {
      p_trip_id: tripId,
      p_expected_revision: 1,
      p_start_date: '2030-06-01',
      p_clear_start_date: true,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('start_date_ambiguous')
  })

  it('does not log an edit as a date change when the date is unchanged', async () => {
    const tripId = await newTrip('Renamed only', { p_start_date: '2030-06-01' })
    await travellerA.rpc('update_trip', { p_trip_id: tripId, p_expected_revision: 1, p_title: 'Still dated' })

    const rev = await svc!
      .from('trip_revisions').select('change_kind').eq('trip_id', tripId).eq('revision_no', 2).single()
    expect(rev.data!.change_kind).toBe('edit')
  })

  // ---- delete --------------------------------------------------------------

  it('refuses a delete on a stale revision, then accepts it on the current one', async () => {
    const tripId = await newTrip('Doomed')
    await travellerA.rpc('update_trip', { p_trip_id: tripId, p_expected_revision: 1, p_title: 'Doomed v2' })

    const stale = await travellerA.rpc('delete_trip', { p_trip_id: tripId, p_expected_revision: 1 })
    expect(stale.error).not.toBeNull()
    expect(stale.error!.message).toContain('trip_revision_conflict')
    expect((await svc!.from('trips').select('id').eq('id', tripId)).data).toHaveLength(1)

    const current = await travellerA.rpc('delete_trip', { p_trip_id: tripId, p_expected_revision: 2 })
    expect(current.error, `delete failed: ${current.error?.message}`).toBeNull()
    expect((await svc!.from('trips').select('id').eq('id', tripId)).data).toEqual([])

    // The change log is ON DELETE CASCADE, so it goes with the trip rather than
    // outliving the private content it describes.
    expect((await svc!.from('trip_revisions').select('id').eq('trip_id', tripId)).data).toEqual([])
  })

  it('refuses to delete a trip owned by someone else', async () => {
    const tripId = await newTrip('Not yours')
    const { error } = await travellerB.rpc('delete_trip', { p_trip_id: tripId, p_expected_revision: 1 })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('trip_not_found')
    expect((await svc!.from('trips').select('id').eq('id', tripId)).data).toHaveLength(1)
  })

  // ---- referential actions must not be blocked by the append-only guard ----
  //
  // These two cover a slice 0 defect that nothing caught: the append-only
  // trigger raised on every UPDATE and DELETE, including the ones Postgres
  // issues itself for referential integrity. Deleting a trip was impossible,
  // and so was deleting an account. Both are pinned here because the guard is
  // now narrow rather than absolute, and narrowing it is exactly the kind of
  // change a later edit could widen by accident.

  it('still refuses to rewrite history through the authorship exception', async () => {
    const tripId = await newTrip('History is fixed')

    // The permitted update nulls authorship and changes nothing else. Anything
    // that also alters a field must stay refused, even for the service role.
    const rewrite = await svc!
      .from('trip_revisions')
      .update({ author_user_id: null, change_kind: 'edit' })
      .eq('trip_id', tripId)
      .eq('revision_no', 1)
    expect(rewrite.error, 'a revision was rewritten under cover of redaction').not.toBeNull()
    expect(rewrite.error!.message).toContain('trip_revisions_append_only')

    const direct = await svc!.from('trip_revisions').delete().eq('trip_id', tripId)
    expect(direct.error, 'a revision was hand-deleted while its trip still exists').not.toBeNull()
    expect(direct.error!.message).toContain('trip_revisions_append_only')

    const rev = await svc!
      .from('trip_revisions').select('change_kind').eq('trip_id', tripId).eq('revision_no', 1).single()
    expect(rev.data!.change_kind).toBe('create')
  })

  it('lets an account be deleted, taking its trips and revisions with it', async () => {
    // The whole point: `author_user_id` is ON DELETE SET NULL, so deleting an
    // account makes Postgres issue an UPDATE against the append-only log. If
    // that is refused, the account cannot be deleted at all.
    const doomed = await signedInClient(`p2-wp-doomed-${runId}@example.test`)
    const doomedId = (await doomed.auth.getUser()).data.user!.id

    const { data: tripId, error } = await doomed.rpc('create_trip', { p_title: 'Leaves with me' })
    expect(error, `create_trip failed: ${error?.message}`).toBeNull()

    const { error: deleteError } = await svc!.auth.admin.deleteUser(doomedId)
    expect(deleteError, `account deletion failed: ${deleteError?.message}`).toBeNull()

    expect((await svc!.from('trips').select('id').eq('id', tripId as string)).data).toEqual([])
    expect((await svc!.from('trip_revisions').select('id').eq('trip_id', tripId as string)).data).toEqual([])
    const user = await svc!.auth.admin.getUserById(doomedId)
    expect(user.data.user).toBeNull()
  })
})
