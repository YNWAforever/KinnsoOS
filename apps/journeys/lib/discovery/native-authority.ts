import {commandDigest,parseDiscoveryIntent,stableJson,uuid} from './policy';
import type {DiscoveryIntent,Failure} from './contracts';

/** Server-only injected ports. No environment lookup, endpoint selection or OAuth occurs here. */
export type AuthorityEnvelope={keyId:string;payload:{actorId:string;requestId:string;commandDigest:string;issuedAt:number;expiresAt:number;facts:Record<string,unknown>};signature:string};
export type CommandAuthority=(input:DiscoveryIntent)=>Promise<{ok:true;envelope:AuthorityEnvelope}|Failure>;
export type AuthorityContext={actorId:string;identity:string;kind:string;targetId:string};
export interface AuthorityPorts {
 clock:()=>number;
 identity:()=>Promise<string>;
 context:(input:DiscoveryIntent,actorId:string)=>Promise<AuthorityContext|null>;
 /** Must verify SME proof/observations against the server-resolved context, never request flags. */
 observe:(input:DiscoveryIntent,context:AuthorityContext)=>Promise<Record<string,unknown>>;
 key:()=>Promise<{id:string;secret:Uint8Array}|null>;
}
export const needsCommandAuthority=(kind:string)=>['confirmLink','importOffer','preparePublication','publishOffer','recordMatch'].includes(kind);
export const closedCommandAuthority:CommandAuthority=async()=>({ok:false,code:'NOT_CONNECTED',retryable:false});
async function signature(payload:AuthorityEnvelope['payload'],key:Uint8Array){
 if(key.byteLength<32)throw Error('UNAVAILABLE');
 const imported=await crypto.subtle.importKey('raw',Uint8Array.from(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',imported,new TextEncoder().encode(stableJson(payload)))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function signAuthorityFacts(binding:{actorId:string;requestId:string;commandDigest:string},facts:Record<string,unknown>,key:{id:string;secret:Uint8Array},now:number):Promise<AuthorityEnvelope>{
 uuid(binding.actorId);uuid(binding.requestId);
 if(!Number.isSafeInteger(now)||!/^[a-f0-9]{64}$/.test(binding.commandDigest)||!/^[A-Za-z0-9_-]{1,40}$/.test(key.id))throw Error('INVALID');
 const payload={...binding,issuedAt:now,expiresAt:now+60000,facts};
 return {keyId:key.id,payload,signature:await signature(payload,key.secret)};
}
export function createCommandAuthority(ports:AuthorityPorts):CommandAuthority {
 return async value=>{
  try{
   const input=parseDiscoveryIntent(value),actorId=uuid(await ports.identity()),started=ports.clock();
   const before=await ports.context(input,actorId);
   if(!before||before.actorId!==actorId||before.targetId!==input.targetId||before.kind!==input.command.kind)return {ok:false,code:'FORBIDDEN',retryable:false};
   const identity=stableJson(before),facts=await ports.observe(input,before);
   const after=await ports.context(input,actorId),now=ports.clock();
   if(!after||identity!==stableJson(after)||await ports.identity()!==actorId)return {ok:false,code:'RESTRICTED',retryable:false};
   if(!Number.isSafeInteger(started)||!Number.isSafeInteger(now)||now<started||now-started>15000)return {ok:false,code:'TIMEOUT',retryable:true};
   if(!facts||typeof facts!=='object'||Array.isArray(facts)||JSON.stringify(facts).length>196608)throw Error('INVALID');
   const key=await ports.key();if(!key||!/^[a-zA-Z0-9_-]{1,40}$/.test(key.id))return {ok:false,code:'NOT_CONNECTED',retryable:false};
   const payload={actorId,requestId:input.requestId,commandDigest:await commandDigest(input),issuedAt:started,expiresAt:started+60000,facts};
   return {ok:true,envelope:{keyId:key.id,payload,signature:await signature(payload,key.secret)}};
  }catch(error){
   const message=error instanceof Error?error.message:'';
   const code:Failure['code']=['INVALID','FORBIDDEN','RESTRICTED','SOURCE_CHANGED','NOT_CONNECTED','TIMEOUT'].includes(message)?message as Failure['code']:'UNAVAILABLE';
   return {ok:false,code,retryable:code==='UNAVAILABLE'||code==='TIMEOUT'};
  }
 };
}
/** Offline contract verification; SQL independently checks the same canonical bytes and actor. */
export async function verifyCommandAuthority(envelope:AuthorityEnvelope,context:{actorId:string;intent:DiscoveryIntent;now:number;key:Uint8Array}){
 const p=envelope.payload;
 if(p.actorId!==context.actorId||p.requestId!==context.intent.requestId||p.commandDigest!==await commandDigest(context.intent)
  ||!Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt-p.issuedAt!==60000||p.issuedAt>context.now||p.expiresAt<=context.now)throw Error('RESTRICTED');
 const expected=await signature(p,context.key);
 if(!/^[a-f0-9]{64}$/.test(envelope.signature))throw Error('RESTRICTED');
 let diff=0;for(let n=0;n<expected.length;n++)diff|=expected.charCodeAt(n)^envelope.signature.charCodeAt(n);
 if(diff!==0)throw Error('RESTRICTED');return p;
}
