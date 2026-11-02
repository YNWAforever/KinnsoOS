import {parseSmeInput,parseSmeResult,type SmeReadResult,type ToolName,type VerifiedLinkContext} from './contracts';
import type {Failure} from '../../discovery/contracts';
export type NativeLinkScope=VerifiedLinkContext&{scopeVersion:number;linkVersion:number};
type Ref={offerId:string;revision:number;hash:string;locationId:string};
type Client={call:(tool:ToolName,input:unknown,context:VerifiedLinkContext)=>Promise<SmeReadResult<unknown>>};
type Ports={link:(id:string)=>Promise<NativeLinkScope|null>;clock:()=>number};
export type FreshSourceCheck={ok:true;linkId:string;linkVersion:number;scopeVersion:number;checkedAt:string;refs:Ref[]}|Failure;
const fail=(code:Failure['code']):Failure=>({ok:false,code,retryable:code==='UNAVAILABLE'||code==='TIMEOUT'});
const identity=(s:NativeLinkScope)=>JSON.stringify({...s,locationIds:[...s.locationIds].sort()});
/** Server-resolved links only. Does not select an endpoint, credential or create a connection.
 * The downstream SQL transaction must also lock/check local grant versions; this
 * bounded observation never claims cross-database atomic revocation. */
export async function validateNativeOfferRefs(client:Client,ports:Ports,linkId:string,refs:Ref[]):Promise<FreshSourceCheck>{
 try{
  parseSmeInput('sme_validate_offer_refs_v1',{refs});
  // Output contract identifies refs by offerId; one call cannot ambiguously map the same offer twice.
  if(new Set(refs.map(r=>r.offerId)).size!==refs.length)return fail('INVALID');
  const before=await ports.link(linkId);if(!before?.readRefreshAllowed)return fail('NOT_CONNECTED');
  if(!Number.isSafeInteger(before.scopeVersion)||before.scopeVersion<1||!Number.isSafeInteger(before.linkVersion)||before.linkVersion<1)return fail('NOT_CONNECTED');
  if(refs.some(r=>!before.locationIds.includes(r.locationId)))return fail('FORBIDDEN');
  const beforeIdentity=identity(before);
  const result=parseSmeResult('sme_validate_offer_refs_v1',await client.call('sme_validate_offer_refs_v1',{refs},before));
  if(result.status==='error')return fail(result.code);
  if(result.status!=='ready'||result.scope.workspaceId!==before.workspaceId||result.scope.scopeVersion!==before.scopeVersion)return fail('SOURCE_CHANGED');
  if(result.scope.locationId!==null&&refs.some(r=>r.locationId!==result.scope.locationId))return fail('FORBIDDEN');
  const items=(result.data as {items:{offerId:string;state:string;currentRevision?:number;checkedAt:string}[]}).items;
  if(items.length!==refs.length||new Set(items.map(i=>i.offerId)).size!==refs.length)return fail('SOURCE_CHANGED');
  const after=await ports.link(linkId);if(!after||identity(after)!==beforeIdentity)return fail('RESTRICTED');
  const now=ports.clock();let oldest=now;
  for(const ref of refs){const item=items.find(i=>i.offerId===ref.offerId);if(!item||item.state!=='current'||item.currentRevision!==ref.revision)return fail('SOURCE_CHANGED');
   const checked=Date.parse(item.checkedAt);if(!Number.isFinite(checked)||checked>now||now-checked>60000)return fail('SOURCE_CHANGED');oldest=Math.min(oldest,checked);
  }
  return {ok:true,linkId,linkVersion:before.linkVersion,scopeVersion:before.scopeVersion,checkedAt:new Date(oldest).toISOString(),refs:structuredClone(refs)};
 }catch{return fail('UNAVAILABLE');}
}
