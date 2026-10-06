import {successEvent,timedRpc} from '../../../lib/telemetry/server';
import { apiContext,backendFailure,boundedBody,failure,reply } from '../../../lib/api/server';
import { object,uuid } from '../../../lib/api/validation';
export async function GET(request:Request) {
  const ctx = await apiContext(request,'bookmarks'); if (ctx.response) return ctx.response;
  const params=new URL(request.url).searchParams,guideId=params.get('guideId'),before=params.get('before'),beforeGuide=params.get('beforeGuide');
  // Only a timestamp and UUID can enter the PostgREST composite filter.
  if ((guideId!==null&&!uuid(guideId)) || (before!==null||beforeGuide!==null) &&
    (guideId!==null||!uuid(beforeGuide)||!before||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(before)||!Number.isFinite(Date.parse(before)))) return failure('INVALID',400);
  let query=ctx.client.from('guide_saves').select('guide_id,created_at,guides(id,slug,title,summary,status)').eq('traveler_user_id',ctx.actor.id).order('created_at',{ascending:false}).order('guide_id').limit(101);
  if(guideId)query=query.eq('guide_id',guideId).limit(1);
  if(before)query=query.or(`created_at.lt.${before},and(created_at.eq.${before},guide_id.gt.${beforeGuide})`);
  const result=await query;
  if(result.error)return backendFailure(result.error);
  const last=result.data[99];
  return reply({ok:true,data:result.data.slice(0,100),nextCursor:result.data.length>100?{createdAt:last.created_at,guideId:last.guide_id}:null});
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
