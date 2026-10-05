import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
export async function GET(request:Request){
 const ctx=await apiContext(request,'ops');if(ctx.response)return ctx.response;
 const day=new URL(request.url).searchParams.get('day');
 if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return failure('INVALID',400);
 const r=await ctx.client.rpc('get_kinnso_monitoring',day?{p_day:day}:{});
 if(r.error)return backendFailure(r.error);
 const monthly=await ctx.client.rpc('get_kinnso_monthly_costs',day?{p_month:day.slice(0,7)+'-01'}:{});
 // Separately released monthly definitions must not hide existing measurements.
 // Authorization and other backend failures still fail closed.
 if(monthly.error&&!['PGRST202','42883'].includes(monthly.error.code))return backendFailure(monthly.error);
 return reply({ok:true,data:{...r.data,monthlyCosts:monthly.error?null:monthly.data}});
}
