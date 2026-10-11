import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
import {collaborationListQuery} from '../../../../lib/collaboration/list-query';
export async function GET(request:Request){
 const ctx=await apiContext(request,'creator');if(ctx.response)return ctx.response;
 let started=false;
 try{
  const params=new URL(request.url).searchParams,scope=params.get('scope')??'available';
  if(params.getAll('scope').length>1)return failure('INVALID',400);params.delete('scope');
  if(!['available','mine'].includes(scope))return failure('INVALID',400);
  const query=collaborationListQuery(params,scope as 'mine'|'available');
  started=true;const result=await ctx.client.rpc('query_kinnso_creator_missions',{p_scope:scope,p_query:query});
  return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
 }catch{return failure(started?'UNAVAILABLE':'INVALID',started?503:400);}
}
