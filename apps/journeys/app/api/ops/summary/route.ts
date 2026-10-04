import { apiContext, backendFailure, failure, reply } from '../../../../lib/api/server';
import { uuid } from '../../../../lib/api/validation';
export async function GET(request:Request){const ctx=await apiContext(request,'ops');if(ctx.response)return ctx.response;
 const id=new URL(request.url).searchParams.get('missionId');if(id&&!uuid(id))return failure('INVALID',400);
 const r=await ctx.client.rpc('get_kinnso_settlement_summary',{p_mission_id:id});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}
