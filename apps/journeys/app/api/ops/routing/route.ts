import {apiContext,backendFailure,reply} from '../../../../lib/api/server';
export async function GET(request:Request){const ctx=await apiContext(request,'ops');if(ctx.response)return ctx.response;
 const r=await ctx.client.rpc('get_kinnso_review_routing');return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
}
