import {successEvent,timedRpc} from '../../../lib/telemetry/server';
import { apiContext,backendFailure,boundedBody,failure,reply } from '../../../lib/api/server';
import { object,uuid } from '../../../lib/api/validation';
export async function GET(request:Request) {
  const ctx = await apiContext(request,'bookmarks'); if (ctx.response) return ctx.response;
  const result = await ctx.client.from('guide_saves').select('guide_id,created_at,guides(id,slug,title,summary,status)').eq('traveler_user_id',ctx.actor.id).order('created_at',{ascending:false}).limit(100);
  return result.error ? backendFailure(result.error) : reply({ok:true,data:result.data});
}
export async function POST(request:Request) {
  const ctx = await apiContext(request,'bookmarks',true); if (ctx.response) return ctx.response;
  try {
    const body = object(await boundedBody(request),['guideId','desiredState','requestId']);
    if (!uuid(body.guideId) || !uuid(body.requestId) || typeof body.desiredState !== 'boolean') return failure('INVALID',400);
    const result = await timedRpc(ctx.client,'kinnso_bookmark',{p_guide_id:body.guideId,p_desired_state:body.desiredState,p_request_id:body.requestId},ctx.actor);
    if(!result.error&&body.desiredState===true)await successEvent(ctx.actor,'bookmark_saved',body.requestId);
    return result.error ? backendFailure(result.error) : reply({ok:true,data:result.data});
  } catch { return failure('INVALID',400); }
}
