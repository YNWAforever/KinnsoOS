import {parseDiscoveryIntent,parseDiscoveryRead,uuid,integer,object,commandDigest} from './policy';
import type {DiscoveryCommandResult,DiscoveryReadResult,DiscoveryReadback,DiscoveryReceipt,Failure} from './contracts';
import {needsCommandAuthority,closedCommandAuthority,type CommandAuthority} from './native-authority';

export type DiscoveryRpcName='apply_kinnso_discovery_command'|'get_kinnso_discovery_request'|'read_kinnso_discovery'|'get_kinnso_discovery_context'|'get_kinnso_discovery_match_evidence'|'ingest_kinnso_matched_source';
/** Temporary bounded port for an UNAPPLIED schema, not generated DB types. */
export type DiscoveryRpc=(name:DiscoveryRpcName,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string;code?:string}|null}>;
export interface NativeDiscoveryPorts {enabled:()=>boolean;rpc:DiscoveryRpc;authority?:CommandAuthority}
const fail=(code:Failure['code']):Failure=>({ok:false,code,retryable:['TIMEOUT','UNAVAILABLE'].includes(code)});
function errorCode(error:{message?:string;code?:string}):Failure {
 const m=error.message??'';
 for(const [pattern,code] of [[/unauthenticated/,'AUTH_REQUIRED'],[/restricted/,'RESTRICTED'],[/forbidden|not_authorized/,'FORBIDDEN'],[/not_found/,'NOT_FOUND'],[/conflict/,'CONFLICT'],[/source_changed/,'SOURCE_CHANGED'],[/invalid_/,'INVALID']] as const)if(pattern.test(m))return fail(code);
 return fail('UNAVAILABLE');
}
function receipt(value:unknown,requestId:string):DiscoveryReceipt {
 // Explicit projection: even an accidentally expanded RPC must not return private bodies.
 if(!value||typeof value!=='object')throw Error('INVALID');
 const r=value as Record<string,unknown>;
 if(uuid(r.requestId)!==requestId||typeof r.commandDigest!=='string'||!/^[a-f0-9]{64}$/.test(r.commandDigest))throw Error('INVALID');
 return {requestId,commandDigest:r.commandDigest,resourceId:uuid(r.resourceId),revision:integer(r.revision,1)};
}
export function createNativeDiscovery(ports:NativeDiscoveryPorts){
 return {
  async source(value:unknown){
   if(!ports.enabled())return fail('UNAVAILABLE');
   let input:Record<string,unknown>;
   try{input=object(value,['threadId','sourceId','matchRunId','publicationId','requestId']);Object.values(input).forEach(uuid);}catch{return fail('INVALID');}
   try{
    const result=await ports.rpc('ingest_kinnso_matched_source',{p_thread_id:input.threadId,p_source_id:input.sourceId,p_match_id:input.matchRunId,p_publication_id:input.publicationId,p_request_id:input.requestId});
    if(result.error)return errorCode(result.error);
    const data=object(result.data,['receipt','source']);
    return {ok:true as const,receipt:receipt(data.receipt,String(input.requestId)),source:data.source};
   }catch{return fail('TIMEOUT');}
  },
  async command(value:unknown):Promise<DiscoveryCommandResult>{
   if(!ports.enabled())return fail('UNAVAILABLE');
   let input;try{input=parseDiscoveryIntent(value);}catch{return fail('INVALID');}
   let authority;
   if(needsCommandAuthority(input.command.kind)){
    // A committed confirmation consumed its nonce. Recover the immutable actor-bound
    // receipt before asking the provider to attest again; never re-issue the intent.
    try{
     const prior=await ports.rpc('get_kinnso_discovery_request',{p_request_id:input.requestId});
     if(prior.error)return errorCode(prior.error);
     if(prior.data&&typeof prior.data==='object'&&(prior.data as Record<string,unknown>).status==='complete'){
      const saved=receipt((prior.data as Record<string,unknown>).receipt,input.requestId);
      if(saved.resourceId!==input.targetId||saved.commandDigest!==await commandDigest(input))return fail('CONFLICT');
      return {ok:true,receipt:saved};
     }
    }catch{return fail('TIMEOUT');}
    const observed=await (ports.authority??closedCommandAuthority)(input);
    if(!observed.ok)return observed;authority=observed.envelope;
   }
   let result;try{result=await ports.rpc('apply_kinnso_discovery_command',{p_target_id:input.targetId,p_expected_revision:input.expectedRevision,p_request_id:input.requestId,p_command:input.command,...(authority?{p_authority:authority}:{})});}catch{return fail('TIMEOUT');}
   if(result.error)return errorCode(result.error);
   try{const data=object(result.data,['ok','receipt']);if(data.ok!==true)throw Error('INVALID');return {ok:true,receipt:receipt(data.receipt,input.requestId)};}catch{return fail('UNAVAILABLE');}
  },
  async read(value:unknown):Promise<DiscoveryReadResult>{
   if(!ports.enabled())return fail('UNAVAILABLE');
   let scope;try{scope=parseDiscoveryRead(value);}catch{return fail('INVALID');}
   try{const result=await ports.rpc('read_kinnso_discovery',{p_scope:scope});if(result.error)return errorCode(result.error);
    const data=object(result.data,['ok','data']);if(data.ok!==true||JSON.stringify(data).length>1048576)return fail('UNAVAILABLE');
    return data as DiscoveryReadResult;
   }catch{return fail('UNAVAILABLE');}
  },
  async receipt(requestId:string):Promise<DiscoveryReadback>{
   const unknown={status:'unknown',requestId} as const;
   try{uuid(requestId);const result=await ports.rpc('get_kinnso_discovery_request',{p_request_id:requestId});
    if(result.error){const code=errorCode(result.error).code;return ['RESTRICTED','FORBIDDEN','AUTH_REQUIRED'].includes(code)?{status:'restricted',requestId}:unknown;}
    if(!result.data||typeof result.data!=='object')return unknown;
    const d=result.data as Record<string,unknown>;
    if(d.status==='restricted')return {status:'restricted',requestId};
    if(d.status!=='complete'||!['present','deleted'].includes(String(d.resourceState)))return unknown;
    return {status:'complete',receipt:receipt(d.receipt,requestId),resourceState:d.resourceState as 'present'|'deleted'};
   }catch{return unknown;}
  }
 };
}
