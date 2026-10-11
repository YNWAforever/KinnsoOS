import{apiContext,backendFailure,failure,reply}from'../../../../lib/api/server';
import{uuid}from'../../../../lib/api/validation';
import{insightsQuery,insightsCsv}from'../../../../lib/merchants/insights';
export async function GET(request:Request){
 const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;
 const params=new URL(request.url).searchParams;
 if(params.getAll('id').length!==1||!uuid(params.get('id'))||params.getAll('format').length>1||params.has('format')&&params.get('format')!=='csv')return failure('INVALID',400);
 const exported=params.get('format')==='csv',filterParams=new URLSearchParams(params);filterParams.delete('id');filterParams.delete('format');let query;
 try{query=insightsQuery(filterParams);if(exported&&query.after)return failure('INVALID',400);}catch{return failure('INVALID',400);}
 try{const r=await ctx.client.rpc('get_kinnso_merchant_insights',{p_merchant_id:params.get('id'),p_query:query,p_export:exported});if(r.error)return backendFailure(r.error);return reply({ok:true,data:exported?{csv:insightsCsv(r.data)}:r.data});}catch{return failure('UNAVAILABLE',503);}
}
