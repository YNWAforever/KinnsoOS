// Synthetic, in-memory provider. Never instantiates a remote client or grants rights.
import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {discoveryModule} from '../helpers/discovery-load.mjs';
let contracts;
export async function createExampleProvider({runId,clock,link}){
 if(!/^[a-f0-9-]{36}$/.test(runId)||typeof clock!=='function')throw Error('INVALID');
 contracts??=Promise.all([discoveryModule('contracts','integrations/smeassistant'),discoveryModule('native-command-service')]);
 const [{parseSmeInput,parseSmeResult},{nativeOfferHash}]=await contracts;
 const proofKey=randomBytes(32),authorityKey=randomBytes(32),revoked=new Set(),audit=[];
 const scope=structuredClone(link);let state='current';
 const offer={offerId:'fixture-'+runId,revision:1,hash:'0'.repeat(64),sourceLocationId:scope.locationIds[0],appliedLocationId:scope.locationIds[0],
  title:'示例海港散步優惠',details:'EXAMPLE_ONLY '+runId,terms:'示例，沒有真實可兌換優惠。',validFrom:'2026-11-01',validUntil:'2027-02-01',
  priceAmount:null,currency:null,claims:[],prohibitedTerms:[],observedAt:new Date(clock()).toISOString(),sourceStatus:'confirmed',rightsState:'unverified_for_kinnso_reuse'};
 offer.hash=await nativeOfferHash(offer);
 const mac=body=>createHmac('sha256',proofKey).update(body).digest();
 const verifyOwnerProof=async token=>{
  if(typeof token!=='string'||token.length>8000||revoked.has(token))throw Error('RESTRICTED');
  const [prefix,body,signature,...rest]=token.split('.');if(prefix!=='example'||rest.length||!body||!/^[A-Za-z0-9_-]{43}$/.test(signature??''))throw Error('RESTRICTED');
  const decodedSignature=Buffer.from(signature,'base64url');
  // Node accepts unused low bits in the final base64url character. Require the
  // unique canonical spelling so a revoked token cannot acquire a string alias.
  if(decodedSignature.toString('base64url')!==signature||!timingSafeEqual(mac(body),decodedSignature))throw Error('RESTRICTED');
  let proof;try{proof=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch{throw Error('RESTRICTED');}
  if(proof.issuer!=='fixture:'+runId||proof.audience!=='fixture:kinnso-native'||proof.workspaceId!==scope.workspaceId||proof.scopeVersion!==scope.scopeVersion||
   JSON.stringify(proof.locationIds)!==JSON.stringify(scope.locationIds)||proof.role!=='owner'||proof.issuedAt>clock()||proof.expiresAt<=clock())throw Error('RESTRICTED');
  return proof;
 };
 const call=async(tool,input,context)=>{
  if(!['sme_offer_evidence_v1','sme_validate_offer_refs_v1'].includes(tool))throw Error('UNSUPPORTED');
  const parsed=parseSmeInput(tool,input);
  if(!context?.readRefreshAllowed||context.companyId!==scope.companyId||context.workspaceId!==scope.workspaceId||
   JSON.stringify([...context.locationIds].sort())!==JSON.stringify([...scope.locationIds].sort()))throw Error('FORBIDDEN');
  const refs=tool==='sme_validate_offer_refs_v1'?parsed.refs:[{offerId:parsed.offerId,revision:parsed.expectedRevision,locationId:parsed.locationId,hash:offer.hash}];
  if(refs.some(r=>!scope.locationIds.includes(r.locationId)))throw Error('FORBIDDEN');
  const requestId=randomUUID(),at=new Date(clock()).toISOString();
  audit.push({tool,requestId,scopeVersion:scope.scopeVersion,referenceCount:refs.length});
  if(tool==='sme_offer_evidence_v1'&&(state!=='current'||parsed.offerId!==offer.offerId||parsed.expectedRevision!==offer.revision))throw Error('SOURCE_CHANGED');
  const data=tool==='sme_offer_evidence_v1'?{...structuredClone(offer),observedAt:at,appliedLocationId:parsed.locationId}:{items:refs.map(r=>({offerId:r.offerId,
   state:r.offerId!==offer.offerId?'unavailable':r.revision!==offer.revision||r.hash!==offer.hash?'changed':state,checkedAt:at,currentRevision:state==='changed'?offer.revision+1:offer.revision}))};
  return parseSmeResult(tool,{schemaVersion:'kinnso.sme.read.v1',status:'ready',requestId,observedAt:at,
   scope:{workspaceId:scope.workspaceId,locationId:tool==='sme_offer_evidence_v1'?parsed.locationId:null,scopeVersion:scope.scopeVersion},data,warnings:[]});
 };
 return {providers:{clock,verifyOwnerProof,sme:{call},key:async()=>({id:'na-example',secret:Uint8Array.from(authorityKey)})},offer:structuredClone(offer),
  issueOwnerProof({nonce,companyBindingHash}){if(!/^[A-Za-z0-9_-]{43}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(companyBindingHash))throw Error('INVALID');
   const proof={id:randomUUID(),issuer:'fixture:'+runId,audience:'fixture:kinnso-native',companyBindingHash,nonce,workspaceId:scope.workspaceId,
    scopeVersion:scope.scopeVersion,locationIds:[...scope.locationIds],role:'owner',issuedAt:clock(),expiresAt:clock()+60000};
   const body=Buffer.from(JSON.stringify(proof)).toString('base64url');return 'example.'+body+'.'+mac(body).toString('base64url');},
  revokeProof(token){revoked.add(token);},changeScope(version){if(!Number.isSafeInteger(version)||version<=scope.scopeVersion)throw Error('INVALID');scope.scopeVersion=version;},
  setSourceState(next){if(!['current','changed','expired','archived','unavailable'].includes(next))throw Error('INVALID');state=next;},audit:()=>structuredClone(audit)};
}
