import {apiContext, backendFailure, failure, reply} from '../../../../../lib/api/server';
import {uuid} from '../../../../../lib/api/validation';
import {readDayLocations} from '../../../../../lib/trips/location-data';

export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  const ctx = await apiContext(request, 'trips');
  if (ctx.response) return ctx.response;
  const {id} = await params;
  const dayId = new URL(request.url).searchParams.get('day');
  if (!uuid(id) || !uuid(dayId)) return failure('NOT_FOUND', 404);
  const result = await readDayLocations(ctx.client, id, dayId);
  return result.error ? backendFailure(result.error) : reply({ok: true, data: result.data});
}
