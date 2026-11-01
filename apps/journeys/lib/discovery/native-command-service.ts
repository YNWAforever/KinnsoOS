import {createCommandAuthority,closedCommandAuthority,signAuthorityFacts,type AuthorityEnvelope,type CommandAuthority,type AuthorityContext,type AuthorityPorts} from './native-authority';
import {commandDigest,hashValue,stableJson,uuid} from './policy';
import {parseSmeResult,parseOfferEvidence,type SmeReadResult,type ToolName,type VerifiedLinkContext} from '../integrations/smeassistant/contracts';
import {validateNativeOfferRefs,type NativeLinkScope} from '../integrations/smeassistant/native-bridge';
import {rankOffers} from './matching';
import type {DiscoveryIntent,OfferImport,PublishedOfferContext,TripIntent,MatchChoice} from './contracts';

export type NativeCommandContext=AuthorityContext&{data:{link?:NativeLinkScope;nonce?:string;offerImport?:Omit<OfferImport,'fields'>;intent?:TripIntent;choices?:MatchChoice[];offers?:PublishedOfferContext[];poolHasMore?:boolean}};
export type VerifiedOwnerProof={id:string;companyBindingHash:string;nonce:string;workspaceId:string;scopeVersion:number;locationIds:string[];role:'owner';issuedAt:number;expiresAt:number};
export interface NativeCommandProviders {
 clock:()=>number;
 /** Verifies signature, issuer, audience and durable revocation. Never a browser decode. */
 verifyOwnerProof:(proof:string)=>Promise<VerifiedOwnerProof>;
 sme:{call:(tool:ToolName,input:unknown,context:VerifiedLinkContext)=>Promise<SmeReadResult<unknown>>};
 key:AuthorityPorts['key'];
}
export type NativeContextReader=(input:DiscoveryIntent,actorId:string)=>Promise<NativeCommandContext|null>;
export async function nativeOfferHash(offer:ReturnType<typeof parseOfferEvidence>){
 const {offerId,revision,sourceLocationId,title,details,terms,validFrom,validUntil,priceAmount,currency,claims,prohibitedTerms}=offer;
 const amount=priceAmount===null?null:priceAmount.split('.')[0]+'.'+(priceAmount.split('.')[1]??'').padEnd(2,'0');
 return hashValue({offerId,revision,sourceLocationId,title,details,terms,validFrom,validUntil,priceAmount:amount,currency,claims,prohibitedTerms});
}
export function nativeCommandAuthority(identity:()=>Promise<string>,read:NativeContextReader,providers?:NativeCommandProviders,hydrateMatching?:(input:DiscoveryIntent,proof:AuthorityEnvelope)=>Promise<PublishedOfferContext[]>):CommandAuthority {
 if(!providers)return closedCommandAuthority;
 const context:NativeContextReader=async(input,actor)=>{
  const value=await read(input,actor);
  if(!value||value.actorId!==actor||value.kind!==input.command.kind||value.targetId!==input.targetId)return null;
  // A repeat DB read after provider work detects link/intent/publication/grant revisions changing.
  return {...value,identity:await hashValue(value.data)};
 };
 return createCommandAuthority({clock:providers.clock,identity,context,key:providers.key,observe:async(input,ctx)=>{
  const data=(ctx as NativeCommandContext).data,c=input.command;
  const link=data.link;
  if(c.kind==='confirmLink'){
   if(!link||!data.nonce)throw Error('NOT_CONNECTED');
   const proof=await providers.verifyOwnerProof(c.data.proof),now=providers.clock();
   const binding=await hashValue({companyId:link.companyId,linkId:input.targetId});
   if(proof.role!=='owner'||proof.nonce!==data.nonce||proof.companyBindingHash!==binding||!Number.isSafeInteger(proof.issuedAt)||!Number.isSafeInteger(proof.expiresAt)
    ||proof.issuedAt>now||proof.expiresAt<=now||proof.expiresAt<=proof.issuedAt||proof.expiresAt-proof.issuedAt>300000
    ||typeof proof.id!=='string'||!proof.id.length||proof.id.length>200||typeof proof.workspaceId!=='string'||!proof.workspaceId.length||proof.workspaceId.length>200
    ||!Number.isSafeInteger(proof.scopeVersion)||proof.scopeVersion<1||stableJson([...proof.locationIds].sort())!==stableJson([...link.locationIds].sort()))throw Error('RESTRICTED');
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.data.proof));
   return {proofId:proof.id,proofDigest:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),companyId:link.companyId,linkId:input.targetId,
    role:'owner',nonce:proof.nonce,workspaceId:proof.workspaceId,scopeVersion:proof.scopeVersion,locationIds:proof.locationIds};
  }
  async function evidence(scope:NativeLinkScope,offerId:string,revision:number,locationId:string){
   if(!scope.readRefreshAllowed||!scope.locationIds.includes(locationId))throw Error('NOT_CONNECTED');
   const raw=parseSmeResult('sme_offer_evidence_v1',await providers!.sme.call('sme_offer_evidence_v1',{offerId,expectedRevision:revision,locationId},scope));
   if(raw.status!=='ready'||raw.scope.workspaceId!==scope.workspaceId||raw.scope.scopeVersion!==scope.scopeVersion
    ||raw.scope.locationId!==null&&raw.scope.locationId!==locationId)throw Error('SOURCE_CHANGED');
   const offer=parseOfferEvidence(raw.data);
   if(offer.offerId!==offerId||offer.revision!==revision||offer.appliedLocationId!==locationId||offer.sourceStatus!=='confirmed'||offer.hash!==await nativeOfferHash(offer))throw Error('SOURCE_CHANGED');
   return offer;
  }
  async function check(scope:NativeLinkScope,ref:{offerId:string;revision:number;hash:string;locationId:string}){
   // A single ref avoids ambiguity when one upstream offer applies to multiple locations.
   const linkId=uuid((scope as NativeLinkScope&{id:string}).id);
   const result=await validateNativeOfferRefs(providers!.sme,{clock:providers!.clock,link:async()=>scope},linkId,[ref]);
   if(!result.ok)throw Error(result.code);
   return {...ref,linkId,workspaceId:scope.workspaceId,linkVersion:scope.linkVersion,scopeVersion:scope.scopeVersion,checkedAt:result.checkedAt,state:'current'};
  }
  if(c.kind==='importOffer'){
   if(!link)throw Error('NOT_CONNECTED');
   const offer=await evidence(link,c.data.offerId,c.data.expectedSourceRevision,c.data.locationId);
   return {offer,check:await check(link,{offerId:offer.offerId,revision:offer.revision,hash:offer.hash,locationId:offer.appliedLocationId})};
  }
  if(c.kind==='preparePublication'||c.kind==='publishOffer'){
   const i=data.offerImport;if(!link||!i)throw Error('NOT_CONNECTED');
   return {check:await check(link,{offerId:i.externalOfferId,revision:i.sourceRevision,hash:i.sourceHash,locationId:i.appliedLocationId})};
  }
  if(c.kind==='recordMatch'){
   if(!data.intent||data.intent.ownerActorId!==ctx.actorId||data.intent.id!==c.data.intentId||data.intent.revision!==c.data.intentRevision||!Array.isArray(data.offers)||data.offers.length>20)throw Error('INVALID');
   const checks=new Map<string,unknown>();
   for(const candidate of data.offers){
    const scope=candidate.link as typeof candidate.link&NativeLinkScope,ref=candidate.import;
    const verified=await check(scope,{offerId:ref.externalOfferId,revision:ref.sourceRevision,hash:ref.sourceHash,locationId:ref.appliedLocationId});
    checks.set(candidate.publication.id,verified);
   }
   // Delegated refresh permits references only. Prose comes from the immutable
   // Kinnso import after SQL verifies this actor-bound fresh observation.
   const key=await providers!.key();if(!key||!hydrateMatching)throw Error('NOT_CONNECTED');
   const proof=await signAuthorityFacts({actorId:ctx.actorId,requestId:input.requestId,commandDigest:await commandDigest(input)},
    {checks:[...checks].map(([publicationId,check])=>({publicationId,check}))},key,providers!.clock());
   const hydrated=await hydrateMatching(input,proof);
   if(hydrated.length!==data.offers.length)throw Error('SOURCE_CHANGED');
   const offers:PublishedOfferContext[]=await Promise.all(data.offers.map(async candidate=>{
    const found=hydrated.find(o=>o.publication.id===candidate.publication.id);
    if(!found||found.import.id!==candidate.import.id||found.import.sourceHash!==candidate.import.sourceHash)throw Error('SOURCE_CHANGED');
    const fields=parseOfferEvidence(found.import.fields),verified=checks.get(candidate.publication.id) as {checkedAt:string};
    if(await nativeOfferHash(fields)!==candidate.import.sourceHash||fields.offerId!==candidate.import.externalOfferId||fields.revision!==candidate.import.sourceRevision||fields.appliedLocationId!==candidate.import.appliedLocationId)throw Error('SOURCE_CHANGED');
    return {...candidate,import:{...candidate.import,fields},sourceState:'current',checkedAt:verified.checkedAt};
   }));
   const ranked=rankOffers(data.intent,offers,data.choices??[],new Date(providers!.clock()));
   return {intentId:data.intent.id,intentRevision:data.intent.revision,policyVersion:'matching-v1',
    results:ranked.results.map(({display:_display,...r})=>({...r,check:checks.get(r.publicationId)})),coverage:{...ranked.coverage,bounded:ranked.coverage.bounded||data.poolHasMore===true}};
  }
  throw Error('UNSUPPORTED');
 }});
}
