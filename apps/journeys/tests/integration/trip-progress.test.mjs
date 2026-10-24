// Source-only until the coordinator runs the fresh owned CI migration set.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

const target = verifyTestTarget();
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || target.projectRef !== 'kinnsoos-b1-20261002')
  throw Error('BLOCKED: progress integration cases require the fresh owned CI stack, never pilot/shared targets');
const {fixture, admin, anonymous} = await import('./local-fixtures.mjs');

async function ok(promise) {
  const result = await promise;
  assert.equal(result.error, null);
  return result.data;
}
async function denied(promise, code) {
  const result = await promise;
  assert.ok(result.error, 'the operation must be refused');
  if (code) assert.match(result.error.message, code);
  return result;
}
const read = (actor, tripId) => actor.client.rpc('get_trip_progress', {p_trip_id: tripId});
const apply = (actor, args) => actor.client.rpc('apply_trip_progress', args);
const intent = (trip, stopId, progressRevision = 0, state = 'visited', requestId = randomUUID()) => ({
  p_trip_id: trip.id, p_request_id: requestId, p_stop_id: stopId, p_state: state,
  p_expected_trip_revision: trip.revision, p_expected_progress_revision: progressRevision,
});
const command = (actor, trip, value) => ok(actor.client.rpc('apply_trip_command', {
  p_trip_id: trip.id, p_expected_revision: trip.revision, p_request_id: randomUUID(), p_command: value,
}));
async function savedTrip(actor) {
  let trip = await ok(actor.client.rpc('create_trip_v2', {
    p_request_id: randomUUID(), p_payload: {title: 'Synthetic progress trip', timezone: 'Asia/Hong_Kong', startDate: null},
  }));
  const dayId = randomUUID(), stops = [randomUUID(), randomUUID()];
  trip = await command(actor, trip, {type: 'addDay', id: dayId, offset: 0, title: 'Synthetic day'});
  for (const [position, id] of stops.entries()) trip = await command(actor, trip, {
    type: 'addStop', id, dayId, position,
    input: {title: `Synthetic stop ${position}`, travellerNote: 'PRIVATE_PROGRESS_NOTE',
      placeId: null, startMinuteOfDay: 540 + position * 60, durationMinutes: 30},
  });
  return {trip, dayId, stops};
}
function projection(snapshot, ownerId, tripId) {
  assert.deepEqual(Object.keys(snapshot).sort(), ['ownerId', 'tripId', 'tripRevision', 'progressRevision', 'entries'].sort());
  assert.equal(snapshot.ownerId, ownerId);
  assert.equal(snapshot.tripId, tripId);
  for (const row of snapshot.entries) {
    assert.deepEqual(Object.keys(row).sort(), ['state', 'stopId']);
    assert.ok(['pending', 'visited', 'skipped'].includes(row.state));
  }
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE_PROGRESS_NOTE'), false);
}
const entryStates = snapshot => Object.fromEntries(snapshot.entries.map(row => [row.stopId, row.state]));

test('owner progress reads and visited/skipped/undo saves preserve private trip content and its revision', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), {trip, stops} = await savedTrip(owner);
    const before = await ok(owner.client.rpc('get_trip_snapshot', {p_trip_id: trip.id}));
    const initial = await ok(read(owner, trip.id));
    assert.deepEqual(initial, {ownerId: owner.id, tripId: trip.id, tripRevision: trip.revision, progressRevision: 0, entries: []});
    const visited = await ok(apply(owner, intent(trip, stops[0])));
    assert.equal(visited.replayed, false);
    assert.equal(visited.appliedProgressRevision, 1);
    const skipped = await ok(apply(owner, intent(trip, stops[1], 1, 'skipped')));
    assert.equal(skipped.snapshot.progressRevision, 2);
    const undone = await ok(apply(owner, intent(trip, stops[0], 2, 'pending')));
    assert.equal(undone.appliedProgressRevision, 3);
    assert.deepEqual(entryStates(undone.snapshot), {[stops[0]]: 'pending', [stops[1]]: 'skipped'});
    projection(undone.snapshot, owner.id, trip.id);
    assert.deepEqual(await ok(read(owner, trip.id)), undone.snapshot);
    assert.deepEqual(await ok(owner.client.rpc('get_trip_snapshot', {p_trip_id: trip.id})), before);
  } finally { await f.cleanup() }
});

test('outsiders, operators and anonymous callers cannot read or mutate the owner progress or its private tables', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), outsider = await f.actor(), operator = await f.actor();
    const {trip, stops} = await savedTrip(owner);
    await ok(admin.from('kinnso_ops_members').insert({user_id: operator.id, status: 'active', display_name: 'Synthetic progress operator'}));
    await ok(apply(owner, intent(trip, stops[0])));
    for (const actor of [outsider, operator]) {
      await denied(read(actor, trip.id), /trip_not_found/);
      await denied(apply(actor, intent(trip, stops[0], 1)), /trip_not_found/);
    }
    await denied(anonymous.rpc('get_trip_progress', {p_trip_id: trip.id}));
    await denied(anonymous.rpc('apply_trip_progress', intent(trip, stops[0], 1)));
    for (const client of [owner.client, outsider.client, anonymous]) for (const table of [
      'trip_progress_heads', 'trip_stop_progress', 'trip_progress_requests',
    ]) await denied(client.schema('kinnso_internal').from(table).select('*'));
    assert.equal((await ok(read(owner, trip.id))).progressRevision, 1);
  } finally { await f.cleanup() }
});

