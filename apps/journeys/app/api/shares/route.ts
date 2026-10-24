import {shareIntent,shareReceipt} from '../../../lib/trips/share-receipt-api';
import {newShareToken} from '../../../lib/trips/share-receipt-crypto';
import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../lib/api/server';
import {object,uuid} from '../../../lib/api/validation';
export async function GET(request:Request) {
 const ctx=await apiContext(request,'sharing');if(ctx.response)return ctx.response;
 const tripId=new URL(request.url).searchParams.get('tripId');if(!uuid(tripId))return failure('INVALID',400);
 const result=await ctx.client.rpc('list_trip_shares',{p_trip_id:tripId});return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
}
export async function POST(request:Request) {
 const ctx=await apiContext(request,'shareRecovery',true);if(ctx.response)return ctx.response;
 let intent;
 try{
  intent=shareIntent(object(await boundedBody(request),['requestId','tripId','stopIds','mediaIds','expiresAt']));
  if(new Date(intent.expiresAt).toISOString()!==intent.expiresAt)return failure('INVALID',400);
 }catch{return failure('INVALID',400);}
 try{
  const token=newShareToken({actorId:ctx.actor.id,tripId:intent.tripId,requestId:intent.requestId});
  const result=await ctx.client.rpc('create_trip_share_v2',{p_request_id:intent.requestId,p_trip_id:intent.tripId,p_stop_ids:intent.stopIds,p_media_ids:intent.mediaIds,p_expires_at:intent.expiresAt,p_token_hash:token.tokenHash,p_envelope:token.envelope});
  if(result.error)return backendFailure(result.error);
  return reply({ok:true,data:shareReceipt(result.data,ctx.actor.id,intent.tripId,intent.requestId)});
 }catch{return failure('UNAVAILABLE',503);}
}
