import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../lib/api/server';
import {object,uuid} from '../../../../../lib/api/validation';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const ctx=await apiContext(request,'trips',true);if(ctx.response)return ctx.response;
 const {id}=await params;if(!uuid(id))return failure('NOT_FOUND',404);
 try{
 const body=object(await boundedBody(request),['guideId','version','expectedRevision','requestId']);
 if(!uuid(body.guideId)||!uuid(body.requestId)||!Number.isSafeInteger(body.version)||!Number.isSafeInteger(body.expectedRevision))return failure('INVALID',400);
 const result=await ctx.client.rpc('adopt_guide_to_trip',{p_guide_id:body.guideId,p_version:body.version,p_trip_id:id,p_expected_revision:body.expectedRevision,p_request_id:body.requestId});
 return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
 }catch{return failure('INVALID',400)}
}
