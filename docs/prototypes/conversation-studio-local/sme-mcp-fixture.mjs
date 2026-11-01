// Contract substitute only; NOT a remote MCP server, OAuth verifier, or live connection.
import {randomBytes,randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {parseSmeInput,parseSmeResult,SME_TOOLS} from '../../../apps/journeys/lib/integrations/smeassistant/contracts.ts';
import {authorizeSmeTool,SME_LIMITS} from '../../../apps/journeys/lib/integrations/smeassistant/policy.ts';
import {hashValue,stableJson} from '../../../apps/journeys/lib/discovery/policy.ts';
import {discoveryOffers,offerHash} from './discovery-data.mjs';
export function createSmeFixture({now=()=>Date.now()}={}){
 let clock=now,inFlight=0;const calls=[],proofCalls=[],consumed=new Set(),nonces=new Map(),secret=randomBytes(32),effects=[];
 const principal={fixture:true,issuer:'urn:kinnso:fixture:sme',subject:'fixture-sme-owner',audience:'urn:kinnso:fixture:client',workspaceId:'workspace-a',role:'owner',scopes:['merchant:read','offers:read','evidence:read','link:attest'],locationIds:['location-a','location-b','location-c'],scopeVersion:1,active:true};
 const offersPromise=discoveryOffers(()=>clock());
 const error=(code)=>({schemaVersion:'kinnso.sme.read.v1',status:'error',requestId:randomUUID(),code,retryable:['TIMEOUT','UNAVAILABLE','RATE_LIMITED'].includes(code)});
 const sign=value=>{const raw=Buffer.from(stableJson(value)).toString('base64url');return raw+'.'+createHmac('sha256',secret).update(raw).digest('base64url');};
 function verify(proof){try{const [raw,sig,...rest]=proof.split('.'),expected=createHmac('sha256',secret).update(raw).digest();const actual=Buffer.from(sig??'','base64url');if(rest.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();return JSON.parse(Buffer.from(raw,'base64url'));}catch{throw Error('FORBIDDEN');}}
 async function call(tool,input,options={}){
  if(!SME_TOOLS.includes(tool))return error('UNSUPPORTED');
  try{
   input=parseSmeInput(tool,input);authorizeSmeTool(principal,tool,input,options.context);
   const active=calls.filter(t=>clock()-t<60000);calls.splice(0,calls.length,...active);if(inFlight>=2||calls.length>=60)return error('RATE_LIMITED');calls.push(clock());
   if(tool==='sme_link_attestation_v1'){const activeProof=proofCalls.filter(t=>clock()-t<60000);proofCalls.splice(0,proofCalls.length,...activeProof);if(proofCalls.length>=10)return error('RATE_LIMITED');proofCalls.push(clock());}
   inFlight++;
   try{
    if(options.simulate==='timeout')return error('TIMEOUT');
    if(options.simulate==='slow')await new Promise(r=>setTimeout(r,20));
    const stamp=new Date(clock()).toISOString(),offers=await offersPromise;let data,status='ready';
    const available=o=>(o.sourceLocationId===null||o.sourceLocationId===input.locationId)&&o.sourceStatus==='confirmed'&&o.validUntil>=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(clock());
    const scoped=o=>({...structuredClone(o),appliedLocationId:input.locationId,observedAt:stamp});
    if(tool==='sme_connection_status_v1')data={status:'active',scopes:principal.scopes,scopeVersion:principal.scopeVersion,locationIds:principal.locationIds,lastVerifiedAt:stamp};
    if(tool==='sme_link_attestation_v1'){const issued=clock();const payload={issuer:principal.issuer,audience:principal.audience,subject:principal.subject,workspaceId:principal.workspaceId,scopeVersion:principal.scopeVersion,locationIds:input.locationIds,nonce:input.nonce,companyBindingHash:input.companyBindingHash,iat:issued,exp:issued+300000};data={proof:sign(payload),expiresAt:new Date(payload.exp).toISOString()};}
    if(tool==='sme_merchant_context_v1')data={publicName:'自有商戶示例',websiteUrl:null,market:'HK',locationId:input.locationId,availableFields:['title','details','terms'],observedAt:stamp};
    if(tool==='sme_confirmed_offers_v1'){
     const key=await hashValue({workspaceId:principal.workspaceId,scopeVersion:principal.scopeVersion,locationId:input.locationId});let offset=0;
     if(input.cursor){const cursor=verify(input.cursor);if(cursor.key!==key||!Number.isInteger(cursor.offset))throw Error('FORBIDDEN');offset=cursor.offset;}
     const all=offers.filter(available),limit=input.limit??20;data={items:all.slice(offset,offset+limit).map(scoped),nextCursor:all.length>offset+limit?sign({key,offset:offset+limit}):null};status=data.items.length?'ready':'empty';
    }
    if(tool==='sme_offer_evidence_v1'){const o=offers.find(o=>o.offerId===input.offerId&&available(o));if(!o)return error('UNAVAILABLE');if(o.revision!==input.expectedRevision)return error('SOURCE_CHANGED');data=scoped(o);}
    if(tool==='sme_validate_offer_refs_v1')data={items:input.refs.map(ref=>{const o=offers.find(o=>o.offerId===ref.offerId&&(o.sourceLocationId===null||o.sourceLocationId===ref.locationId));const state=!o?'unavailable':o.sourceStatus==='archived'?'archived':o.sourceStatus==='expired'||o.validUntil<stamp.slice(0,10)?'expired':o.revision!==ref.revision||o.hash!==ref.hash?'changed':'current';return {offerId:ref.offerId,state,...state==='unavailable'?{}:{currentRevision:o.revision},checkedAt:stamp};})};
    return parseSmeResult(tool,{schemaVersion:'kinnso.sme.read.v1',status,requestId:randomUUID(),observedAt:stamp,scope:{workspaceId:principal.workspaceId,locationId:input.locationId??null,scopeVersion:principal.scopeVersion},data,warnings:[]});
   }finally{inFlight--;}
  }catch(e){return error(['FORBIDDEN','NOT_CONNECTED','SOURCE_CHANGED'].includes(e.message)?e.message:'INVALID');}
 }
 async function beginLink(companyId,locationIds,role){if(role!=='owner')throw Error('FORBIDDEN');if(!locationIds.length||locationIds.some(x=>!principal.locationIds.includes(x)))throw Error('FORBIDDEN');const pending={companyId,locationIds,nonce:randomBytes(32).toString('base64url'),companyBindingHash:await hashValue({companyId,locationIds}),expiresAt:clock()+300000};nonces.set(pending.nonce,pending);return structuredClone(pending);}
 async function attest(pending){const r=await call('sme_link_attestation_v1',{nonce:pending.nonce,companyBindingHash:pending.companyBindingHash,locationIds:pending.locationIds});if(r.status==='error')throw Error(r.code);return r.data.proof;}
 async function confirm(pending,proof,role){if(role!=='owner')throw Error('FORBIDDEN');authorizeSmeTool(principal,'sme_link_attestation_v1',{locationIds:pending.locationIds});if(consumed.has(pending.nonce))throw Error('CONFLICT');const p=verify(proof);if(!nonces.has(pending.nonce)||p.exp<=clock()||p.iat>clock()||p.exp-p.iat!==300000||pending.expiresAt<=clock()||p.issuer!==principal.issuer||p.audience!==principal.audience||p.subject!==principal.subject||p.workspaceId!==principal.workspaceId||p.scopeVersion!==principal.scopeVersion||p.nonce!==pending.nonce||p.companyBindingHash!==pending.companyBindingHash||stableJson(p.locationIds)!==stableJson(pending.locationIds))throw Error('FORBIDDEN');consumed.add(pending.nonce);nonces.delete(pending.nonce);return p;}
 return {principal,effects,limits:SME_LIMITS,call,beginLink,attest,confirm,setNow:fn=>{clock=fn;},validateRefs:(refs,allowed)=>allowed?call('sme_validate_offer_refs_v1',{refs}):Promise.resolve(error('FORBIDDEN')),mutateOffer:async(id,patch)=>{const o=(await offersPromise).find(x=>x.offerId===id);Object.assign(o,patch);o.hash=await offerHash(o);}};
}
