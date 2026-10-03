import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../lib/api/server';
import {object,uuid} from '../../../../../lib/api/validation';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const ctx=await apiContext(request,'trips',true);if(ctx.response)return ctx.response;
 const {id}=await params;if(!uuid(id))return failure('NOT_FOUND',404);
 try{const body=object(await boundedBody(request,4096),['stopId','reason']);if(!uuid(body.stopId)||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>2000)return failure('INVALID',400);const trip=await ctx.client.rpc('get_trip_snapshot',{p_trip_id:id});if(trip.error)return backendFailure(trip.error);const stop=trip.data.days.flatMap((day:{stops:{id:string;placeId:string|null}[]})=>day.stops).find((s:{id:string})=>s.id===body.stopId);if(!stop?.placeId)return failure('INVALID',400);const report=await ctx.client.rpc('report_kinnso_place',{p_place_id:stop.placeId,p_reason:body.reason});return report.error?backendFailure(report.error):reply({ok:true,data:report.data})}catch{return failure('INVALID',400)}
}
