import {apiContext,boundedBody,reply,failure,backendFailure} from '../api/server';
import {capabilities} from '../contracts/capabilities';
import {authorizeStudio,parseStudioCommand,studioUuid} from './policy';
type RpcName='apply_kinnso_studio_command'|'get_kinnso_studio_thread'|'list_kinnso_studio_threads'|'get_kinnso_studio_request'|'get_kinnso_studio_guide_context';
type RpcClient={rpc:(name:RpcName,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string;code?:string}|null}>};
// The generated DB types cannot be regenerated until the unapplied schema is approved.
// Keep the temporary typed boundary limited to this allowlist; never accept an RPC name from input.
function rpc(client:unknown,name:RpcName,args:Record<string,unknown>={}){return(client as RpcClient).rpc(name,args);}
function studioError(error:{message?:string;code?:string}|null){
 if(/studio_restricted|source_restricted|source_stale/.test(error?.message??''))return reply({ok:false,code:'RESTRICTED',retryable:false},403);
 if(/studio_not_found/.test(error?.message??''))return failure('NOT_FOUND',404);
 return backendFailure(error);
}
export async function studioCommand(request:Request){
 const ctx=await apiContext(request,'conversation',true);if(ctx.response)return ctx.response;
 let command;try{command=parseStudioCommand(await boundedBody(request,131072));}catch{return failure('INVALID',400);}
 const ready=capabilities(process.env).creatorBriefHandoff?.mode==='connected'&&capabilities(process.env).creator?.mode==='connected';
 if(!authorizeStudio(ctx.actor,command.payload,ready))return failure('FORBIDDEN',403);
 const result=await rpc(ctx.client,'apply_kinnso_studio_command',{p_target_id:command.payload.targetId,p_expected_revision:command.expectedRevision,p_request_id:command.requestId,p_command:{kind:command.payload.kind,...command.payload.data}});
 return result.error?studioError(result.error):reply({ok:true,data:result.data});
}
export async function studioRead(request:Request,kind:'thread'|'list'|'request'|'guide',id?:string){
 if(kind!=='list'&&!studioUuid(id))return failure('INVALID',400);
 // An owner can still check the minimal outcome of an outstanding intent after writes are disabled.
 const ctx=await apiContext(request,kind==='request'?'auth':'conversation');if(ctx.response)return ctx.response;
 const name:RpcName=kind==='list'?'list_kinnso_studio_threads':kind==='request'?'get_kinnso_studio_request':kind==='guide'?'get_kinnso_studio_guide_context':'get_kinnso_studio_thread';
 const args=kind==='list'?{}:kind==='request'?{p_request_id:id}:kind==='guide'?{p_guide_id:id}:{p_thread_id:id};
 const result=await rpc(ctx.client,name,args);return result.error?studioError(result.error):reply({ok:true,data:result.data});
}
