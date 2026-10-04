import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertNonProductionTarget } from '../../../scripts/verify-kinnso-target'

assertNonProductionTarget(process.env)
const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_ANON_KEY!
const fixtureAdmin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anon = createClient(url, key)
const users: string[] = []
let a: SupabaseClient, b: SupabaseClient
async function actor() {
  const email = `b1-${randomUUID()}@example.test`
  const password = `B1!${randomUUID()}`
  const created = await fixtureAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  expect(created.error).toBeNull()
  users.push(created.data.user!.id)
  const client = createClient(url, key)
  const login = await client.auth.signInWithPassword({ email, password })
  expect(login.error).toBeNull()
  return client
}
beforeAll(async () => { a = await actor(); b = await actor() }, 60_000)
afterAll(async () => {
  for (const id of users) expect((await fixtureAdmin.auth.admin.deleteUser(id)).error).toBeNull()
}, 60_000)
async function create(requestId = randomUUID()) {
  const result = await a.rpc('create_trip_v2', { p_request_id: requestId,
    p_payload: { title: 'Synthetic command verification', timezone: 'Asia/Tokyo', startDate: null } })
  expect(result.error).toBeNull()
  return result.data
}
async function apply(trip: { id: string; revision: number }, command: unknown, requestId = randomUUID(), client = a) {
  return client.rpc('apply_trip_command', { p_trip_id: trip.id, p_expected_revision: trip.revision,
    p_request_id: requestId, p_command: command })
}
describe('aggregate commands on real A/B sessions', () => {
  it('create replay has one trip/revision and changed payload is refused', async () => {
    const request = randomUUID()
    const first = await create(request)
    expect(await create(request)).toEqual(first)
    const changed = await a.rpc('create_trip_v2', { p_request_id: request,
      p_payload: { title: 'Different', timezone: 'Asia/Tokyo', startDate: null } })
    expect(changed.error?.message).toContain('idempotency_conflict')
    expect(first.revision).toBe(1)
  })
  it('every day/stop/note command advances one aggregate revision; replay advances none', async () => {
    let trip = await create()
    const day = randomUUID(), stop = randomUUID(), request = randomUUID()
    const cmd = { type: 'addDay', id: day, offset: 0, title: 'First day' }
    const added = await apply(trip, cmd, request)
    expect(added.error).toBeNull()
    expect((await apply(trip, cmd, request)).data).toEqual(added.data)
    trip = added.data
    expect(trip.revision).toBe(2)
    const stopped = await apply(trip, { type: 'addStop', id: stop, dayId: day, position: 0,
      input: { title: 'Authored place', placeId: null, travellerNote: 'Private note',
        startMinuteOfDay: 540, durationMinutes: 60 } })
    expect(stopped.error).toBeNull()
    trip = stopped.data
    const noted = await apply(trip, { type: 'updateStop', id: stop, patch: { travellerNote: 'Changed privately' } })
    expect(noted.error).toBeNull()
    expect(noted.data.revision).toBe(4)
    expect(noted.data.days[0].stops[0].travellerNote).toBe('Changed privately')
  })
  it('two concurrent writes on the same revision have exactly one winner', async () => {
    const trip = await create()
    const results = await Promise.all([apply(trip, { type: 'patchTrip', patch: { title: 'A' } }),
      apply(trip, { type: 'patchTrip', patch: { title: 'B' } })])
    expect(results.filter(result => !result.error)).toHaveLength(1)
    expect(results.find(result => result.error)?.error?.message).toContain('trip_revision_conflict')
  })
  it('anonymous and B cannot mutate or read A; direct DML is denied', async () => {
    const trip = await create()
    expect((await apply(trip, { type: 'addDay', id: randomUUID(), offset: 0, title: 'Forbidden' }, randomUUID(), b)).error?.message)
      .toContain('trip_not_found')
    expect((await b.rpc('get_trip_snapshot', { p_trip_id: trip.id })).error?.message).toContain('trip_not_found')
    expect((await anon.rpc('get_trip_snapshot', { p_trip_id: trip.id })).error).not.toBeNull()
    for (const table of ['trips', 'trip_days', 'trip_stops']) {
      const direct = await a.from(table).insert({ id: randomUUID() })
      expect(direct.error?.code).toBe('42501')
    }
  })
  it('rejects cross-trip references and invented source fields atomically', async () => {
    const trip = await create(), other = await create(), day = randomUUID()
    expect((await apply(other, { type: 'addDay', id: day, offset: 0, title: 'Other' })).error).toBeNull()
    expect((await apply(trip, { type: 'addStop', id: randomUUID(), dayId: day, position: 0,
      input: { title: 'Wrong trip', placeId: null, travellerNote: '', startMinuteOfDay: null, durationMinutes: null } })).error)
      .not.toBeNull()
    expect((await apply(trip, { type: 'patchTrip', patch: { source: { creatorId: users[0] } } })).error).not.toBeNull()
    const reloaded = await a.rpc('get_trip_snapshot', { p_trip_id: trip.id })
    expect(reloaded.data.revision).toBe(1)
  })
  it('delete can replay after commit while B cannot discover the tombstone', async () => {
    const trip = await create(), request = randomUUID()
    const args = { p_trip_id: trip.id, p_expected_revision: trip.revision, p_request_id: request }
    const removed = await a.rpc('delete_trip_v2', args)
    expect(removed.error).toBeNull()
    expect((await a.rpc('delete_trip_v2', args)).data).toEqual(removed.data)
    expect((await b.rpc('delete_trip_v2', args)).error?.message).toContain('trip_not_found')
    expect((await a.rpc('get_trip_snapshot', { p_trip_id: trip.id })).error?.message).toContain('trip_not_found')
  })
})
