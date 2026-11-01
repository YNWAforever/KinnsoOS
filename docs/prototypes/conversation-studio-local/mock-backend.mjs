// LOCAL PREVIEW ONLY. In-memory examples, never a database or production API.
import {createHash, randomUUID} from 'node:crypto';
import {exampleData} from './example-data.mjs';
import {creatorMissionCommand} from '../../../apps/journeys/lib/creators/collaboration-validation.ts';
import {travellerExamples} from './traveller-backend.mjs';
import {memoryCache} from './memory-cache-backend.mjs';
import {merchantExamples} from './merchant-backend.mjs';
import {createDiscoveryBackend} from './discovery-backend.mjs';
import {assertSource,readableBrief} from '../../../apps/journeys/lib/studio/evidence.ts';
import {sourceRef} from '../../../apps/journeys/lib/studio/contracts.ts';
import {createDerivativeRegistry} from './discovery-derivatives.mjs';
import {publicationReadiness} from '../../../apps/journeys/lib/creators/editor-operations.ts';

export const ACTOR = '22222222-2222-4222-8222-222222222222';
export function createExampleBackend({origin='http://127.0.0.1:3499',publicShares=new Map()}={}) {
  const traveller=travellerExamples(ACTOR,origin,publicShares);
  const cache=memoryCache(ACTOR);
  const merchant=merchantExamples(ACTOR);
  const discovery=createDiscoveryBackend({actorId:ACTOR,ownedTrip:id=>traveller.handle('GET','/api/trips/'+id)?.body?.ok===true,membership:id=>merchant.handle('GET','/api/merchant')?.body?.data.find(m=>m.merchantId===id),campaignEligible:(id,companyId,now)=>{const r=merchant.handle('GET','/api/merchant/campaigns',undefined,new URLSearchParams({id:companyId,campaignId:id})),c=r?.body?.ok&&r.body.data.detail;return !!c&&c.status==='published'&&Date.parse(c.applicationOpensAt)<=now&&Date.parse(c.applicationClosesAt)>=now;}});
  const derivatives=createDerivativeRegistry(discovery);traveller.useDiscovery(derivatives);discovery.bindings=derivatives.all;
  const {threads,guides,handoffs,published,versions,adopted,missions,earnings}=exampleData(ACTOR);
  const receipts = new Map(), domainReceipts = new Map(), reports=new Map(), reportReceipts=new Map(),reportIntents=new Map();
  const clone = value => structuredClone(value);
  const ok = data => ({status: 200, body: {ok: true, data: clone(data)}});
  const fail = (code, status = 409) => ({status, body: {ok: false, code, retryable: code === 'UNAVAILABLE'}});
  const findBrief = id => [...threads.values()].flatMap(t => t.artifacts).find(a => a.id === id);
  const currentSources = brief => (threads.get(brief?.threadId)?.sources ?? []).map(discovery.refreshSource);
  const projectThread=thread=>{const value=clone(thread);value.sources=value.sources.map(discovery.refreshSource);value.artifacts=value.artifacts.filter(b=>readableBrief(b,value.sources));value.messages=value.messages.filter(m=>m.sourceIds.every(id=>value.sources.some(s=>s.id===id&&s.status==='active')));return value;};
  const receiptReadable=value=>{
    if(Array.isArray(value?.sources)&&Array.isArray(value?.messages)){
      const current=threads.get(value.id);return !!current&&value.sources.every(s=>current.sources.some(c=>c.id===s.id&&c.version===s.version&&c.aclVersion===s.aclVersion&&c.hash===s.hash&&discovery.refreshSource(c).status==='active'));
    }
    if(value?.rights==='licensed')return discovery.refreshSource(value).status==='active';
    if(value?.blocks)return !!readableBrief(value,currentSources(value));
    if(value?.artifactId){const brief=findBrief(value.artifactId);return !!brief&&!!readableBrief(brief,currentSources(brief));}
    return true;
  };
  function allowedBlocks(brief,selectedBlockIds,purpose='public'){
    if(!brief)return false;const blocks=brief.blocks.filter(b=>selectedBlockIds.includes(b.id)),sources=currentSources(brief);
    try{if(!blocks.length||blocks.length!==selectedBlockIds.length)throw Error();for(const b of blocks){if(purpose==='public'&&b.intendedUse!=='public-candidate')throw Error();for(const ref of b.sources){const s=assertSource(ref,sources,purpose);if(s.rights==='licensed'&&Date.now()-Date.parse(s.license.provenance.checkedAt)>60000)throw Error();}}return true;}catch{return false;}
  }
  function draftReadable(guide){if(!guide?.studio)return true;const h=handoffs.get(guide.id),brief=findBrief(h?.artifactId);return !!brief&&!!readableBrief(brief,currentSources(brief));}
  function projectDraft(guide){const value=clone(guide),h=handoffs.get(guide?.id),brief=findBrief(h?.artifactId);if(!brief)return value;const licensed=currentSources(brief).filter(s=>s.rights==='licensed'&&brief.blocks.some(b=>h.selectedBlockIds.includes(b.id)&&b.sources.some(r=>r.sourceId===s.id)));if(licensed.some(s=>!discovery.sourceGrant(s.id,'public_guide'))){value.sourceChanged=true;value.studio={...value.studio,restricted:true};}return value;}
  function sourceReadable(source){
    if(source?.kind==='guide'){
      const guide=guides.get(source.value.id),h=handoffs.get(source.value.id);if(!guide||guide.studio?.restricted)return false;
      if(!h)return !guide.studio;
      const brief=findBrief(h.artifactId);if(!brief)return false;
      const selected=brief.blocks.filter(b=>h.selectedBlockIds.includes(b.id)),sources=currentSources(brief);
      return selected.length>0&&selected.every(b=>b.sources.every(ref=>sources.some(s=>s.id===ref.sourceId&&s.status==='active'&&s.version===ref.version&&s.aclVersion===ref.aclVersion&&s.hash===ref.hash)));
    }
    if(source?.kind==='mission')return missions.get(source.value.id)?.participant?.status==='active';
    return source?.kind==='earnings'&&['settled','tracked','payouts'].includes(source.value.section);
  }
  const readableReport=report=>report?.ownerId===ACTOR&&sourceReadable(report.source);
  const currentSource=source=>source?.kind==='guide'?(guides.has(source.value.id)?projectDraft(guides.get(source.value.id)):null):source?.kind==='mission'?missions.get(source.value.id):source?.kind==='earnings'?earnings(source.value.section):null;

  const handle=function handle(method, pathname, body, query=new URLSearchParams()) {
    if(pathname==='/__preview/cache'&&method==='POST')return cache(body);
    const merchantReply=merchant.handle(method,pathname,body,query);if(merchantReply)return merchantReply;
    const travellerReply=traveller.handle(method,pathname,body,query);if(travellerReply)return travellerReply;
    if(pathname==='/__preview/report-intents'&&method==='POST'){
      if(!body?.requestId||!body.report||!readableReport(body.report))return fail('RESTRICTED',403);
      const old=reportIntents.get(body.requestId);if(old)return JSON.stringify(old)===JSON.stringify(body)?ok(old):fail('CONFLICT');
      if(JSON.stringify(currentSource(body.report.source))!==JSON.stringify(body.report.source.value))return fail('CONFLICT');
      reportIntents.set(body.requestId,clone(body));return ok(body);
    }
    if(pathname.startsWith('/__preview/report-intents/')&&method==='GET'){
      const intent=reportIntents.get(pathname.split('/').at(-1));if(!intent)return fail('NOT_FOUND',404);
      return readableReport(intent.report)?ok(intent):fail('RESTRICTED',403);
    }
    if(pathname==='/__preview/reports'){
      if(method==='GET')return ok({items:[...reports.values()].filter(readableReport)});
      if(method!=='POST'||!body?.requestId||!body.report||!Number.isInteger(body.expectedRevision))return fail('INVALID',400);
      if(!readableReport(body.report))return fail('RESTRICTED',403);
      if(JSON.stringify(reportIntents.get(body.requestId))!==JSON.stringify(body))return fail('INVALID',400);
      const old=reportReceipts.get(body.requestId);
      if(old)return old.intent===JSON.stringify(body)?ok(old.report):fail('CONFLICT');
      const report=body.report,source=report.source;
      if(report.ownerId!==ACTOR||report.visibility!=='private'||report.approval!==false||!['C2','C3','C4','C5'].includes(report.templateId))return fail('FORBIDDEN',403);
      const current=currentSource(source);
      if(!current)return fail('NOT_FOUND',404);
      if(source.kind==='mission'&&current.participant?.status!=='active')return fail('FORBIDDEN',403);
      if(JSON.stringify(current)!==JSON.stringify(source.value)||(reports.get(report.id)?.revision??0)!==body.expectedRevision)return fail('CONFLICT');
      const saved={...clone(report),revision:body.expectedRevision+1};
      reports.set(saved.id,saved);reportReceipts.set(body.requestId,{intent:JSON.stringify(body),report:clone(saved)});return ok(saved);
    }
    if(pathname.startsWith('/__preview/reports/')&&method==='GET'){const report=reports.get(pathname.split('/').at(-1));return report?readableReport(report)?ok(report):fail('RESTRICTED',403):fail('NOT_FOUND',404);}
    if(pathname.startsWith('/__preview/report-requests/')&&method==='GET'){const receipt=reportReceipts.get(pathname.split('/').at(-1));if(receipt&&!readableReport(receipt.report))return fail('RESTRICTED',403);return ok(receipt?{status:'complete',report:receipt.report}:{status:'unknown'});}
    if(pathname.startsWith('/__preview/adopted/')&&method==='GET'){const value=adopted.get(pathname.split('/').at(-1));return value?ok(value):fail('NOT_FOUND',404);}
    if(pathname.startsWith('/__preview/versions/')&&method==='GET'){const id=pathname.split('/').at(-1);return ok({items:(versions.get(id)??[]).map(derivatives.projectGuide).filter(Boolean),adopted:adopted.get(id)??null});}
    if(pathname==='/api/creator/profile'&&method==='GET')return ok({step:'done',jobId:null,jobStatus:null,retryable:false,profile:{bio:'本機示例創作者',niches:[],content_pillars:[],tone:[],languages:['zh-HK']},profileReady:true,handles:[],scanAvailable:false});
    if(pathname==='/api/creator/guides'&&method==='GET')return ok({items:[...guides.values()].filter(draftReadable).map(projectDraft),nextCursor:null});
    if(pathname==='/api/creator/earnings'&&method==='GET'){const section=query.get('section')??'settled';return ['settled','tracked','payouts'].includes(section)?ok(earnings(section)):fail('INVALID',400);}
    if(pathname==='/api/creator/missions'&&method==='GET')return ok({items:[...missions.values()],nextCursor:null});
    if(pathname.startsWith('/api/creator/missions/')){
      const m=missions.get(pathname.split('/').at(-1));if(!m)return fail('NOT_FOUND',404);
      if(method==='GET')return ok(m);
      if(method!=='POST'||!body?.requestId||body.command?.type!=='submitEvidence')return fail('UNAVAILABLE',503);
      const key='mission:'+m.id+':'+body.requestId,prior=domainReceipts.get(key);
      if(prior)return prior.intent===JSON.stringify(body)?ok(prior.data):fail('CONFLICT');
      if(m.participant?.status!=='active'||!m.evidenceAvailable)return fail('FORBIDDEN',403);
      let command;try{command=creatorMissionCommand(body.command);}catch{return fail('INVALID',400);}
      const s=m.submissions.find(s=>s.id===command.submissionId);
      if(!s||s.updatedAt!==command.expectedUpdatedAt||s.milestoneId!==command.milestoneId)return fail('CONFLICT');
      if(!Array.isArray(command.proofUrls)||!command.proofUrls.length||!command.proofUrls.every(url=>typeof url==='string'&&url.startsWith('https://')))return fail('INVALID',400);
      s.status='submitted';s.proofUrls=clone(command.proofUrls);s.notes=command.notes;s.updatedAt=new Date().toISOString();s.submittedAt=s.updatedAt;
      const receipt={id:s.id,status:s.status,updatedAt:s.updatedAt};domainReceipts.set(key,{intent:JSON.stringify(body),data:clone(receipt)});return ok(receipt);
    }
    if (pathname === '/api/studio/threads' && method === 'GET') return ok({items: [...threads.values()].map(projectThread)});
    if (pathname.startsWith('/api/studio/threads/') && method === 'GET') {
      const thread = threads.get(pathname.split('/').at(-1));
      return thread ? ok(projectThread(thread)) : fail('NOT_FOUND', 404);
    }
    if (pathname.startsWith('/api/studio/requests/') && method === 'GET') {
      const receipt = receipts.get(pathname.split('/').at(-1))?.receipt;
      return receipt&&!receiptReadable(receipt.data)?ok({status:'restricted'}):ok(receipt ? {status: 'complete', receipt} : {status: 'unknown'});
    }
    if (pathname === '/api/studio/commands' && method === 'POST') {
      if (!body?.requestId || !body?.payload) return fail('INVALID', 400);
      const previous = receipts.get(body.requestId);
      if (previous) return !receiptReadable(previous.receipt.data)?fail('RESTRICTED',403):previous.intent === JSON.stringify(body) ? ok(previous.receipt) : fail('CONFLICT');
      const {kind, targetId, data} = body.payload;
      let value, revision = 1;
      if (kind === 'createThread') {
        if (threads.has(targetId)) return fail('CONFLICT');
        value = {id: targetId, ownerId: ACTOR, topic: data.topic, templateId: data.templateId, title: data.title, revision: 1, archived: false, messages: [], sources: [], artifacts: []};
        threads.set(targetId, value);
      } else if (kind === 'saveSource') {
        const thread = threads.get(data.threadId);
        if (!thread || thread.sources.some(s => s.id === targetId)) return fail('CONFLICT');
        if(data.rights==='licensed'){
          try{const source=discovery.sourceForWrite(targetId,data.matchContext);if(source.title!==data.title||source.text!==data.text)return fail('CONFLICT');value={...source,threadId:data.threadId};}catch{return fail('RESTRICTED',403);}
        }else{if(!['own','unknown'].includes(data.rights))return fail('INVALID',400);value = {id: targetId, threadId: data.threadId, ownerId: ACTOR, title: data.title, text: data.text, rights: data.rights, version: 1, aclVersion: 1, hash: createHash('sha256').update(data.text).digest('hex'), status: 'active', createdAt: new Date().toISOString()};}
        thread.sources.push(value);
      } else if (kind === 'appendMessage') {
        const thread = threads.get(targetId);
        if (!thread || thread.revision !== body.expectedRevision) return fail('CONFLICT');
        thread.messages.push({id: randomUUID(), role: 'user', body: data.body, sourceIds: data.sourceIds});
        revision = ++thread.revision;
        value = thread;
      } else if (kind === 'saveArtifact') {
        const thread = threads.get(data.threadId);
        const existing = thread?.artifacts.find(a => a.id === targetId);
        if (!thread || (existing?.revision ?? 0) !== body.expectedRevision) return fail('CONFLICT');
        if(data.brief?.threadId!==data.threadId||!readableBrief(data.brief,thread.sources.map(discovery.refreshSource)))return fail('RESTRICTED',403);
        if(thread.sources.some(s=>s.rights==='licensed'&&data.brief.blocks.some(b=>b.sources.some(r=>r.sourceId===s.id))&&Date.now()-Date.parse(discovery.context(s.license.provenance.publicationId)?.checkedAt??'')>60000))return fail('RESTRICTED',403);
        revision = body.expectedRevision + 1;
        value = {...clone(data.brief), revision};
        thread.artifacts = [value, ...thread.artifacts.filter(a => a.id !== targetId)];
      } else if (kind === 'restrictSource') {
        for (const thread of threads.values()) {
          const source = thread.sources.find(s => s.id === targetId);
          if (source) {
            source.status = 'restricted'; source.text = ''; source.version++; source.aclVersion++;
            revision = source.version; value = source; thread.artifacts = [];
          }
        }
        if (!value) return fail('NOT_FOUND', 404);
      } else if (kind === 'prepareGuideSave' || kind === 'prepareGuidePublish') {
        if (!data.confirmed) return fail('INVALID', 400);
        const prior = handoffs.get(data.guideId);
        const artifactId = data.artifactId ?? prior?.artifactId;
        const artifactRevision = data.artifactRevision ?? prior?.artifactRevision;
        const selectedBlockIds = data.selectedBlockIds ?? prior?.selectedBlockIds ?? [];
        const brief = findBrief(artifactId);
        if (!brief) return fail('RESTRICTED', 403);
        const blocks = brief.blocks.filter(b => selectedBlockIds.includes(b.id));
        const sources = currentSources(brief);
        if(!allowedBlocks(brief,selectedBlockIds))return fail('RESTRICTED',403);
        if(brief.revision!==artifactRevision)return fail('CONFLICT');
        const guide = guides.get(data.guideId);
        if ((guide?.revision ?? 0) !== data.expectedGuideRevision) return fail('CONFLICT');
        const operation = kind === 'prepareGuidePublish' ? 'publish' : 'save';
        let payload = data.editedPayload;
        if (operation === 'publish') payload = guide?.payload;
        else if (!payload) payload = {title: brief.title, city: brief.city, summary: brief.summary, content: {days: [{offset: 0, title: '', stops: blocks.map(b => ({title: b.title, description: b.text, placeId: null, startMinuteOfDay: null, durationMinutes: null}))}]}};
        if (!payload) return fail('INVALID', 400);
        value = {id: targetId, artifactId, artifactRevision, guideId: data.guideId, expectedRevision: data.expectedGuideRevision, domainRequestId: data.domainRequestId, operation, payload: clone(payload), digest: 'LOCAL_EXAMPLE_ONLY'};
        handoffs.set(data.guideId, {...clone(value), selectedBlockIds, threadId: brief.threadId});
      } else return fail('UNAVAILABLE', 503);
      const receipt = {requestId: body.requestId, resourceId: targetId, revision, digest: 'LOCAL_EXAMPLE_ONLY', data: clone(value)};
      receipts.set(body.requestId, {intent: JSON.stringify(body), receipt});
      return ok(receipt);
    }
    if (pathname.startsWith('/api/studio/guides/') && method === 'GET') {
      const h = handoffs.get(pathname.split('/')[4]);
      return h ? ok({artifactId: h.artifactId, artifactRevision: h.artifactRevision, selectedBlockIds: h.selectedBlockIds, threadId: h.threadId}) : fail('NOT_FOUND', 404);
    }
    if (pathname.startsWith('/api/creator/guides/')) {
      const id = pathname.split('/')[4], guide = guides.get(id);
      if (method === 'GET') return guide ? draftReadable(guide)?ok(projectDraft(guide)):fail('RESTRICTED',403) : fail('NOT_FOUND', 404);
      if (!body?.requestId) return fail('INVALID', 400);
      const key = method + pathname + body.requestId;
      const old = domainReceipts.get(key);
      if (old) {const binding=handoffs.get(id),brief=findBrief(binding?.artifactId);if(guide?.studio&&!allowedBlocks(brief,binding?.selectedBlockIds??[],pathname.endsWith('/publish')?'public':'private'))return fail('RESTRICTED',403);return old.intent === JSON.stringify(body) ? ok(old.data) : fail('CONFLICT');}
      const h = handoffs.get(id);
      if (!h || h.domainRequestId !== body.requestId) return fail('FORBIDDEN', 403);
      const brief=findBrief(h.artifactId);if(!allowedBlocks(brief,h.selectedBlockIds))return fail('RESTRICTED',403);if(brief.revision!==h.artifactRevision)return fail('CONFLICT');
      if ((guide?.revision ?? 0) !== body.expectedRevision) return fail('CONFLICT');
      let result;
      if (pathname.endsWith('/publish') && method === 'POST' && h.operation === 'publish' && guide) {
        if(publicationReadiness(guide.payload).issues.length)return fail('INVALID',400);
        const snapshot = {id, version: guide.publishedVersion+1, title: guide.payload.title, city: guide.payload.city, summary: guide.payload.summary, days: clone(guide.payload.content.days)};
        const licensed=currentSources(brief).some(s=>s.rights==='licensed'&&brief.blocks.some(b=>h.selectedBlockIds.includes(b.id)&&b.sources.some(r=>r.sourceId===s.id)));
        if(licensed){Object.assign(snapshot,{kind:'itinerary',destinationId:null,publishedAt:new Date().toISOString(),creator:{id:ACTOR,name:'Kinnso 示例作者',handle:'example'}});snapshot.days=snapshot.days.map(d=>({...d,id:randomUUID(),stops:d.stops.map((s,position)=>({...s,id:randomUUID(),position,source:null}))}));}
        let bindings;try{bindings=derivatives.prepareGuide(snapshot,brief,h.selectedBlockIds,currentSources(brief));}catch{return fail('RESTRICTED',403);}
        derivatives.install(bindings);guide.revision++;guide.publishedVersion++;guide.status='published';
        published.set(id, snapshot);
        if(licensed)traveller.registerGuide(snapshot);
        versions.set(id,[...(versions.get(id)??[]),clone(snapshot)]);
        result = {draft: guide, snapshot};
      } else if (method === 'PUT' && h.operation === 'save') {
        if (JSON.stringify(body.payload) !== JSON.stringify(h.payload)) return fail('INVALID', 400);
        result = {id, revision: body.expectedRevision + 1, publishedVersion: guide?.publishedVersion ?? 0, sourceChanged: false, status: 'draft', payload: clone(body.payload), title:body.payload.title,city:body.payload.city,summary:body.payload.summary,studio: {artifactId: h.artifactId, artifactRevision: h.artifactRevision, threadId: h.threadId, sourceCount: h.selectedBlockIds.length, restricted: false}};
        guides.set(id, result);
      } else return fail('UNAVAILABLE', 503);
      domainReceipts.set(key, {intent: JSON.stringify(body), data: clone(result)});
      return ok(result);
    }
    if (pathname.startsWith('/api/guides/') && method === 'GET') {
      const snapshot = published.get(pathname.split('/').at(-1));
      const value=snapshot&&derivatives.projectGuide(snapshot);return value ? ok({...value, publication: {adoptable: true}}) : snapshot?fail('RESTRICTED',403):fail('NOT_FOUND', 404);
    }
    // All other workflows, providers and real connections are unavailable here.
    return fail('UNAVAILABLE', 503);
  };
  handle.before=async(method,pathname)=>{if(!['POST','PUT'].includes(method))return;const relevant=pathname.startsWith('/api/studio/')||pathname.startsWith('/api/creator/guides/')||pathname==='/api/shares'||pathname.startsWith('/api/trips/')&&pathname.endsWith('/adopt');if(!relevant)return;const ids=new Set([...threads.values()].flatMap(t=>t.sources.filter(s=>s.rights==='licensed').map(s=>s.license.provenance.publicationId)));for(const id of ids)await discovery.ensureFresh(id);};
  handle.discovery=discovery;handle.dispose=traveller.dispose;return handle;
}
