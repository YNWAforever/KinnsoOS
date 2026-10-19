import {apiContext, backendFailure, boundedBody, failure, reply} from '../../../../../lib/api/server';
import {uuid} from '../../../../../lib/api/validation';
import {progressEnvelope, readProgressAck, readProgressSnapshot} from '../../../../../lib/trips/progress';

type Context = {params: Promise<{id: string}>};

export async function GET(request: Request, {params}: Context) {
  const ctx = await apiContext(request, 'trips');
  if (ctx.response) return ctx.response;
  const {id} = await params;
  if (!uuid(id)) return failure('NOT_FOUND', 404);
  try {
    const result = await ctx.client.rpc('get_trip_progress', {p_trip_id: id});
    if (result.error) return backendFailure(result.error);
    const data = readProgressSnapshot(result.data, ctx.actor.id, id);
    return data ? reply({ok: true, data}) : failure('UNAVAILABLE', 503);
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

export async function POST(request: Request, {params}: Context) {
  const ctx = await apiContext(request, 'trips', true);
  if (ctx.response) return ctx.response;
  const {id} = await params;
  if (!uuid(id)) return failure('NOT_FOUND', 404);
  let intent;
  try { intent = progressEnvelope(await boundedBody(request, 4096)) }
  catch { return failure('INVALID', 400) }
  try {
    const result = await ctx.client.rpc('apply_trip_progress', {
      p_trip_id: id, p_request_id: intent.requestId, p_stop_id: intent.stopId, p_state: intent.state,
      p_expected_trip_revision: intent.expectedTripRevision, p_expected_progress_revision: intent.expectedProgressRevision,
    });
    if (result.error) return backendFailure(result.error);
    const data = readProgressAck(result.data, intent, ctx.actor.id, id);
    return data ? reply({ok: true, data}) : failure('UNAVAILABLE', 503);
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}
