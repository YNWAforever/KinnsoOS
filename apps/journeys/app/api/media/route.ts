import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../lib/api/server';
import {object,uuid} from '../../../lib/api/validation';
export async function POST(request:Request) {
 const ctx=await apiContext(request,'mediaUpload',true);if(ctx.response)return ctx.response;
 try{
 const body=object(await boundedBody(request),['tripId','requestId','mime','size']);if(!uuid(body.tripId)||!uuid(body.requestId)||typeof body.mime!=='string'||!Number.isSafeInteger(body.size))return failure('INVALID',400);
 const result=await ctx.client.rpc('prepare_trip_upload',{p_trip_id:body.tripId,p_request_id:body.requestId,p_mime:body.mime,p_size:body.size});if(result.error)return backendFailure(result.error);
 const storage=ctx.client.storage.from('kinnso-trip-private');
 const upload=await storage.createSignedUploadUrl(result.data.path);
 if(upload.error){
  // An immutable object may already exist after an interrupted response. The
  // owned RPC fixes the path; presence never replaces checksum finalization.
  let existing=false;try{const presence=await storage.exists(result.data.path);existing=presence.data===true&&!presence.error}catch{}
  if(existing)return reply({ok:true,data:{...result.data,uploadUrl:null,alreadyUploaded:true}});
  return backendFailure(upload.error);
 }
 return reply({ok:true,data:{...result.data,uploadUrl:upload.data.signedUrl}});
 }catch{return failure('INVALID',400)}
}
