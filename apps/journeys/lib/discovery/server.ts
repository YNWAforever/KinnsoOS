import {apiContext,boundedBody,reply,failure} from '../api/server';
import {createNativeDiscovery,type DiscoveryRpc} from './native';
import {uuid} from './policy';
import {nativeCommandAuthority,type NativeCommandContext,type NativeCommandProviders} from './native-command-service';
import type {PublishedOfferContext} from './contracts';

/** Providers are passed by a reviewed server composition only. Production has none configured. */
export function nativeDiscoveryRuntime(rpc:DiscoveryRpc,actorId:string,providers?:NativeCommandProviders){
 const authority=nativeCommandAuthority(async()=>actorId,async input=>{
  const result=await rpc('get_kinnso_discovery_context',{p_target_id:input.targetId,p_command:input.command});
  if(result.error||!result.data||typeof result.data!=='object'||JSON.stringify(result.data).length>1048576)return null;
  return result.data as NativeCommandContext;
 },providers,async(input,proof)=>{
  const result=await rpc('get_kinnso_discovery_match_evidence',{p_target_id:input.targetId,p_expected_revision:input.expectedRevision,p_request_id:input.requestId,p_command:input.command,p_authority:proof});
  if(result.error||!Array.isArray(result.data)||JSON.stringify(result.data).length>1048576)throw Error('UNAVAILABLE');
  return result.data as PublishedOfferContext[];
 });
 return createNativeDiscovery({enabled:()=>true,rpc,authority});
}

/** Uses the authenticated user's RPC client. No service-role or browser actor parameter. */
export async function discoveryRequest(request:Request,operation:'command'|'read'|'receipt'|'source',id?:string){
 if(operation==='receipt'){try{uuid(id);}catch{return failure('INVALID',400);}}
 // Minimal own receipts remain available after the discovery write gate is disabled.
 const ctx=await apiContext(request,operation==='receipt'?'auth':operation==='source'?'matchedBriefHandoff':'tripIntent',operation!=='receipt');
 if(ctx.response)return ctx.response;
 const port=ctx.client as unknown as {rpc:DiscoveryRpc};
 const api=nativeDiscoveryRuntime((name,args)=>port.rpc(name,args),ctx.actor.id);
 if(operation==='receipt')return reply(await api.receipt(id!));
 let value;try{value=await boundedBody(request,32768);}catch{return failure('INVALID',400);}
 const result=operation==='command'?await api.command(value):operation==='source'?await api.source(value):await api.read(value);
 return reply(result,result.ok?200:result.code==='INVALID'?400:result.code==='CONFLICT'?409:result.code==='AUTH_REQUIRED'?401:['FORBIDDEN','RESTRICTED'].includes(result.code)?403:503);
}
