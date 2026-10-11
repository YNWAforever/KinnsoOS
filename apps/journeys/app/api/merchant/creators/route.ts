import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {campaignCommand} from '../../../../lib/merchants/campaigns';
import {discoveryQuery} from '../../../../lib/merchants/creator-discovery';
export async function GET(request:Request){
 const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;let started=false;
 try{
  const params=new URL(request.url).searchParams;
  if(params.getAll('id').length!==1||!uuid(params.get('id')))throw Error('INVALID');const merchantId=params.get('id');params.delete('id');
  let result;
  if(params.has('requestId')){if([...params.keys()].length!==1||!uuid(params.get('requestId')))throw Error('INVALID');started=true;result=await ctx.client.rpc('get_kinnso_merchant_creator_receipt',{p_merchant_id:merchantId,p_request_id:params.get('requestId')});}
  else {const query=discoveryQuery(params);started=true;result=await ctx.client.rpc('get_kinnso_merchant_creators',{p_merchant_id:merchantId,p_query:query});}
  return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
 }catch{return failure(started?'UNAVAILABLE':'INVALID',started?503:400);}
}
export async function POST(request:Request){
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;let started=false;
 try{const body=object(await boundedBody(request),['merchantId','command','requestId']);if(!uuid(body.merchantId)||!uuid(body.requestId))throw Error('INVALID');const command=campaignCommand(body.command);
  if(!['saveCreator','unsaveCreator','setSavedNote','inviteCreator'].includes(command.type))throw Error('INVALID');
  started=true;const result=await ctx.client.rpc('apply_kinnso_merchant_campaign_command',{p_merchant_id:body.merchantId,p_request_id:body.requestId,p_command:command});return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
 }catch{return failure(started?'UNAVAILABLE':'INVALID',started?503:400);}
}
