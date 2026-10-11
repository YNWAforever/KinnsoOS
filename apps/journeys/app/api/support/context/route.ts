import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
import {supportMissionQuery} from '../../../../lib/collaboration/support-context';
export async function GET(request:Request){const ctx=await apiContext(request,'notifications');if(ctx.response)return ctx.response;let id:string;
 try{id=supportMissionQuery(new URL(request.url).searchParams);}catch{return failure('INVALID',400);}
 try{const r=await ctx.client.rpc('get_kinnso_support_context',{p_mission_id:id});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}}
