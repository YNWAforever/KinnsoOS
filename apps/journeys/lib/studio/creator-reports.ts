import {publicationReadiness} from '../creators/editor-operations';
import type {DraftPayload, GuideDraft} from '../creators/contracts';
import type {CreatorMissionDetail, EarningsPage} from '../creators/collaboration';
import {sameValue} from './contracts';
import type {StudioResponse} from './contracts';
import {templateById} from './templates';

export type CreatorTaskId = 'C2' | 'C3' | 'C4' | 'C5';
export type CreatorReportSource = {kind:'guide';value:GuideDraft}|{kind:'mission';value:CreatorMissionDetail}|{kind:'earnings';value:EarningsPage};
export type CreatorReport = {
 id:string;ownerId:string;revision:number;templateId:CreatorTaskId;title:string;question:string;asOf:string;
 visibility:'private';approval:false;changesAdoptedCopies:false;source:CreatorReportSource;
 discussion:{role:'user'|'assistant';body:string}[];evidence:{title:string;text:string;reference:string;version:string}[];
 findings:{code:string;label:string;state:'complete'|'needs-work'|'unverified'}[];gaps:string[];notes:string;
 period:{from:string;to:string}|null;proposal:DraftPayload|null;
 delivery:{submissionId:string|null;milestoneId:string;expectedUpdatedAt:string|null;proofUrls:string[];notes:string}|null;
 performance:null|{records:EarningsPage['items'];sourceTotals:EarningsPage['totals'];denominator:null;externalSignals:null;payoutConfirmed:false;coverage:'partial-page'|'returned-items';undatedCount:number};
};
export type CreatorReportIntent = {requestId:string;expectedRevision:number;report:CreatorReport};
export type CreatorReportStore = {
 label:string;
 list:()=>Promise<StudioResponse<{items:CreatorReport[]}>>;
 get:(id:string)=>Promise<StudioResponse<CreatorReport>>;
 stage:(intent:CreatorReportIntent)=>Promise<StudioResponse<CreatorReportIntent>>;
 intent:(requestId:string)=>Promise<StudioResponse<CreatorReportIntent>>;
 save:(intent:CreatorReportIntent)=>Promise<StudioResponse<CreatorReport>>;
 receipt:(requestId:string)=>Promise<StudioResponse<{status:'complete';report:CreatorReport}|{status:'unknown'}>>;
};
const issueLabels:Record<string,string> = {title:'填寫攻略名稱',city:'填寫目的地',summary:'補上原創摘要',days:'加入行程日期',stops:'加入站點',stopTitle:'補上站點名稱'};
function validPeriod(period:{from:string;to:string}) {
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!valid(period.from)||!valid(period.to)||period.from>period.to)throw Error('INVALID_PERIOD');
}
export function createCreatorReport(input:{id:string;ownerId:string;templateId:CreatorTaskId;question:string;asOf:string;source:CreatorReportSource;period?:{from:string;to:string}|null}):CreatorReport {
 const {source,templateId}=input;
 const report:CreatorReport={id:input.id,ownerId:input.ownerId,templateId,title:templateById(templateId).title,question:input.question,asOf:input.asOf,revision:0,visibility:'private',approval:false,changesAdoptedCopies:false,source:structuredClone(source),discussion:[{role:'user',body:input.question},{role:'assistant',body:'依據明選的已保存紀錄整理；未連接 AI 或外部平台。先展開證據，再另開私人報告，任何交付或發佈仍要另行確認。'}],evidence:[],findings:[],gaps:[],notes:'',period:input.period??null,proposal:null,delivery:null,performance:null};
 if(templateId==='C2'||templateId==='C5') {
  if(source.kind!=='guide')throw Error('INVALID_SOURCE');
  const d=source.value,ready=publicationReadiness(d.payload);
  report.evidence=[{title:'已保存攻略草稿',text:[d.payload.title,d.payload.city,d.payload.summary,...d.payload.content.days.flatMap(day=>['第 '+(day.offset+1)+' 天 · '+day.title,...day.stops.map(stop=>stop.title+'：'+stop.description)])].join('\n'),reference:'/api/creator/guides/'+d.id,version:`草稿 r${d.revision} · 已發佈 v${d.publishedVersion}`}];
  report.findings=ready.issues.map(i=>({code:i.code,label:issueLabels[i.code]+(i.day!==undefined?`（第 ${i.day+1} 天${i.stop!==undefined?`、第 ${i.stop+1} 站`:''}）`:''),state:'needs-work'}));
  if(!ready.issues.length)report.findings.push({code:'content',label:'必填內容齊備',state:'complete'});
  report.findings.push({code:'rights',label:'來源權利需逐項人工確認；這份檢查不是發佈批准',state:'unverified'});
  if(d.sourceChanged||d.studio?.restricted)report.findings.push({code:'source',label:'來源已變更或受限，請重新核對',state:'needs-work'});
  report.gaps=['第三方內容權利尚未驗證。','保存報告不會發佈攻略，也不授予額外權限。'];
  if(templateId==='C5') {report.proposal=structuredClone(d.payload);report.gaps.push('新版須在既有編輯器另行確認發佈；旅人已採用的版本不變。');}
 } else if(templateId==='C3') {
  if(source.kind!=='earnings')throw Error('INVALID_SOURCE');
  const page=source.value;
  if(report.period)validPeriod(report.period);
  const from=report.period?Date.parse(report.period.from+'T00:00:00+08:00'):-Infinity,to=report.period?Date.parse(report.period.to+'T23:59:59.999+08:00'):Infinity;
  const records=page.items.filter(i=>i.updatedAt&&Date.parse(i.updatedAt)>=from&&Date.parse(i.updatedAt)<=to);
  report.performance={records:structuredClone(records),sourceTotals:structuredClone(page.totals),denominator:null,externalSignals:null,payoutConfirmed:false,coverage:page.nextCursor?'partial-page':'returned-items',undatedCount:page.items.filter(i=>!i.updatedAt).length};
  report.evidence=[{title:'KinnsoOS 原收益紀錄（按幣別）',text:page.items.map(item=>[item.title,item.currency??'幣別未驗證',item.amount??'金額未驗證',item.status,item.updatedAt??'紀錄時間未驗證'].join(' · ')).join('\n'),reference:'/api/creator/earnings?section='+page.section,version:input.asOf}];
  report.findings=[{code:'scope',label:`閱讀 ${records.length} 筆有來源時間的紀錄；${page.section==='tracked'?'追蹤活動不等於付款':'原紀錄不代表本次執行付款'}`,state:'complete'},{code:'platform',label:'Instagram／TikTok／YouTube／Search Console：未連接',state:'unverified'},{code:'denominator',label:'曝光、點擊及轉換分母：未驗證',state:'unverified'}];
  report.gaps=['所選期間按來源紀錄時間（香港時區）篩選，不是平台分析期間。','來源總計未按選定期間重算，不可將不同貨幣相加。','不把追蹤活動或付款批次再次計入收益，不啟用 payment。'];
  if(page.nextCursor)report.gaps.push('尚有後頁，這份報告只涵蓋已回傳項目。');
  if(report.performance.undatedCount)report.gaps.push('有紀錄缺少時間，未納入期間篩選。');
 } else {
  if(source.kind!=='mission')throw Error('INVALID_SOURCE');
  const m=source.value;if(m.participant?.status!=='active')throw Error('FORBIDDEN');
  report.evidence=[{title:'合作要求與交付內容',text:[...m.requirements,...m.deliverables].join('\n'),reference:'/api/creator/missions/'+m.id,version:m.participant.updatedAt??input.asOf},...m.submissions.map(s=>({title:'原提交及審核回饋',text:[s.notes,s.merchantFeedback,...s.proofUrls].filter(Boolean).join('\n'),reference:'submission:'+s.id,version:s.updatedAt}))];
  report.findings=m.submissions.filter(s=>s.status==='revision_requested').map(s=>({code:s.id,label:s.merchantFeedback||'審核員要求修改，請查看原合作。',state:'needs-work'}));
  if(!report.findings.length)report.findings.push({code:'feedback',label:'目前沒有需要修訂的回饋；仍可核對原交付。',state:'complete'});
  const current=m.submissions.find(s=>s.status==='revision_requested')??m.submissions.find(s=>['pending','submitted'].includes(s.status));
  const milestoneId=current?.milestoneId??m.milestones[0]?.id;
  if(milestoneId)report.delivery={submissionId:current?.id??null,milestoneId,expectedUpdatedAt:current?.updatedAt??null,proofUrls:[...(current?.proofUrls??[])],notes:current?.notes??''};
  report.gaps=['連結內容及權利未經外部驗證。','重新提交只代表等待審核，不代表商戶已核准或已發信。'];
  if(m.milestonesTruncated||m.submissionsNextCursor)report.gaps.push('尚有後頁；完成交付前請在原合作查看完整紀錄。');
 }
 return report;
}
export function creatorVersionDiff(report:CreatorReport) {
 if(report.templateId!=='C5'||report.source.kind!=='guide'||!report.proposal)return[];
 const before=report.source.value.payload,after=report.proposal;
 return (['title','city','summary','content'] as const).filter(field=>!sameValue(before[field],after[field])).map(field=>({field,label:({title:'名稱',city:'目的地',summary:'摘要',content:'行程與站點'})[field],before:typeof before[field]==='string'?before[field] as string:JSON.stringify(before[field],null,2),after:typeof after[field]==='string'?after[field] as string:JSON.stringify(after[field],null,2)}));
}
export async function saveVerifiedCreatorReport(store:Pick<CreatorReportStore,'stage'|'intent'|'save'|'get'>,intent:CreatorReportIntent):Promise<StudioResponse<CreatorReport>> {
 try {
  // Preserve the immutable body in the authorized store before dispatching the write.
  // Browser recovery keeps only its opaque UUID, never the report's private text.
  const stage=await store.stage(structuredClone(intent));if(!stage.ok)return stage;
  const staged=await store.intent(intent.requestId);if(!staged.ok)return staged;
  if(!sameValue(stage.data,intent)||!sameValue(staged.data,intent))return{ok:false,code:'UNAVAILABLE',retryable:true};
  const ack=await store.save(structuredClone(intent));if(!ack.ok)return ack;
  const read=await store.get(intent.report.id);if(!read.ok)return read;
  if(ack.data.revision!==intent.expectedRevision+1||!sameValue(ack.data,read.data)||!sameValue({...intent.report,revision:ack.data.revision},read.data))return{ok:false,code:'UNAVAILABLE',retryable:true};
  return read;
 } catch {return{ok:false,code:'UNAVAILABLE',retryable:true};}
}
