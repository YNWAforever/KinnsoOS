import type {TripDay, TripSnapshot} from '../contracts/trips';

export function dayDate(startDate: string | null, offset: number): string | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isInteger(offset)) return null;
  const start = new Date(startDate + 'T00:00:00.000Z');
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== startDate) return null;
  start.setUTCDate(start.getUTCDate() + offset);
  return Number.isFinite(start.getTime()) ? start.toISOString().slice(0, 10) : null;
}

export function selectTripDay(
  trip: Pick<TripSnapshot, 'startDate' | 'timezone' | 'days'>,
  now: Date,
  manualDayId: string | null = null,
): {today: string | null; day: TripDay | null; reason: 'undated' | 'outside' | 'invalid' | null} {
  let today: string;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: trip.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    today = `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return {today: null, day: null, reason: 'invalid'};
  }
  if (manualDayId) return {today, day: trip.days.find(day => day.id === manualDayId) ?? null, reason: null};
  if (!trip.startDate) return {today, day: null, reason: 'undated'};
  const day = trip.days.find(value => dayDate(trip.startDate, value.offset) === today) ?? null;
  return {today, day, reason: day ? null : 'outside'};
}

export function orderedStops(day: TripDay) {
  return [...day.stops].sort((a, b) => a.position - b.position);
}

export function clockLabel(minute: number | null): string | null {
  if (minute === null || !Number.isInteger(minute) || minute < 0 || minute > 1439) return null;
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function navigationUrl(place: {lat: number | null; lng: number | null}): string | null {
  if (typeof place.lat !== 'number' || typeof place.lng !== 'number' ||
      !Number.isFinite(place.lat) || !Number.isFinite(place.lng) ||
      Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return null;
  const query = new URLSearchParams({api: '1', destination: `${place.lat},${place.lng}`});
  return 'https://www.google.com/maps/dir/?' + query;
}
