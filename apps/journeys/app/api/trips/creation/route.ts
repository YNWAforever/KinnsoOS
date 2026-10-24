import {apiContext, backendFailure, failure, reply} from '../../../../lib/api/server';
import {uuid} from '../../../../lib/api/validation';

export async function GET(request: Request) {
  try {
    const ctx = await apiContext(request,'trips');
    if (ctx.response) return ctx.response;
    const url = new URL(request.url);
    const requestId = url.searchParams.get('requestId');
    if (url.search.length > 128 || url.searchParams.size !== 1 || !uuid(requestId))
      return failure('INVALID',400);
    const result = await ctx.client.rpc('get_trip_creation_receipt',{p_request_id:requestId});
    if (result.error) return backendFailure(result.error);
    const tripId: unknown = result.data?.tripId;
    if (tripId !== null && !uuid(tripId)) return failure('UNAVAILABLE',503);
    return reply({ok:true,data:{tripId}});
  } catch {
    return failure('UNAVAILABLE',503);
  }
}
