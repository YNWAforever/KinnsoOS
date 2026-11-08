// Memory-only authority for the isolated loopback preview. Never imported by native routes.
import {randomUUID,createHash} from 'node:crypto';
import {parseDiscoveryIntent,parseDiscoveryRead,commandDigest,hashValue,stableJson,object,uuid} from '../../../apps/journeys/lib/discovery/policy.ts';
import {preparePublication,validatePublication,grantFor,importKey,assertSameImport,checkContentGrant} from '../../../apps/journeys/lib/discovery/offers.ts';
import {createSmeFixture} from './sme-mcp-fixture.mjs';
import {validatePreferences,validateTripIntent,localDate} from '../../../apps/journeys/lib/discovery/intents.ts';
import {assertSource} from '../../../apps/journeys/lib/studio/evidence.ts';
import {sourceRef} from '../../../apps/journeys/lib/studio/contracts.ts';
import {evaluateOffer,rankOffers} from '../../../apps/journeys/lib/discovery/matching.ts';
import {DISCOVERY_COMPANIES,FIXTURE_RIGHTS,offerHash} from './discovery-data.mjs';

export function createDiscoveryBackend({actorId,now=()=>Date.now(),ownedTrip=()=>false,membership=null,campaignEligible=()=>false}={}){
 const links=new Map(),pendingLinks=new Map(),imports=new Map(),publications=new Map(),grants=new Map(),requests=new Map(),sourceChecks=new Map(),offerLists=new Map();
 const preferences=new Map(),intents=new Map(),matches=new Map(),choices=new Map(),tombstones=new Set();
 const matchedSources=new Map();
 const sme=createSmeFixture({now});let pending=null,queue=Promise.resolve();
 const stamp=()=>new Date(now()).toISOString(),clone=structuredClone;
 const ok=data=>({ok:true,data:clone(data)}),fail=code=>({ok:false,code,retryable:['TIMEOUT','UNAVAILABLE'].includes(code)});
 const authenticated=()=>{if(!actorId)throw Error('AUTH_REQUIRED');};
 const companies=()=>DISCOVERY_COMPANIES.flatMap(c=>{const m=membership?membership(c.id):c;return m?[{...c,name:m.name??c.name,role:m.role}]:[];});
 function company(id,owner=false){authenticated();const c=companies().find(c=>c.id===id);if(!c||owner&&c.role!=='owner')throw Error('FORBIDDEN');return c;}
 function linkFor(id,owner=true){const l=links.get(id);if(!l)throw Error('NOT_FOUND');company(l.companyId,owner);return l;}
 function publicationFor(id){const p=publications.get(id);if(!p)throw Error('NOT_FOUND');company(p.companyId,true);return p;}
 function revision(actual,expected){if(actual!==expected)throw Error('CONFLICT');}
 function revokePublication(p){p.status='withdrawn';p.withdrawnAt=stamp();p.revision++;for(const g of grants.values())if(g.publicationId===p.id&&!g.revokedAt)g.revokedAt=stamp();}
 function context(id){const publication=publications.get(id);if(!publication)return null;const imp=imports.get(publication.importId),link=links.get(imp?.linkId),check=sourceChecks.get(imp?.id);if(!imp||!link)return null;return clone({publication,import:imp,link,grants:[...grants.values()].filter(g=>g.publicationId===id),checkedAt:check?.at??imp.observedAt,sourceState:check?.state??'unavailable',campaignEligible:!!publication.campaignId&&campaignEligible(publication.campaignId,publication.companyId,now())});}
 async function ensureFresh(id){const c=context(id);if(!c||c.link.status!=='active')return false;if(now()-Date.parse(c.checkedAt)<=60000&&c.sourceState==='current')return true;
  if(!c.link.readRefreshAllowed)return false;
  const r=await sme.validateRefs([{offerId:c.import.externalOfferId,revision:c.import.sourceRevision,hash:c.import.sourceHash,locationId:c.import.appliedLocationId}],true);
  if(r.status==='error'){sourceChecks.set(c.import.id,{at:stamp(),state:'unavailable'});return false;}const item=r.data.items[0];sourceChecks.set(c.import.id,{at:stamp(),state:item?.state??'unavailable'});return item?.state==='current';
 }
 async function execute(raw){
  try{
   authenticated();const intent=parseDiscoveryIntent(raw),{targetId,expectedRevision,command:{kind,data}}=intent,digest=await commandDigest(intent);
   const previous=requests.get(intent.requestId);if(previous){if(previous.receipt.commandDigest!==digest)return fail('CONFLICT');if(previous.companyId)company(previous.companyId,true);return {ok:true,receipt:clone(previous.receipt)};}
   if(tombstones.has(targetId))return fail('CONFLICT');let rev=0,companyId=null;
   if(kind==='savePreferences'||kind==='clearPreferences'){
    if(targetId!==actorId)throw Error('FORBIDDEN');const prior=preferences.get(actorId);revision(prior?.revision??0,expectedRevision);rev=expectedRevision+1;
    if(kind==='clearPreferences')preferences.delete(actorId);else preferences.set(actorId,{...validatePreferences(data),ownerActorId:actorId,revision:rev,updatedAt:stamp()});
   }else if(kind==='saveIntent'){
    const value=validateTripIntent(data),prior=intents.get(targetId);revision(prior?.revision??0,expectedRevision);if(prior&&prior.ownerActorId!==actorId||value.linkedTripId&&!ownedTrip(value.linkedTripId,actorId))throw Error('FORBIDDEN');
    rev=expectedRevision+1;intents.set(targetId,{...value,id:targetId,ownerActorId:actorId,revision:rev,status:'active',createdAt:prior?.createdAt??stamp(),updatedAt:stamp()});
   }else if(kind==='archiveIntent'||kind==='deleteIntent'){
    const prior=intents.get(targetId);if(!prior||prior.ownerActorId!==actorId)throw Error('NOT_FOUND');revision(prior.revision,expectedRevision);rev=prior.revision+1;
    if(kind==='archiveIntent'){prior.status='archived';prior.revision=rev;prior.updatedAt=stamp();}
    else{intents.delete(targetId);tombstones.add(targetId);for(const [id,m]of matches)if(m.intentId===targetId){matches.delete(id);tombstones.add(id);}for(const [id,c]of choices)if(c.intentId===targetId)choices.delete(id);if(pending&&(pending.targetId===targetId||pending.command.data.intentId===targetId))pending=null;}
   }else if(kind==='recordMatch'){
    const tripIntent=intents.get(data.intentId);if(!tripIntent||tripIntent.ownerActorId!==actorId)throw Error('NOT_FOUND');revision(tripIntent.revision,data.intentRevision);if(tripIntent.status!=='active'||matches.has(targetId)||expectedRevision!==0)throw Error('CONFLICT');
    const contexts=[];for(const p of publications.values()){if(p.status!=='published')continue;await ensureFresh(p.id);const c=context(p.id);if(c)contexts.push(c);}
    const ranked=rankOffers(tripIntent,contexts,[...choices.values()],new Date(now()));rev=1;matches.set(targetId,{...ranked,id:targetId,ownerActorId:actorId,intentId:tripIntent.id,intentRevision:tripIntent.revision,policyVersion:'matching-v1',candidateSetHash:await hashValue(contexts.map(c=>({id:c.publication.id,revision:c.publication.revision,hash:c.publication.contentHash}))),computedAt:stamp()});
   }else if(kind==='chooseOffer'){
    const i=intents.get(data.intentId),c=context(data.publicationId);if(!i||i.ownerActorId!==actorId||!c)throw Error('NOT_FOUND');
    if(data.choice==='saved'&&evaluateOffer(i,c,new Date(now())).eligibility==='excluded')throw Error('RESTRICTED');
    const key=stableJson([actorId,i.id,data.publicationId]),prior=choices.get(key);revision(prior?.revision??0,expectedRevision);rev=expectedRevision+1;choices.set(key,{ownerActorId:actorId,intentId:i.id,publicationId:data.publicationId,revision:rev,choice:data.choice,updatedAt:stamp()});
   }else if(kind==='beginLink'){
    const c=company(data.companyId,true);companyId=c.id;if(links.has(targetId)||expectedRevision!==0)throw Error('CONFLICT');
    if(data.locationIds.some(id=>id!==c.locationId)||[...links.values()].some(l=>l.companyId===c.id&&l.status==='active'))throw Error('FORBIDDEN');
    const p=await sme.beginLink(c.id,data.locationIds,c.role);company(companyId,true);pendingLinks.set(targetId,p);rev=1;
    links.set(targetId,{id:targetId,companyId:c.id,smeWorkspaceId:'workspace-a',locationIds:data.locationIds,linkVersion:rev,status:'pending',proofDigest:null,verifiedAt:null,readRefreshAllowed:false});
   }else if(kind==='confirmLink'){
    const l=linkFor(targetId);companyId=l.companyId;revision(l.linkVersion,expectedRevision);if(l.status!=='pending')throw Error('CONFLICT');
    const proof=await sme.confirm(pendingLinks.get(targetId),data.proof,company(l.companyId,true).role),proofDigest=await hashValue(data.proof);company(companyId,true);l.status='active';l.smeWorkspaceId=proof.workspaceId;l.proofDigest=proofDigest;l.verifiedAt=stamp();l.readRefreshAllowed=data.readRefreshAllowed;rev=++l.linkVersion;pendingLinks.delete(targetId);
   }else if(kind==='revokeLink'){
    const l=linkFor(targetId);companyId=l.companyId;revision(l.linkVersion,expectedRevision);l.status='revoked';l.readRefreshAllowed=false;rev=++l.linkVersion;pendingLinks.delete(targetId);offerLists.delete(l.id);for(const p of publications.values())if(imports.get(p.importId)?.linkId===l.id)revokePublication(p);
   }else if(kind==='importOffer'){
    const l=linkFor(data.linkId);companyId=l.companyId;if(l.status!=='active'||!l.locationIds.includes(data.locationId))throw Error('FORBIDDEN');if(publications.has(targetId)||expectedRevision!==0)throw Error('CONFLICT');
    const r=await sme.call('sme_offer_evidence_v1',{offerId:data.offerId,expectedRevision:data.expectedSourceRevision,locationId:data.locationId},{context:{companyId:l.companyId,workspaceId:l.smeWorkspaceId,locationIds:l.locationIds,readRefreshAllowed:l.readRefreshAllowed}});if(r.status==='error')throw Error(r.code);
    if(await offerHash(r.data)!==r.data.hash)throw Error('SOURCE_CHANGED');company(companyId,true);
    let imp={id:randomUUID(),linkId:l.id,externalOfferId:r.data.offerId,sourceRevision:r.data.revision,sourceHash:r.data.hash,appliedLocationId:data.locationId,sourceLocationId:r.data.sourceLocationId,observedAt:r.observedAt,sourceScopeVersion:r.scope.scopeVersion,fields:r.data};
    const prior=[...imports.values()].find(i=>importKey(i)===importKey(imp));if(prior){assertSameImport(prior,imp);imp=prior;}
    if([...publications.values()].some(p=>p.importId===imp.id&&p.companyId===l.companyId))throw Error('CONFLICT');
    imports.set(imp.id,clone(imp));sourceChecks.set(imp.id,{state:'current',at:stamp()});rev=1;
    publications.set(targetId,{id:targetId,companyId:l.companyId,revision:rev,contentVersion:0,importId:imp.id,cityKey:'',dateTimeZone:'',priceBasis:'unknown',interestTags:[],languages:[],audiences:[],displayFields:[],contentHash:'',previewDigest:'',status:'draft',publishedAt:null,withdrawnAt:null});
   }else if(kind==='preparePublication'){
    const current=publicationFor(targetId);companyId=current.companyId;revision(current.revision,expectedRevision);const offerImport=imports.get(data.importId);if(!offerImport||links.get(offerImport.linkId)?.companyId!==companyId||data.importId!==current.importId)throw Error('FORBIDDEN');
    if(!await ensureFresh(current.id))throw Error('SOURCE_CHANGED');
    const p=await preparePublication(data,{current,offerImport,companyId,role:company(companyId,true).role,now:new Date(now())});company(companyId,true);publications.set(targetId,p);rev=p.revision;
   }else if(kind==='grantContentUse'){
    const p=publicationFor(targetId);companyId=p.companyId;revision(p.revision,expectedRevision);
    if(data.publicationContentVersion!==p.contentVersion||!p.contentVersion||data.previewDigest!==p.previewDigest||data.rightsBasisRef!==FIXTURE_RIGHTS||data.allowedFields.some(f=>!p.displayFields.includes(f))||p.displayFields.some(f=>!data.allowedFields.includes(f))||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now()||p.status==='withdrawn')throw Error('RESTRICTED');
    if(!await ensureFresh(p.id))throw Error('SOURCE_CHANGED');company(companyId,true);
    for(const purpose of data.purposes){const prior=[...grants.values()].filter(g=>g.publicationId===p.id&&g.publicationContentVersion===p.contentVersion&&g.purpose===purpose);for(const g of prior)if(!g.revokedAt)g.revokedAt=stamp();const g={id:randomUUID(),publicationId:p.id,publicationContentVersion:p.contentVersion,grantVersion:Math.max(0,...prior.map(g=>g.grantVersion))+1,grantorCompanyId:companyId,issuerActorId:actorId,contentHash:p.contentHash,allowedFields:clone(data.allowedFields),purpose,expiresAt:data.expiresAt,revokedAt:null,rightsBasisRef:data.rightsBasisRef,verificationState:'approved'};grants.set(g.id,g);}
    rev=++p.revision;
   }else if(kind==='revokeContentUse'){
    const g=grants.get(targetId);if(!g)throw Error('NOT_FOUND');companyId=g.grantorCompanyId;company(companyId,true);revision(g.grantVersion,expectedRevision);g.revokedAt=stamp();rev=g.grantVersion;publications.get(g.publicationId).revision++;
   }else if(kind==='publishOffer'){
    const p=publicationFor(targetId);companyId=p.companyId;revision(p.revision,expectedRevision);const decision=validatePublication(data,{publication:p,grants:[...grants.values()],sourceCurrent:await ensureFresh(p.id),now:new Date(now())});if(!decision.allowed)throw Error(decision.reason);company(companyId,true);p.status='published';p.publishedAt=stamp();rev=++p.revision;
   }else if(kind==='withdrawOffer'){
    const p=publicationFor(targetId);companyId=p.companyId;revision(p.revision,expectedRevision);revokePublication(p);rev=p.revision;
   }else throw Error('UNAVAILABLE');
   const receipt={requestId:intent.requestId,commandDigest:digest,resourceId:targetId,revision:rev};requests.set(intent.requestId,{receipt,companyId});return {ok:true,receipt:clone(receipt)};
  }catch(e){return fail(['AUTH_REQUIRED','FORBIDDEN','NOT_FOUND','CONFLICT','INVALID','UNAVAILABLE','RESTRICTED','SOURCE_CHANGED','TIMEOUT','NOT_CONNECTED','UNSUPPORTED','RATE_LIMITED'].includes(e.message)?e.message:'INVALID');}
 }
 function command(input){const task=queue.then(()=>execute(input));queue=task.then(()=>undefined,()=>undefined);return task;}
 async function read(raw){try{const scope=parseDiscoveryRead(raw);if(scope.kind==='companyOffers'){const c=company(scope.companyId);const canManage=c.role==='owner',link=[...links.values()].find(l=>l.companyId===c.id&&l.status!=='revoked')??null;return ok({companyId:c.id,canManage,link,imports:canManage?[...imports.values()].filter(i=>links.get(i.linkId)?.companyId===c.id):[],publications:canManage?[...publications.values()].filter(p=>p.companyId===c.id):[],grants:canManage?[...grants.values()].filter(g=>g.grantorCompanyId===c.id):[],availableOffers:canManage?(offerLists.get(link?.id)??[]):[]});}
   if(scope.kind==='publicOffers'){const sample={cityKey:'city:hk:hong-kong',dateSpec:{kind:'undecided'},budget:null,interestTags:[],languages:[]};return ok([...publications.values()].map(p=>context(p.id)).filter(Boolean).map(c=>evaluateOffer(sample,c,new Date(now()))).filter(r=>r.eligibility!=='excluded'));}
   authenticated();if(scope.kind==='preferences')return ok(preferences.get(actorId)??null);if(scope.kind==='intents')return ok([...intents.values()].filter(i=>i.ownerActorId===actorId));if(scope.kind==='intent'){const value=intents.get(scope.id);return value?.ownerActorId===actorId?ok(value):fail('NOT_FOUND');}
   if(scope.kind==='match'){const run=matches.get(scope.id),i=intents.get(run?.intentId);if(!run||run.ownerActorId!==actorId||!i)return fail('NOT_FOUND');const result=clone(run);result.results=result.results.flatMap(r=>{const c=context(r.publicationId);if(!c||c.publication.contentVersion!==r.contentVersion)return [];const fresh=evaluateOffer(i,c,new Date(now()));if(fresh.eligibility==='excluded')return [];const choice=choices.get(stableJson([actorId,i.id,r.publicationId]));return [{...r,grantVersions:fresh.grantVersions.filter(g=>r.grantVersions.some(prior=>prior.id===g.id&&prior.version===g.version)),checkedAt:fresh.checkedAt,choice:choice?.choice??'cleared',choiceRevision:choice?.revision??0}];});return ok(result);}
   return fail('UNAVAILABLE');}catch(e){return fail(e.message);}}
 async function receipt(requestId){if(!actorId)return {status:'restricted',requestId};const r=requests.get(requestId);if(!r)return {status:'unknown',requestId};if(r.companyId&&!companies().some(c=>c.id===r.companyId&&c.role==='owner'))return {status:'restricted',requestId};return {status:'complete',receipt:clone(r.receipt),resourceState:tombstones.has(r.receipt.resourceId)?'deleted':'present'};}
 async function attestLink(id){const l=linkFor(id);if(l.status!=='pending')throw Error('CONFLICT');return sme.attest(pendingLinks.get(id));}
 async function refreshOffers(id){const l=linkFor(id);if(l.status!=='active')throw Error('NOT_CONNECTED');const r=await sme.call('sme_confirmed_offers_v1',{locationId:l.locationIds[0]},{context:{companyId:l.companyId,workspaceId:l.smeWorkspaceId,locationIds:l.locationIds,readRefreshAllowed:l.readRefreshAllowed}});if(r.status==='error')throw Error(r.code);offerLists.set(l.id,clone(r.data.items));for(const i of imports.values())if(i.linkId===l.id){const current=r.data.items.find(o=>o.offerId===i.externalOfferId);sourceChecks.set(i.id,{at:stamp(),state:current?.hash===i.sourceHash&&current?.revision===i.sourceRevision?'current':'changed'});}return read({kind:'companyOffers',companyId:l.companyId});}
 function refreshSource(source){
  if(source.rights!=='licensed')return clone(source);const c=context(source.license?.provenance.publicationId),value=clone(source),p=source.license?.provenance;
  const restrict=()=>({...value,status:'restricted',text:'',license:{...value.license,grants:[]}});
  if(!c||!p||c.publication.status!=='published'||c.link.status!=='active'||c.publication.contentVersion!==p.contentVersion||c.publication.contentHash!==p.contentHash||c.import.sourceHash!==p.importHash||c.sourceState!=='current'||c.import.fields.sourceStatus!=='confirmed'||localDate(new Date(now()),c.publication.dateTimeZone)>c.import.fields.validUntil)return restrict();
  value.license.grants=c.grants.filter(g=>p.grantRefs.some(ref=>ref.id===g.id&&ref.version===g.grantVersion));value.license.provenance.checkedAt=c.checkedAt;
  try{assertSource(sourceRef(value),[value],'private',new Date(now()));return value;}catch{return restrict();}
 }
 function selectedContext(input){object(input,['matchRunId','publicationId']);uuid(input.matchRunId);uuid(input.publicationId);authenticated();const run=matches.get(input.matchRunId),i=intents.get(run?.intentId),choice=choices.get(stableJson([actorId,run?.intentId,input.publicationId])),item=run?.results.find(r=>r.publicationId===input.publicationId),c=context(input.publicationId);
  if(!run||run.ownerActorId!==actorId||!i||i.status!=='active'||i.revision!==run.intentRevision||choice?.choice!=='saved'||!item||!c||c.publication.contentVersion!==item.contentVersion)throw Error('RESTRICTED');return {run,item,c};
 }
 async function resolveSources(input){try{const {item,c}=selectedContext(input);if(!await ensureFresh(c.publication.id))throw Error('SOURCE_CHANGED');const key=stableJson(input);let source=matchedSources.get(key);
  if(!source){const fresh=context(c.publication.id),privateGrant=grantFor(fresh.publication,fresh.grants,'private_brief',new Date(now()));if(!privateGrant||!item.grantVersions.some(g=>g.id===privateGrant.id&&g.version===privateGrant.grantVersion))throw Error('RESTRICTED');
   const available=fresh.grants.filter(g=>item.grantVersions.some(ref=>ref.id===g.id&&ref.version===g.grantVersion)),id=randomUUID(),text=[fresh.publication.displayFields.includes('details')?fresh.import.fields.details:'','條款：'+fresh.import.fields.terms].filter(Boolean).join('\n\n');
   source={id,threadId:'',ownerId:actorId,title:fresh.import.fields.title,text,version:1,aclVersion:1,hash:createHash('sha256').update(text).digest('hex'),rights:'licensed',status:'active',createdAt:stamp(),license:{fields:fresh.publication.displayFields,provenance:{sourceId:id,publicationId:fresh.publication.id,contentVersion:fresh.publication.contentVersion,contentHash:fresh.publication.contentHash,grantRefs:available.map(g=>({purpose:g.purpose,id:g.id,version:g.grantVersion})),importHash:fresh.import.sourceHash,checkedAt:fresh.checkedAt},grants:available}};matchedSources.set(key,clone(source));
  }const value=refreshSource(source);if(value.status!=='active')throw Error('RESTRICTED');return {ok:true,sources:[value]};
 }catch(e){return fail(e.message);}}
 function sourceForWrite(id,input){selectedContext(input);const source=matchedSources.get(stableJson(input));if(!source||source.id!==id)throw Error('RESTRICTED');const value=refreshSource(source);if(value.status!=='active')throw Error('RESTRICTED');return value;}
 function sourceGrant(sourceId,purpose,{requireFresh=false}={}){const s=[...matchedSources.values()].find(s=>s.id===sourceId),provenance=s?.license?.provenance,c=context(provenance?.publicationId);if(!s||!c||c.publication.status!=='published'||c.link.status!=='active'||c.sourceState!=='current'||c.publication.contentVersion!==provenance.contentVersion||c.publication.contentHash!==provenance.contentHash||c.import.fields.sourceStatus!=='confirmed'||localDate(new Date(now()),c.publication.dateTimeZone)>c.import.fields.validUntil)return null;if(requireFresh&&(!Number.isFinite(Date.parse(c.checkedAt))||now()-Date.parse(c.checkedAt)>60000||Date.parse(c.checkedAt)>now()+1000))return null;const grant=c.grants.find(g=>g.purpose===purpose&&provenance.grantRefs.some(r=>r.id===g.id&&r.version===g.grantVersion));return grant&&s.license.fields.every(f=>grant.allowedFields.includes(f))&&checkContentGrant(grant,provenance,purpose,new Date(now())).allowed?clone(grant):null;}
 async function tripSuggestion(input){try{object(input,['intentId','publicationId']);uuid(input.intentId);uuid(input.publicationId);authenticated();const intent=intents.get(input.intentId),choice=choices.get(stableJson([actorId,input.intentId,input.publicationId]));if(!intent||intent.ownerActorId!==actorId||choice?.choice!=='saved'||!await ensureFresh(input.publicationId))throw Error('RESTRICTED');const c=context(input.publicationId),offer=c&&evaluateOffer(intent,c,new Date(now()));if(!offer||offer.eligibility==='excluded')throw Error('RESTRICTED');return {ok:true,intent:clone(intent),offer};}catch(e){return fail(e.message);}}
 function assertPendingScope(intent){
  if(!intent)return;const {targetId,command:{kind,data}}=intent;
  const companyId=kind==='beginLink'?data.companyId:kind==='importOffer'?links.get(data.linkId)?.companyId:links.get(targetId)?.companyId??publications.get(targetId)?.companyId??grants.get(targetId)?.grantorCompanyId;
  if(companyId)company(companyId,true);
 }
 const api={command,read,receipt,attestLink,refreshOffers,context,ensureFresh,resolveSources,refreshSource,sourceForWrite,sourceGrant,tripSuggestion,sme,companies:DISCOVERY_COMPANIES,
  pending:async()=>{authenticated();assertPendingScope(pending);return clone(pending);},stage:async value=>{authenticated();const v=parseDiscoveryIntent(value);assertPendingScope(v);if(pending&&stableJson(pending)!==stableJson(v))throw Error('CONFLICT');pending=clone(v);},clear:async id=>{authenticated();uuid(id);if(pending?.requestId===id)pending=null;}};
 api.handle=async(method,path,body)=>{
  try{let value;
   if(path==='/reads'&&method==='POST')value=await read(body);
   else if(path==='/commands'&&method==='POST')value=await command(body);
   else if(path.startsWith('/receipts/')&&method==='GET')value=await receipt(uuid(path.slice('/receipts/'.length)));
   else if(path==='/pending'&&method==='GET')value=await api.pending();
   else if(path==='/pending'&&method==='POST'){await api.stage(body);value={ok:true};}
   else if(path==='/pending'&&method==='DELETE'){object(body,['requestId']);await api.clear(body.requestId);value={ok:true};}
   else if(path==='/companies'&&method==='GET'){authenticated();value=clone(companies());}
   else if(path==='/attest'&&method==='POST'){object(body,['id']);value=await attestLink(uuid(body.id));}
   else if(path==='/refresh'&&method==='POST'){object(body,['id']);value=await refreshOffers(uuid(body.id));}
   else if(path==='/sources'&&method==='POST')value=await resolveSources(body);
   else if(path==='/trip-suggestion'&&method==='POST')value=await tripSuggestion(body);
   else if(path==='/test-expire'&&method==='POST'){object(body,['offerId']);authenticated();await sme.mutateOffer(body.offerId,{sourceStatus:'expired'});for(const l of links.values())if(l.status==='active')await refreshOffers(l.id);value={ok:true,mode:'EXAMPLES_ONLY'};}
   else return {status:404,body:fail('NOT_FOUND')};
   return {status:200,body:value};
  }catch(e){return {status:e.message==='FORBIDDEN'||e.message==='AUTH_REQUIRED'?403:409,body:fail(e.message)};}
 };
 return api;
}
