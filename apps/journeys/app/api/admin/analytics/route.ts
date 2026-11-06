import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
import {analyticsWindow,projectAnalyticsReport} from '../../../../lib/operational-api/analytics-report';

export async function GET(request:Request){
 const ctx=await apiContext(request,'ops');if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('ops'))return failure('FORBIDDEN',403);
 const window=analyticsWindow(new URL(request.url).searchParams);
 if(!window)return failure('INVALID',400);
 const result=await ctx.client.rpc('admin_traveller_analytics_report',{p_window_start:window.from,p_window_end:window.to});
 if(result.error)return backendFailure(result.error);
 return reply(projectAnalyticsReport((result.data??[]) as unknown[],window));
}
