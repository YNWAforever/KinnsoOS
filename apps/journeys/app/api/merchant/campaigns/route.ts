import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {campaignCommand} from '../../../../lib/merchants/campaigns';
export async function GET(request:Request){
 const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;
 const query=new URL(request.url).searchParams,allowed=['id','after','campaignId','participantsAfter','submissionsAfter','branchesAfter'];
 if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1)||!uuid(query.get('id'))||allowed.slice(1).some(key=>query.has(key)&&!uuid(query.get(key)))||(!query.has('campaignId')&&(query.has('participantsAfter')||query.has('submissionsAfter'))))return failure('INVALID',400);
 try{const r=await ctx.client.rpc('get_kinnso_merchant_campaigns',{p_merchant_id:query.get('id'),p_after:query.get('after'),p_campaign_id:query.get('campaignId'),p_participant_after:query.get('participantsAfter'),p_submission_after:query.get('submissionsAfter'),p_branch_after:query.get('branchesAfter')});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}
}
export async function POST(request:Request){
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 let body:Record<string,unknown>,command;try{body=object(await boundedBody(request,65536),['merchantId','requestId','command']);if(!uuid(body.merchantId)||!uuid(body.requestId))return failure('INVALID',400);command=campaignCommand(body.command);}catch{return failure('INVALID',400);}
 try{const r=await ctx.client.rpc('apply_kinnso_merchant_campaign_command',{p_merchant_id:body.merchantId,p_request_id:body.requestId,p_command:command});return r.error?backendFailure(r.error):reply({ok:true,data:r.data});}catch{return failure('UNAVAILABLE',503);}
}