test('trip and progress CAS reject stale requests, including no-ops, while fresh no-ops retain their revision', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), {trip, stops} = await savedTrip(owner);
    await ok(apply(owner, intent(trip, stops[0])));
    await denied(apply(owner, intent(trip, stops[1])), /progress_revision_conflict/);
    await denied(apply(owner, intent(trip, stops[0])), /progress_revision_conflict/);
    const noOpIntent = intent(trip, stops[0], 1);
    const noOp = await ok(apply(owner, noOpIntent));
    assert.equal(noOp.appliedProgressRevision, 1);
    assert.equal(noOp.snapshot.progressRevision, 1);
    assert.equal((await ok(apply(owner, noOpIntent))).replayed, true);
    const changedTrip = await command(owner, trip, {type: 'patchTrip', patch: {title: 'Synthetic revised trip'}});
    await denied(apply(owner, intent(trip, stops[1], 1)), /trip_revision_conflict/);
    const fresh = await ok(apply(owner, intent(changedTrip, stops[1], 1, 'skipped')));
    assert.equal(fresh.snapshot.tripRevision, changedTrip.revision);
    assert.equal(fresh.snapshot.progressRevision, 2);
    const pending = await savedTrip(owner), pendingIntent = intent(pending.trip, pending.stops[0], 0, 'pending');
    assert.equal((await ok(apply(owner, pendingIntent))).appliedProgressRevision, 0);
    assert.equal((await ok(apply(owner, pendingIntent))).replayed, true);
  } finally { await f.cleanup() }
});

test('an actor/request receipt rejects changed payloads even when the replacement revisions match', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), {trip, stops} = await savedTrip(owner);
    const original = intent(trip, stops[0]);
    await ok(apply(owner, original));
    for (const patch of [
      {p_state: 'skipped'}, {p_stop_id: stops[1]},
      {p_state: 'skipped', p_expected_progress_revision: 1},
      {p_expected_trip_revision: trip.revision + 1},
    ]) await denied(apply(owner, {...original, ...patch}), /idempotency_conflict/);
    const otherTrip = await savedTrip(owner);
    await denied(apply(owner, {...intent(otherTrip.trip, otherTrip.stops[0]), p_request_id: original.p_request_id}), /idempotency_conflict/);
    const otherOwner = await f.actor(), independent = await savedTrip(otherOwner);
    const sameId = await ok(apply(otherOwner, intent(independent.trip, independent.stops[0], 0, 'visited', original.p_request_id)));
    assert.equal(sameId.replayed, false, 'request identity is scoped to its authenticated actor');
    assert.deepEqual(entryStates(await ok(read(owner, trip.id))), {[stops[0]]: 'visited'});
  } finally { await f.cleanup() }
});

test('a lost-ACK replay confirms its original revision but reads newer progress and trip content without reverting either', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), {trip, stops} = await savedTrip(owner);
    const original = intent(trip, stops[0]);
    await ok(apply(owner, original));
    await ok(apply(owner, intent(trip, stops[1], 1, 'skipped')));
    await ok(apply(owner, intent(trip, stops[0], 2, 'pending')));
    const changedTrip = await command(owner, trip, {type: 'patchTrip', patch: {title: 'Synthetic newer title'}});
    const replay = await ok(apply(owner, original));
    assert.equal(replay.requestId, original.p_request_id);
    assert.equal(replay.replayed, true);
    assert.equal(replay.appliedProgressRevision, 1);
    assert.equal(replay.snapshot.progressRevision, 3);
    assert.equal(replay.snapshot.tripRevision, changedTrip.revision);
    assert.deepEqual(entryStates(replay.snapshot), {[stops[0]]: 'pending', [stops[1]]: 'skipped'});
    assert.deepEqual(await ok(read(owner, trip.id)), replay.snapshot);
    assert.deepEqual(await ok(owner.client.rpc('get_trip_snapshot', {p_trip_id: trip.id})), changedTrip);
  } finally { await f.cleanup() }
});

test('concurrent same-intent retries commit once and competing fresh requests have one progress CAS winner', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), {trip, stops} = await savedTrip(owner), original = intent(trip, stops[0]);
    const retries = await Promise.all(Array.from({length: 4}, () => apply(owner, original)));
    for (const result of retries) {
      const ack = await ok(Promise.resolve(result));
      assert.equal(ack.appliedProgressRevision, 1);
      assert.equal(ack.snapshot.progressRevision, 1);
    }
    assert.equal(retries.filter(result => result.data.replayed === false).length, 1);
    const raced = await Promise.all([
      apply(owner, intent(trip, stops[0], 1, 'skipped')),
      apply(owner, intent(trip, stops[1], 1)),
    ]);
    assert.equal(raced.filter(result => result.error === null).length, 1);
    assert.equal(raced.filter(result => result.error?.message === 'progress_revision_conflict').length, 1);
    assert.equal((await ok(read(owner, trip.id))).progressRevision, 2);
  } finally { await f.cleanup() }
});

