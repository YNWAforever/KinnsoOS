import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../lib/api/server';
import {object,uuid} from '../../../lib/api/validation';
export async function POST(request:Request) {
 const ctx=await apiContext(request,'media',true);if(ctx.response)return ctx.response;
 try{
 const body=object(await boundedBody(request),['tripId','requestId','mime','size']);if(!uuid(body.tripId)||!uuid(body.requestId)||typeof body.mime!=='string'||!Number.isSafeInteger(body.size))return failure('INVALID',400);
 const result=await ctx.client.rpc('prepare_trip_upload',{p_trip_id:body.tripId,p_request_id:body.requestId,p_mime:body.mime,p_size:body.size});if(result.error)return backendFailure(result.error);
 const upload=await ctx.client.storage.from('kinnso-trip-private').createSignedUploadUrl(result.data.path);if(upload.error)return backendFailure(upload.error);
 return reply({ok:true,data:{...result.data,uploadUrl:upload.data.signedUrl}});
 }catch{return failure('INVALID',400)}
}
