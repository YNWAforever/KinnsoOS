import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../lib/api/server';
import {object,uuid} from '../../../lib/api/validation';
export async function GET(request:Request) {
 const ctx=await apiContext(request,'sharing');if(ctx.response)return ctx.response;
 const tripId=new URL(request.url).searchParams.get('tripId');if(!uuid(tripId))return failure('INVALID',400);
 const result=await ctx.client.rpc('list_trip_shares',{p_trip_id:tripId});return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
}
export async function POST(request:Request) {
 const ctx=await apiContext(request,'sharing',true);if(ctx.response)return ctx.response;
 try{
 const body=object(await boundedBody(request),['tripId','stopIds','mediaIds','expiresAt']);
 if(!uuid(body.tripId)||!Array.isArray(body.stopIds)||body.stopIds.some(id=>!uuid(id))||!Array.isArray(body.mediaIds)||body.mediaIds.some(id=>!uuid(id))||typeof body.expiresAt!=='string')return failure('INVALID',400);
 const result=await ctx.client.rpc('create_trip_share',{p_trip_id:body.tripId,p_stop_ids:body.stopIds,p_media_ids:body.mediaIds,p_expires_at:body.expiresAt});
 if(result.error)return backendFailure(result.error);
 return reply({ok:true,data:{id:result.data.id,url:process.env.KINNSO_SITE_URL+'/share/'+result.data.token,projection:result.data.projection}});
 }catch{return failure('INVALID',400)}
}