test('foreign or deleted stops cannot receive new progress, and old receipts do not recreate a removed stop or trip', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), {trip, stops} = await savedTrip(owner), other = await savedTrip(owner);
    await denied(apply(owner, intent(trip, other.stops[0])), /trip_not_found/);
    const original = intent(trip, stops[0]);
    await ok(apply(owner, original));
    const changedTrip = await command(owner, trip, {type: 'removeStop', id: stops[0]});
    const current = await ok(read(owner, trip.id));
    assert.equal(current.progressRevision, 1);
    assert.deepEqual(current.entries, []);
    await denied(apply(owner, intent(changedTrip, stops[0], 1)), /trip_not_found/);
    const replay = await ok(apply(owner, original));
    assert.equal(replay.replayed, true);
    assert.equal(replay.appliedProgressRevision, 1);
    assert.deepEqual(replay.snapshot, current);
    await ok(owner.client.rpc('delete_trip_v2', {p_trip_id: trip.id, p_expected_revision: changedTrip.revision, p_request_id: randomUUID()}));
    await denied(read(owner, trip.id), /trip_not_found/);
    await denied(apply(owner, original), /trip_not_found/);
    await denied(apply(owner, intent(other.trip, other.stops[0], 0, 'visited', original.p_request_id)), /idempotency_conflict/);
  } finally { await f.cleanup() }
});

test('invalid progress commands leave saved progress unchanged', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), {trip, stops} = await savedTrip(owner);
    const before = await ok(read(owner, trip.id));
    for (const patch of [
      {p_request_id: null}, {p_stop_id: null}, {p_state: null}, {p_state: 'arrived'},
      {p_expected_trip_revision: 0}, {p_expected_trip_revision: null},
      {p_expected_progress_revision: -1}, {p_expected_progress_revision: null},
    ]) await denied(apply(owner, {...intent(trip, stops[0]), ...patch}), /invalid_command/);
    assert.deepEqual(await ok(read(owner, trip.id)), before);
  } finally { await f.cleanup() }
});

test('a retained unexpired JWT cannot read, write or replay progress after its current Auth session is revoked', async () => {
  const f = await fixture();
  try {
    const owner = await f.actor(), {trip, stops} = await savedTrip(owner), original = intent(trip, stops[0]);
    await ok(apply(owner, original));
    const {session} = await ok(owner.client.auth.getSession());
    const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
    assert.ok(claims.exp * 1000 > Date.now());
    assert.ok(claims.session_id);
    assert.equal((await admin.auth.admin.signOut(session.access_token, 'local')).error, null);
    const retained = await ok(owner.client.auth.getSession());
    assert.equal(retained.session.access_token, session.access_token, 'exercise the stale JWT rather than a locally cleared client');
    await denied(read(owner, trip.id), /unauthenticated/);
    await denied(apply(owner, original), /unauthenticated/);
    await denied(apply(owner, intent(trip, stops[1], 1)), /unauthenticated/);
  } finally { await f.cleanup() }
});

test('private progress on an adopted itinerary never alters its published guide version', async () => {
  const f = await fixture();
  try {
    const author = await f.actor(true), owner = await f.actor(), guideId = await f.guide(author);
    await ok(author.client.rpc('publish_guide_version', {
      p_guide_id: guideId, p_expected_version: 0, p_request_id: randomUUID(),
      p_content: {days: [{offset: 0, title: 'Synthetic source day', stops: [{title: 'Synthetic source stop',
        description: 'Original published source text', placeId: null, startMinuteOfDay: 600, durationMinutes: 30}]}]},
    }));
    const published = await ok(anonymous.from('guide_versions').select('*').eq('guide_id', guideId).eq('version', 1));
    assert.equal(published.length, 1);
    const created = await ok(owner.client.rpc('create_trip_v2', {p_request_id: randomUUID(), p_payload: {title: 'Synthetic adopted progress trip', timezone: 'UTC'}}));
    const adopted = await ok(owner.client.rpc('adopt_guide_to_trip', {p_guide_id: guideId, p_version: 1,
      p_trip_id: created.id, p_expected_revision: created.revision, p_request_id: randomUUID()}));
    const stop = adopted.days[0].stops[0];
    const trip = await command(owner, adopted, {type: 'updateStop', id: stop.id, patch: {travellerNote: 'PRIVATE_PROGRESS_NOTE'}});
    const ack = await ok(apply(owner, intent(trip, stop.id)));
    projection(ack.snapshot, owner.id, trip.id);
    assert.deepEqual(await ok(owner.client.rpc('get_trip_snapshot', {p_trip_id: trip.id})), trip);
    assert.deepEqual(await ok(anonymous.from('guide_versions').select('*').eq('guide_id', guideId).eq('version', 1)), published);
  } finally { await f.cleanup() }
});
