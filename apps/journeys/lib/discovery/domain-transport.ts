import {hashValue,stableJson,uuid} from './policy';
import {signAuthorityFacts} from './native-authority';
import {validateNativeOfferRefs,type NativeLinkScope} from '../integrations/smeassistant/native-bridge';
import type {NativeCommandProviders} from './native-command-service';

const METHODS=new Set(['apply_kinnso_studio_command','save_kinnso_guide_draft','publish_kinnso_guide_draft','publish_guide_version','adopt_guide_to_trip','create_trip_share_v2']);
type Context={actorId:string;refs:{importId:string;link:NativeLinkScope&{id:string};ref:{offerId:string;revision:number;hash:string;locationId:string}}[]};
/** Wraps the existing authenticated HTTP transport, including web Server Actions.
 * Default-disabled: original requests pass through unchanged. No new credentials.
 * Refresh observes refs only; one bound RPC invokes the original domain writer and
 * binds/validates all observations inside that original business transaction. */
export function discoveryDomainTransport(options:{enabled:()=>boolean;transport?:typeof fetch;providers?:NativeCommandProviders}):typeof fetch {
 const transport=options.transport??fetch;
 return async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=url.pathname.split('/').pop()??'';
  if(!options.enabled()||!METHODS.has(method)||!url.pathname.endsWith('/rpc/'+method)||init?.method?.toUpperCase()!=='POST')return transport(input,init);
  const denied=(message='discovery_unavailable')=>Response.json({message,code:'P0001'},{status:503,headers:{'Cache-Control':'no-store'}});
  try{
   if(typeof init.body!=='string'||init.body.length>262144)return denied('invalid_discovery_domain');
   const args=JSON.parse(init.body) as Record<string,unknown>,requestId=uuid(args.p_request_id);
   const rpc=async(name:string,body:unknown)=>transport(new URL('/rest/v1/rpc/'+name,url),{...init,body:JSON.stringify(body),cache:'no-store'});
   async function context(){const response=await rpc('get_kinnso_discovery_domain_context',{p_method:method,p_args:args});if(!response.ok)throw Error('RESTRICTED');const value=await response.json() as Context;
    uuid(value.actorId);if(!Array.isArray(value.refs)||value.refs.length>20)throw Error('INVALID');return value;}
   const before=await context();
   if(!before.refs.length)return transport(input,init);
   const providers=options.providers;if(!providers)return denied();
   const started=providers.clock(),checks=[];
   for(const entry of before.refs){
    uuid(entry.importId);uuid(entry.link.id);
    const checked=await validateNativeOfferRefs(providers.sme,{clock:providers.clock,link:async()=>entry.link},entry.link.id,[entry.ref]);
    if(!checked.ok)return denied('discovery_source_changed');
    checks.push({importId:entry.importId,check:{...entry.ref,linkId:entry.link.id,workspaceId:entry.link.workspaceId,linkVersion:entry.link.linkVersion,scopeVersion:entry.link.scopeVersion,checkedAt:checked.checkedAt,state:'current'}});
   }
   const after=await context();
   if(stableJson(before)!==stableJson(after))return denied('discovery_restricted');
   if(providers.clock()-started>15000)return denied();
   const key=await providers.key();if(!key)return denied();
   const proof=await signAuthorityFacts({actorId:before.actorId,requestId,commandDigest:await hashValue({method,args})},{checks},key,started);
   return rpc('apply_kinnso_discovery_bound_write',{p_method:method,p_args:args,p_authority:proof});
  }catch{return denied();}
 };
}
