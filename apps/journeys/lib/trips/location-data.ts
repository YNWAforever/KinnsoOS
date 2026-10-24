import type {SupabaseClient} from '@supabase/supabase-js';
import type {TripSnapshot} from '../contracts/trips';
import type {TripDayLocations, TripLocation} from '../contracts/trip-locations';

type ReadResult = {
  data: TripDayLocations | null;
  error: {message: string; code?: string} | null;
};

export async function readDayLocations(client: SupabaseClient, tripId: string, dayId: string): Promise<ReadResult> {
  const snapshot = await client.rpc('get_trip_snapshot', {p_trip_id: tripId});
  if (snapshot.error) return {data: null, error: snapshot.error};
  const trip = snapshot.data as TripSnapshot;
  if (!trip || !Array.isArray(trip.days) || !Number.isInteger(trip.revision))
    return {data: null, error: {message: 'snapshot_unavailable'}};
  const day = trip.days.find(value => value.id === dayId);
  if (!day) return {data: null, error: {message: 'trip_not_found'}};
  const ids = [...new Set(day.stops.map(stop => stop.placeId).filter((id): id is string => id !== null))];
  const places: TripLocation[] = [];
  // Keep each URL bounded without silently dropping stops after a row cap.
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const result = await client.from('places').select('id,name,formatted_address,lat,lng')
      .in('id', batch).eq('status', 'active');
    if (result.error) return {data: null, error: result.error};
    for (const row of result.data ?? []) {
      if (!batch.includes(row.id) || typeof row.name !== 'string')
        return {data: null, error: {message: 'location_unavailable'}};
      const valid = typeof row.lat === 'number' && typeof row.lng === 'number' &&
        Number.isFinite(row.lat) && Number.isFinite(row.lng) && Math.abs(row.lat) <= 90 && Math.abs(row.lng) <= 180;
      places.push({placeId: row.id, name: row.name,
        address: typeof row.formatted_address === 'string' ? row.formatted_address : null,
        lat: valid ? row.lat : null, lng: valid ? row.lng : null});
    }
  }
  return {data: {tripId, dayId, revision: trip.revision, places}, error: null};
}
