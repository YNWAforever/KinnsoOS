import type {TripDay, TripSnapshot} from '../contracts/trips';
import type {ProgressAck, ProgressEntry, ProgressIntent, ProgressSnapshot, ProgressState} from '../contracts/trip-progress';

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 2147483647;
const state = (value: unknown): value is ProgressState =>
  typeof value === 'string' && ['pending', 'visited', 'skipped'].includes(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function progressEnvelope(value: unknown): ProgressIntent {
  const keys = ['requestId', 'stopId', 'state', 'expectedTripRevision', 'expectedProgressRevision'];
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key)) ||
      !uuid(value.requestId) || !uuid(value.stopId) || !state(value.state) ||
      !revision(value.expectedTripRevision, 1) || !revision(value.expectedProgressRevision))
    throw new Error('PROGRESS_INVALID');
  return Object.freeze({
    requestId: value.requestId.toLowerCase(), stopId: value.stopId.toLowerCase(), state: value.state,
    expectedTripRevision: value.expectedTripRevision, expectedProgressRevision: value.expectedProgressRevision,
  });
}

export function readProgressSnapshot(value: unknown, ownerId: string, tripId: string): ProgressSnapshot | null {
  if (!object(value) || !uuid(value.ownerId) || !uuid(value.tripId) ||
      value.ownerId.toLowerCase() !== ownerId.toLowerCase() || value.tripId.toLowerCase() !== tripId.toLowerCase() ||
      !revision(value.tripRevision, 1) || !revision(value.progressRevision) || !Array.isArray(value.entries)) return null;
  const seen = new Set<string>(), entries: ProgressEntry[] = [];
  for (const row of value.entries) {
    if (!object(row) || !uuid(row.stopId) || !state(row.state)) return null;
    const id = row.stopId.toLowerCase();
    if (seen.has(id)) return null;
    seen.add(id); entries.push({stopId: id, state: row.state});
  }
  return {ownerId: ownerId.toLowerCase(), tripId: tripId.toLowerCase(),
    tripRevision: value.tripRevision, progressRevision: value.progressRevision, entries};
}

export function readProgressAck(value: unknown, intent: ProgressIntent, ownerId: string, tripId: string): ProgressAck | null {
  if (!object(value) || value.requestId !== intent.requestId || typeof value.replayed !== 'boolean' ||
      !revision(value.appliedProgressRevision) ||
      value.appliedProgressRevision < intent.expectedProgressRevision ||
      value.appliedProgressRevision > intent.expectedProgressRevision + 1) return null;
  const snapshot = readProgressSnapshot(value.snapshot, ownerId, tripId);
  if (!snapshot || snapshot.progressRevision < value.appliedProgressRevision ||
      snapshot.tripRevision < intent.expectedTripRevision) return null;
  return {snapshot, requestId: intent.requestId, appliedProgressRevision: value.appliedProgressRevision, replayed: value.replayed};
}

export function makeProgressIntent(
  trip: Pick<TripSnapshot, 'id' | 'revision' | 'days'>, snapshot: ProgressSnapshot,
  stopId: string, desired: ProgressState, requestId: string,
): ProgressIntent {
  if (trip.id !== snapshot.tripId || trip.revision !== snapshot.tripRevision) throw new Error('PROGRESS_CONFLICT');
  if (!trip.days.some(day => day.stops.some(stop => stop.id === stopId))) throw new Error('STOP_NOT_FOUND');
  return progressEnvelope({requestId, stopId, state: desired,
    expectedTripRevision: trip.revision, expectedProgressRevision: snapshot.progressRevision});
}

export function acceptProgress(current: ProgressSnapshot | null, next: ProgressSnapshot): ProgressSnapshot {
  if (current && (next.ownerId !== current.ownerId || next.tripId !== current.tripId ||
      next.progressRevision < current.progressRevision || next.tripRevision < current.tripRevision)) return current;
  return next;
}

export function dayProgress(day: TripDay, entries: ProgressEntry[]) {
  const seen = new Set<string>();
  const stops = [...day.stops].sort((a, b) => a.position - b.position).filter(stop => {
    if (seen.has(stop.id)) return false;
    seen.add(stop.id); return true;
  });
  const recorded = new Map(entries.map(entry => [entry.stopId, entry.state]));
  const states = new Map(stops.map(stop => [stop.id, recorded.get(stop.id) ?? 'pending']));
  const visited = stops.filter(stop => states.get(stop.id) === 'visited').length;
  const skipped = stops.filter(stop => states.get(stop.id) === 'skipped').length;
  const completed = visited + skipped;
  return {states, total: stops.length, visited, skipped, completed,
    complete: stops.length > 0 && completed === stops.length,
    nextStopId: stops.find(stop => states.get(stop.id) === 'pending')?.id ?? null};
}
