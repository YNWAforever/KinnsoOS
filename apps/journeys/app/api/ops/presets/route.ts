import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {presetFilter} from '../../../../lib/ops/queue-filters';
export async function POST(request:Request){const ctx=await apiContext(request,'ops',true);if(ctx.response)return ctx.response;
 let rpcStarted=false;
 try{const b=object(await boundedBody(request,8192),['id','expectedRevision','requestId','command']);
  if(!uuid(b.id)||!uuid(b.requestId)||!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0||Number(b.expectedRevision)>=2147483647)return failure('INVALID',400);
  const c=object(b.command,['type','name','filter']);let command;
  if(c.type==='save'){if(typeof c.name!=='string'||!c.name.trim()||c.name.trim().length>80)return failure('INVALID',400);command={type:'save',name:c.name.trim(),filter:presetFilter(c.filter)};}
  else if(c.type==='delete'&&Object.keys(c).length===1)command={type:'delete'};else return failure('INVALID',400);
  rpcStarted=true;const r=await ctx.client.rpc('command_kinnso_review_preset',{p_id:b.id,p_expected_revision:b.expectedRevision,p_request_id:b.requestId,p_command:command});
  return r.error?backendFailure(r.error):reply({ok:true,data:r.data});
 }catch{return rpcStarted?failure('UNAVAILABLE',503):failure('INVALID',400);}
}
