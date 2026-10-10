import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
import {creatorQuery} from '../../../../lib/creators/collaboration-validation';
export async function GET(request:Request){
 const ctx=await apiContext(request,'creator');if(ctx.response)return ctx.response;
 let started=false;
 try{
  const query=creatorQuery(request,['section','after'],'earnings'),section=query.get('section')??'settled';
  if(!['settled','tracked','payouts'].includes(section))return failure('INVALID',400);
  started=true;const result=await ctx.client.rpc('get_kinnso_creator_earnings',{p_section:section,p_after:query.get('after')});
  return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
 }catch{return failure(started?'UNAVAILABLE':'INVALID',started?503:400);}
}
