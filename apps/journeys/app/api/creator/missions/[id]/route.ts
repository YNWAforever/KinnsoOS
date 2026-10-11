import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../lib/api/server';
import {object,uuid} from '../../../../../lib/api/validation';
import {creatorMissionCommand,creatorQuery} from '../../../../../lib/creators/collaboration-validation';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 const ctx=await apiContext(request,'creator');if(ctx.response)return ctx.response;
 const{id}=await context.params;if(!uuid(id))return failure('INVALID',400);
 let started=false;
 try{
  const query=creatorQuery(request,['after']);
  started=true;const result=await ctx.client.rpc('get_kinnso_creator_mission',{p_mission_id:id,p_submission_after:query.get('after')});
  return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
 }catch{return failure(started?'UNAVAILABLE':'INVALID',started?503:400);}
}
export async function POST(request:Request,context:Context){
 const ctx=await apiContext(request,'creator',true);if(ctx.response)return ctx.response;
 const{id}=await context.params;if(!uuid(id))return failure('INVALID',400);
 let started=false;
 try{
  creatorQuery(request,[]);const body=object(await boundedBody(request,16384),['command','requestId']);
  if(!uuid(body.requestId))return failure('INVALID',400);
  const command=creatorMissionCommand(body.command);started=true;
  const result=await ctx.client.rpc('apply_kinnso_creator_mission_command',{p_mission_id:id,p_request_id:body.requestId,p_command:command});
  return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
 }catch{return failure(started?'UNAVAILABLE':'INVALID',started?503:400);}
}
