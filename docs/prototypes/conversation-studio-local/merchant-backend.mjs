// Loopback fixture only. The production repository/RPC remains the domain authority.
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {profileInput} from '../../../apps/journeys/lib/merchants/onboarding-validation.ts';
import {campaignCommand} from '../../../apps/journeys/lib/merchants/campaigns.ts';
import {insightsQuery,insightsCsv} from '../../../apps/journeys/lib/merchants/insights.ts';
import {merchantTaskAllowed,merchantDocumentReadable,merchantPublicationChecks,merchantCampaignInput} from '../../../apps/journeys/lib/studio/merchant-tasks.ts';

export const MERCHANT_IDS={owner:'a1000000-0000-4000-8000-000000000001',second:'a1000000-0000-4000-8000-000000000002',marketing:'a1000000-0000-4000-8000-000000000003',clerk:'a1000000-0000-4000-8000-000000000004',finance:'a1000000-0000-4000-8000-000000000005'};
const uuid=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export function merchantExamples(actor){
 const clone=structuredClone,ok=data=>({status:200,body:{ok:true,data:clone(data)}}),fail=(code,status=409)=>({status,body:{ok:false,code,retryable:code==='UNAVAILABLE'}});
 let tick=0,asOf=new Date().toISOString();const stamp=()=>asOf=new Date(Date.now()+(++tick)).toISOString();
 const members=new Map(Object.entries(MERCHANT_IDS).map(([role,merchantId],i)=>[merchantId,{merchantId,name:['海旁小店（示例）','山城生活（示例）','品牌工作室（示例）','街角店（示例）','城市商店（示例）'][i],role:role==='second'?'owner':role,branchIds:[]} ]));
 const profiles=new Map(),campaigns=new Map(),cases=new Map(),documents=new Map(),briefs=new Map(),intents=new Map(),receipts=new Map();
 for(const [companyId,member] of members){
  profiles.set(companyId,{id:companyId,slug:'example-'+companyId.slice(-1),status:'active',tier:'example',updatedAt:asOf,companyName:member.name,contactName:'示例聯絡人',contactEmail:'owner@example.invalid',websiteUrl:'https://example.invalid',tagline:'一起慢慢探索社區。',city:'香港',logoUrl:''});
  for(let i=0;i<3;i++){
   const id=companyId.replace('a100','b'+(i+1)+'00'),ready=i!==1,status=i===2?'published':'draft';
   campaigns.set(id,{companyId,detail:{id,title:member.name+['｜週末散步活動','｜待補資料活動','｜已發佈活動'][i],summary:ready?'自有示例活動：介紹海旁散步路線及社區小店。':'' ,status,missionType:'collaboration',createdAt:'2026-10-15T00:00:00Z',updatedAt:asOf,couponCode:ready?'SAMPLE':'',couponUrl:ready?'https://example.invalid/sample':'',affiliateRate:ready?10:null,kinnsoRate:ready?2:null,creatorRate:ready?8:null,requirements:['只使用自有或已授權內容'],deliverables:['一份活動介紹草稿'],milestones:ready?[{id:randomUUID(),title:'內容交付',description:'提交自有活動介紹供原流程審核',dueAt:'2026-12-20T12:00:00Z'}]:[],applicationOpensAt:'2026-11-01T00:00:00Z',applicationClosesAt:'2026-11-15T00:00:00Z',scheduleTimeZone:'Asia/Hong_Kong',requiresApplication:true,participants:[],participantsNextCursor:null,submissions:[],submissionsNextCursor:null,canEdit:status==='draft',canClose:status==='published',canReviewSubmissions:member.role==='owner'}});
  }
  const missionId=companyId.replace('a100','b100'),id=companyId.replace('a100','c100');
  cases.set(id,{companyId,customerId:actor,value:{id,subject:member.name+'｜活動時間查詢',status:'open',ownerId:null,revision:1,linkedEventId:null,context:{type:'mission',id:missionId},updatedAt:asOf,messages:[{id:randomUUID(),message:'這個示例活動何時開始？可否先看參加內容？',createdAt:asOf,mine:false}],messagesNextCursor:null}});
  for(let i=0;i<3;i++){
   const id=companyId.replace('a100','d'+(i+1)+'00'),text=['品牌資料：用輕鬆語氣介紹海旁散步，請使用自有示例文字。','PRIVATE_MERCHANT_NOTE：我的示例想法是加入雨天備案。','OTHER_MEMBER_PRIVATE：其他成員的私人文件。'][i];
   documents.set(id,{id,companyId,ownerId:i===2?'99999999-9999-4999-8999-999999999999':actor,title:['自有品牌與活動資料（示例）','我的私人活動筆記（示例）','其他成員私人文件'][i],text,visibility:i===0?'company':'private',state:'active',version:1,aclVersion:1,hash:createHash('sha256').update(text).digest('hex'),rights:'own'});
  }
 }
 const role=id=>members.get(id)?.role;
 const projectCampaign=c=>c?{...clone(c.detail),canReviewSubmissions:role(c.companyId)==='owner'}:undefined;
 const caseReadable=c=>!!c&&c.customerId===actor&&members.has(c.companyId);
 const campaignReadable=c=>!!c&&merchantTaskAllowed('M4',role(c.companyId));
 const docReadable=d=>!!d&&members.has(d.companyId)&&merchantDocumentReadable(d,actor,d.companyId);
 const snapshot={participants:2,invited:1,active:1,applied:1,submitted:1,approved:0,revisionRequested:0};
 function insights(companyId,query={}){
  const range={from:query.from??'2026-10-01',to:query.to??'2026-11-01'};
  const rows=[...campaigns.values()].filter(c=>c.companyId===companyId&&(!query.campaignId||query.campaignId===c.detail.id)&&c.detail.createdAt>=range.from&&c.detail.createdAt<range.to).map(({detail:c})=>({id:c.id,title:c.title,status:c.status,snapshot:clone(snapshot),invitationCohort:{issued:0,accepted:null},periodEvents:{applications:1,submissions:null,approvalActions:0,redemptions:null,attribution:null}}));
  const n=rows.length;return {asOf,range,counts:{snapshot:Object.fromEntries([['campaigns',n],...Object.entries(snapshot).map(([k,v])=>[k,v*n])]),invitationCohort:{issued:0,accepted:null},periodEvents:{applications:n,submissions:null,approvalActions:0,redemptions:null,attribution:null}},perCampaign:rows,nextCursor:null,coverage:{acceptance:'unknown_missing_timestamp',submissions:'unknown',redemptions:'unknown',campaignSelection:'created_in_utc_range'}};
 }
 function sourceReadable(b){
  const s=b?.source,id=b?.companyId;if(b?.ownerId!==actor||!merchantTaskAllowed(b.templateId,role(id)))return false;
  if(s?.kind==='profile')return b.templateId==='M1'&&s.value.id===id;
  if(s?.kind==='case'){const c=cases.get(s.value.id);return b.templateId==='M2'&&c?.companyId===id&&caseReadable(c);}
  if(s?.kind==='campaign'){const c=campaigns.get(s.value.id);return b.templateId==='M4'&&c?.companyId===id&&campaignReadable(c);}
  if(s?.kind==='materials')return b.templateId==='M3'&&s.value.companyId===id&&s.value.documents.length>0&&s.value.documents.every(d=>{const current=documents.get(d.id);return current?.companyId===id&&docReadable(current)&&current.aclVersion===d.aclVersion&&current.hash===d.hash;});
  return s?.kind==='insights'&&b.templateId==='M5';
 }
 function sourceCurrent(b){const s=b.source;return equal(s.value,s.kind==='profile'?profiles.get(b.companyId):s.kind==='case'?cases.get(s.value.id)?.value:s.kind==='campaign'?projectCampaign(campaigns.get(s.value.id)):s.kind==='materials'?{companyId:b.companyId,documents:s.value.documents.map(d=>documents.get(d.id))}:insights(b.companyId,s.query));}
 function validBrief(b){
  if(!uuid.test(b.id)||b.visibility!=='private'||!b.title?.trim()||typeof b.notes!=='string'||typeof b.question!=='string'||!Array.isArray(b.privateSourceConsent)||!Array.isArray(b.evidence)||!Array.isArray(b.materials)||!Array.isArray(b.findings))return false;
  const op=b.operation;if(op&&!uuid.test(op.requestId))return false;
  if(b.templateId==='M1')return op?.kind==='profile'&&op.expectedUpdatedAt===b.source.value.updatedAt&&!!profileInput(op.input);
  if(b.templateId==='M2')return op?.kind==='reply'&&op.command.type==='reply'&&op.command.id===b.source.value.id&&op.command.expectedRevision===b.source.value.revision&&typeof op.command.message==='string'&&op.command.message.trim().length>0&&op.command.message.length<=5000;
  if(b.templateId==='M3'){
   if(op===null)return true;
   if(op?.kind!=='campaign'||op.command.type!=='createDraft'||op.command.publish!==false)return false;
   const privateIds=b.source.value.documents.filter(d=>d.visibility==='private').map(d=>d.id);
   if(privateIds.some(id=>!b.privateSourceConsent.includes(id))||b.privateSourceConsent.some(id=>!privateIds.includes(id)))return false;
   campaignCommand(op.command);return !campaigns.has(op.command.id);
  }
  if(b.templateId==='M4')return op===null||(op.kind==='campaign'&&op.command.type==='publish'&&op.command.id===b.source.value.id&&op.command.expectedUpdatedAt===b.source.value.updatedAt&&merchantPublicationChecks(b.source.value).length===0&&!!campaignCommand(op.command));
  return b.templateId==='M5'&&op===null;
 }
 function replay(key,body){const old=receipts.get(key);return old?(equal(old.body,body)?ok(old.result):fail('CONFLICT')):null;}
 function receipt(key,body,result){receipts.set(key,{body:clone(body),result:clone(result)});return ok(result);}
 // Studio metadata binds only its own UUIDs. Recheck at the domain write boundary,
 // including receipt replay, so a revoked source cannot race the UI preflight.
 function studioGate(body,companyId,kind){
  const intent=[...intents.values()].find(b=>b.operation?.requestId===body?.requestId);if(!intent)return null;
  const b=briefs.get(intent.id);if(!b||!sourceReadable(b)||b.companyId!==companyId||b.operation.kind!==kind)return fail('RESTRICTED',403);
  const op=b.operation,expected=kind==='profile'?{merchantId:companyId,requestId:op.requestId,input:op.input,expectedUpdatedAt:op.expectedUpdatedAt}:kind==='reply'?{requestId:op.requestId,command:op.command}:{merchantId:companyId,requestId:op.requestId,command:op.command};
  return equal(expected,body)?null:fail('CONFLICT');
 }
 function handle(method,path,body,q=new URLSearchParams()){
  // Test-only fixture controls are never exported by the production application.
  if(path==='/__preview/merchant/membership'&&method==='POST'){
   if(!Object.values(MERCHANT_IDS).includes(body?.companyId)||!(body.role===null||['owner','marketing','clerk','finance'].includes(body.role)))return fail('INVALID',400);
   if(body.role===null)members.delete(body.companyId);else members.set(body.companyId,{merchantId:body.companyId,name:'已變更角色的示例公司',role:body.role,branchIds:[]});return ok({changed:true});
  }
  if(path==='/__preview/merchant/restrict-document'&&method==='POST'){const d=documents.get(body?.id);if(!d)return fail('NOT_FOUND',404);d.state='restricted';d.aclVersion++;return ok({restricted:true});}
  if(path==='/__preview/merchant/catalogue'&&method==='GET'){
   const id=q.get('company');if(!merchantTaskAllowed(q.get('task'),role(id)))return fail('FORBIDDEN',403);
   return ok({cases:[...cases.values()].filter(c=>c.companyId===id&&caseReadable(c)).map(c=>({id:c.value.id,subject:c.value.subject})),documents:[...documents.values()].filter(d=>d.companyId===id&&docReadable(d))});
  }
  if(path.startsWith('/__preview/merchant/documents/')&&method==='GET'){const d=documents.get(path.split('/').at(-1));return d&&docReadable(d)?ok(d):fail('RESTRICTED',403);}
  if(path==='/__preview/merchant/briefs'&&method==='GET'){const id=q.get('company');return members.has(id)?ok({items:[...briefs.values()].filter(b=>b.companyId===id&&sourceReadable(b))}):fail('FORBIDDEN',403);}
  if(/^\/__preview\/merchant\/(briefs|intents)\/[^/]+$/.test(path)&&method==='GET'){
   const b=(path.includes('/intents/')?intents:briefs).get(path.split('/').at(-1));if(!members.has(q.get('company')))return fail('FORBIDDEN',403);
   return !b?fail('NOT_FOUND',404):b.companyId===q.get('company')&&sourceReadable(b)?ok(b):fail('RESTRICTED',403);
  }
  if(['/__preview/merchant/briefs','/__preview/merchant/intents'].includes(path)&&method==='POST'){
   if(!sourceReadable(body))return fail('RESTRICTED',403);
   const target=path.endsWith('intents')?intents:briefs,old=target.get(body.id);
   if(old)return equal(old,body)?ok(old):fail('CONFLICT');
   try{if(!validBrief(body))return fail('INVALID',400);}catch{return fail('INVALID',400);}
   if(!sourceCurrent(body))return fail('CONFLICT');
   if(target===briefs&&!equal(intents.get(body.id),body))return fail('INVALID',400);
   target.set(body.id,clone(body));return ok(body);
  }
  if(path==='/api/merchant'&&method==='GET'){
   const id=q.get('id');if(!id)return ok([...members.values()]);
   if(!members.has(id))return fail('FORBIDDEN',403);
   return ok({merchantId:id,role:role(id),branches:[],missions:[...campaigns.values()].filter(c=>c.companyId===id).map(c=>c.detail),nextCursor:null,applicationsNextCursor:null,outcomesNextCursor:null,applications:[],outcomes:[],moneyCapability:'historical_records_only'});
  }
  if(path==='/api/merchant/profile'){
   const id=method==='GET'?q.get('id'):body?.merchantId;
   if(role(id)!=='owner')return fail('FORBIDDEN',403);
   const current=profiles.get(id);if(!current)return fail('NOT_FOUND',404);
   if(method==='GET')return ok(current);
   if(method!=='PUT'||!uuid.test(body?.requestId))return fail('INVALID',400);
   const guard=studioGate(body,id,'profile');if(guard)return guard;
   const key='profile:'+id+':'+body.requestId,prior=replay(key,body);if(prior)return prior;
   let input;try{input=profileInput(body.input);}catch{return fail('INVALID',400);}
   if(current.updatedAt!==body.expectedUpdatedAt)return fail('CONFLICT');
   Object.assign(current,input,{updatedAt:stamp()});return receipt(key,body,current);
  }
  if(path==='/api/merchant/campaigns'){
   const id=method==='GET'?q.get('id'):body?.merchantId;
   if(!merchantTaskAllowed('M4',role(id)))return fail('FORBIDDEN',403);
   if(method==='GET'){
    const all=[...campaigns.values()].filter(c=>c.companyId===id).map(c=>c.detail),selected=campaigns.get(q.get('campaignId'));
    if(q.get('campaignId')&&(!selected||selected.companyId!==id))return fail('NOT_FOUND',404);
    let items=all.filter(c=>(!q.get('status')||q.get('status')==='all'||c.status===q.get('status'))&&(!q.get('q')||c.title.includes(q.get('q'))));
    return ok({merchantId:id,role:role(id),items:items.map(c=>({id:c.id,title:c.title,summary:c.summary,status:c.status,missionType:c.missionType,updatedAt:c.updatedAt,createdAt:c.createdAt})),nextCursor:null,detail:projectCampaign(selected)??null,summary:{draft:all.filter(c=>c.status==='draft').length,published:all.filter(c=>c.status==='published').length,closed:all.filter(c=>c.status==='paused').length,applications:0,activeCreators:0,submitted:0,approved:0},branches:[],branchesNextCursor:null});
   }
   if(method!=='POST'||!uuid.test(body?.requestId))return fail('INVALID',400);
   const guard=studioGate(body,id,'campaign');if(guard)return guard;
   let command;try{command=campaignCommand(body.command);}catch{return fail('INVALID',400);}
   const existing=campaigns.get(command.id);if(existing&&existing.companyId!==id)return fail('FORBIDDEN',403);
   const key='campaign:'+id+':'+body.requestId,prior=replay(key,body);if(prior)return prior;
   if(!['createDraft','updateDraft','publish','close'].includes(command.type))return fail('UNAVAILABLE',503);
   if(command.type==='createDraft'){
    if(existing)return fail('CONFLICT');
    const now=stamp(),status=command.publish?'published':'draft';
    campaigns.set(command.id,{companyId:id,detail:{id:command.id,...clone(command.input),status,missionType:'collaboration',createdAt:now,updatedAt:now,requiresApplication:true,participants:[],participantsNextCursor:null,submissions:[],submissionsNextCursor:null,canEdit:!command.publish,canClose:command.publish,canReviewSubmissions:role(id)==='owner'}});
   }else{
    if(!existing)return fail('NOT_FOUND',404);const c=existing.detail;
    if(command.expectedUpdatedAt!==c.updatedAt)return fail('CONFLICT');
    if(command.type==='close'){if(c.status!=='published')return fail('CONFLICT');c.status='paused';c.canClose=false;}
    else{
     if(c.status!=='draft')return fail('CONFLICT');
     if(command.type==='updateDraft')Object.assign(c,clone(command.input));
     else{if(merchantPublicationChecks(c).length)return fail('INVALID',400);c.status='published';c.canEdit=false;c.canClose=true;}
    }
    c.updatedAt=stamp();
   }
   const c=campaigns.get(command.id).detail;return receipt(key,body,{id:c.id,status:c.status,updatedAt:c.updatedAt});
  }
  if(path==='/api/support/context'&&method==='GET'){
   const c=campaigns.get(q.get('mission'));if(!c)return null;
   return members.has(c.companyId)?ok({type:'mission',id:c.detail.id,title:c.detail.title,workspace:'merchant'}):fail('FORBIDDEN',403);
  }
  if(path==='/api/support'&&method==='GET')return q.get('ops')==='true'?fail('FORBIDDEN',403):ok({items:[...cases.values()].filter(caseReadable).map(c=>c.value),nextCursor:null});
  if((path==='/api/support'||path==='/api/support/receipt')&&method==='POST'){
   const c=cases.get(body?.command?.id),command=body?.command;if(!caseReadable(c))return fail('FORBIDDEN',403);
   const guard=studioGate(body,c.companyId,'reply');if(guard)return guard;
   if(command.type!=='reply'||!uuid.test(body.requestId)||typeof command.message!=='string'||!command.message.trim()||command.message.length>5000)return fail('INVALID',400);
   const key='case:'+c.value.id+':'+body.requestId,old=receipts.get(key);
   if(path.endsWith('receipt'))return old&&!equal(old.body,body)?fail('CONFLICT'):ok({result:old?.result??null});
   const prior=replay(key,body);if(prior)return prior;
   if(command.expectedRevision!==c.value.revision)return fail('CONFLICT');
   c.value.messages.push({id:randomUUID(),message:command.message,createdAt:stamp(),mine:true});c.value.revision++;c.value.updatedAt=asOf;
   return receipt(key,body,{id:c.value.id,revision:c.value.revision,status:c.value.status});
  }
  if(path==='/api/merchant/insights'&&method==='GET'){
   const id=q.get('id');if(role(id)!=='owner')return fail('FORBIDDEN',403);
   let query;try{const params=new URLSearchParams(q);params.delete('id');params.delete('format');query=insightsQuery(params);}catch{return fail('INVALID',400);}
   if(query.campaignId&&campaigns.get(query.campaignId)?.companyId!==id)return fail('FORBIDDEN',403);
   const report=insights(id,query);return ok(q.get('format')==='csv'?{csv:insightsCsv(report)}:report);
  }
  return null;
 }
 return {handle};
}
