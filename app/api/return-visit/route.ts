import {apiContext,backendFailure,reply} from '../../../lib/api/server';
export async function POST(request:Request){const ctx=await apiContext(request,'trips',true);if(ctx.response)return ctx.response;const result=await ctx.client.rpc('record_kinnso_return_visit');return result.error?backendFailure(result.error):reply({ok:true,data:result.data})}
