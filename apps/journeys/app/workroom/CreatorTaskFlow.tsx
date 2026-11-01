'use client';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {useApp} from '../travel/ui';
import {creators} from '../../lib/creators/contracts';
import {creatorEarnings,creatorMissions,type CreatorMissionCommand,type EarningsSection} from '../../lib/creators/collaboration';
import {formatTimeOfDay} from '../../lib/creators/editor-operations';
import {creatorMissionCommand} from '../../lib/creators/collaboration-validation';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {sameValue,type StudioResponse} from '../../lib/studio/contracts';
import {createCreatorReport,creatorVersionDiff,saveVerifiedCreatorReport,type CreatorReport,type CreatorReportSource,type CreatorReportStore,type CreatorReportIntent,type CreatorTaskId} from '../../lib/studio/creator-reports';
import {runStudioGuideAction,type StudioGuideIntent} from '../../lib/studio/guide-editor';
import {templateById} from '../../lib/studio/templates';
import './creator-tasks.css';

type Action={kind:'guide';intent:StudioGuideIntent}|{kind:'mission';requestId:string;command:CreatorMissionCommand};
const reportKey=(actor:string,id:string)=>`kinnso.studio.report.pending.${actor}.${id}`;
const actionKey=(actor:string,id:string)=>`kinnso.studio.report.action.${actor}.${id}`;
const getRef=(key:string)=>{try{return sessionStorage.getItem(key);}catch{return null;}};
const putRef=(key:string,value:string|null)=>{try{if(value===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,value);}catch{}};
async function readSource(source:CreatorReportSource):Promise<StudioResponse<CreatorReportSource>> {
 if(source.kind==='guide'){const r=await creators.get(source.value.id);return r.ok?{ok:true,data:{kind:'guide',value:r.data}}:r;}
 if(source.kind==='mission'){const r=await creatorMissions.get(source.value.id);return r.ok?{ok:true,data:{kind:'mission',value:r.data}}:r;}
 const r=await creatorEarnings.get(source.value.section);return r.ok?{ok:true,data:{kind:'earnings',value:r.data}}:r;
}
function restoreAction(report:CreatorReport,raw:string|null):Action|null {
 if(!raw)return null;
 try{const ref=JSON.parse(raw);if(ref.revision!==report.revision)return null;
  if(ref.kind==='guide'&&report.source.kind==='guide'&&report.proposal)return{kind:'guide',intent:{action:'save',requestId:ref.requestId,preparationId:ref.preparationId,revision:report.source.value.revision,payload:structuredClone(report.proposal)}};
  if(ref.kind==='mission'&&report.delivery)return{kind:'mission',requestId:ref.requestId,command:creatorMissionCommand({type:'submitEvidence',...structuredClone(report.delivery)})};
 }catch{}return null;
}
export function CreatorTaskFlow({templateId,actorId,store}:{templateId:CreatorTaskId;actorId:string;store:CreatorReportStore}) {
 const {href}=useApp(),router=useRouter(),query=useSearchParams(),task=templateById(templateId);
 const initialId=useRef(query.get('report')),epoch=useRef(0),busyRef=useRef(false),pending=useRef<CreatorReportIntent|null>(null),action=useRef<Action|null>(null),recoveryId=useRef<string|null>(null);
 const [choices,setChoices]=useState<{id:string;title:string}[]>([]),[selected,setSelected]=useState(''),[section,setSection]=useState<EarningsSection>('settled');
 const [question,setQuestion]=useState(task.title),[period,setPeriod]=useState({from:'2026-10-01',to:'2026-10-31'}),[prepared,setPrepared]=useState<CreatorReport|null>(null),[report,setReport]=useState<CreatorReport|null>(null),[saved,setSaved]=useState<CreatorReport|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[valid,setValid]=useState(true),[stale,setStale]=useState(false),[unknown,setUnknown]=useState(false),[unknownAction,setUnknownAction]=useState(false),[confirmation,setConfirmation]=useState(false),[confirmed,setConfirmed]=useState(false);
 const [message,setMessage]=useState('');
 function clearPrivate(){epoch.current++;setValid(false);setReport(null);setPrepared(null);setSaved(null);setQuestion('');setMessage('');setChoices([]);setSelected('');setError('帳戶或來源權限已改變，私人內容已清除。');setStatus('');setConfirmation(false);pending.current=null;action.current=null;}
 function showError(code:string){if(['FORBIDDEN','AUTH_REQUIRED','RESTRICTED'].includes(code)){clearPrivate();return;}setError(code==='CONFLICT'?'報告或來源已有較新版本，請用最新來源重新檢查。':code==='INVALID_PERIOD'?'請選擇有效且順序正確的日期。':code==='INVALID'?'請填寫 1–5 條不重複的 HTTPS 證明連結，並核對完整內容。':'結果未知，請保留同一請求核對，不要重複建立新操作。');}
 async function work(fn:(generation:number)=>Promise<void>){if(busyRef.current||!valid)return;busyRef.current=true;setBusy(true);setError('');const generation=epoch.current;try{await fn(generation);}catch(e){if(generation===epoch.current)showError(e instanceof Error?e.message:'UNAVAILABLE');}finally{busyRef.current=false;if(generation===epoch.current)setBusy(false);}}
 useEffect(()=>{
  const generation=++epoch.current;const off=subscribeAccountInvalidation(next=>{if(next!==actorId)clearPrivate();});
  void(async()=>{
   if(templateId!=='C3'){const r=templateId==='C4'?await creatorMissions.list('mine'):await creators.list();if(generation!==epoch.current)return;if(r.ok)setChoices(r.data.items.filter(item=>templateId!=='C5'||('publishedVersion'in item&&item.publishedVersion>0)).map(item=>({id:item.id,title:item.title})));else showError(r.code);}
   if(!initialId.current)return;
   recoveryId.current=getRef(reportKey(actorId,initialId.current));setUnknown(!!recoveryId.current);
   const [r,staged]=await Promise.all([store.get(initialId.current),recoveryId.current?store.intent(recoveryId.current):Promise.resolve(null)]);if(generation!==epoch.current)return;
   if(staged&&!staged.ok&&['FORBIDDEN','AUTH_REQUIRED','RESTRICTED'].includes(staged.code)){clearPrivate();return;}
   if(!r.ok&&['FORBIDDEN','AUTH_REQUIRED','RESTRICTED'].includes(r.code)){clearPrivate();return;}
   const value=r.ok?r.data:staged?.ok?staged.data.report:null;
   if(!value){showError('UNAVAILABLE');return;}
   if(value.ownerId!==actorId||value.templateId!==templateId||value.id!==initialId.current){clearPrivate();return;}
   if(staged?.ok){if(staged.data.report.id!==value.id||staged.data.report.ownerId!==actorId){clearPrivate();return;}pending.current=structuredClone(staged.data);}
   setReport(value);setPrepared(value);setSaved(r.ok?r.data:null);setQuestion(value.question);if(value.period)setPeriod(value.period);
   if(value.source.kind==='earnings')setSection(value.source.value.section);else setSelected(value.source.value.id);
   const storedAction=getRef(actionKey(actorId,value.id));action.current=restoreAction(value,storedAction);setUnknownAction(!!storedAction);
   const current=await readSource(value.source);if(generation!==epoch.current)return;if(!current.ok){showError(current.code);return;}setStale(!sameValue(current.data,value.source));setStatus(recoveryId.current?'先前操作尚待核對，已恢復原來的不可變意圖。':'已重新開啟私人報告。');
  })().catch(()=>{if(generation===epoch.current)showError('UNAVAILABLE');});
  return()=>{epoch.current++;off();};
 },[actorId,templateId,store]);
 const dirty=!!report&&!sameValue(report,saved),locked=busy||unknown||unknownAction||!valid;
 useEffect(()=>{if(!dirty&&!unknown&&!unknownAction)return;const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};const leave=(event:MouseEvent)=>{const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;if(anchor instanceof HTMLAnchorElement&&anchor.origin===location.origin&&!window.confirm('仍有未保存成果或結果未知的操作，確定離開？')){event.preventDefault();event.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);};},[dirty,unknown,unknownAction]);
 function change(next:CreatorReport){setReport(next);setPrepared(next);setConfirmation(false);setConfirmed(false);setStatus('修改尚未保存。');}
 async function prepare(refresh=false){await work(async generation=>{
  let response:StudioResponse<CreatorReportSource>;
  if(refresh&&report)response=await readSource(report.source);
  else if(templateId==='C3'){const r=await creatorEarnings.get(section);response=r.ok?{ok:true,data:{kind:'earnings',value:r.data}}:r;}
  else if(templateId==='C4'){const r=await creatorMissions.get(selected);response=r.ok?{ok:true,data:{kind:'mission',value:r.data}}:r;}
  else{const r=await creators.get(selected);response=r.ok?{ok:true,data:{kind:'guide',value:r.data}}:r;}
  if(generation!==epoch.current)return;if(!response.ok){showError(response.code);return;}
  if(response.data.kind==='mission'&&response.data.value.participant?.status!=='active'){setPrepared(null);setReport(null);setError('需要已接受且有效的合作參與者身分，才能回應修訂與交付。');return;}
  const next=createCreatorReport({id:refresh&&report?report.id:crypto.randomUUID(),ownerId:actorId,templateId,question,asOf:new Date().toISOString(),source:response.data,period:templateId==='C3'?period:null});
  if(refresh&&report){const current=await store.get(report.id);if(generation!==epoch.current)return;if(!current.ok){showError(current.code);return;}
   if(report.delivery&&next.delivery){if(report.delivery.submissionId!==next.delivery.submissionId||report.delivery.milestoneId!==next.delivery.milestoneId){setStale(true);setError('交付對象已改變；你的原修改仍保留，請先在原合作核對。');return;}next.delivery={...next.delivery,notes:report.delivery.notes,proofUrls:[...report.delivery.proofUrls]};}
   if(report.proposal&&next.proposal&&report.source.kind==='guide'){for(const field of ['title','city','summary','content'] as const)if(!sameValue(report.proposal[field],report.source.value.payload[field]))Object.assign(next.proposal,{[field]:structuredClone(report.proposal[field])});}
   next.revision=current.data.revision;next.notes=report.notes;next.discussion=[...report.discussion,{role:'assistant',body:'已重新讀取最新來源並保留你的修改；請對照新來源、核對後再保存。'}];setReport(next);setSaved(current.data);}
  else{setReport(null);setSaved(null);}setPrepared(next);setStale(false);setConfirmation(false);setStatus('已讀取來源；展開證據後，可以另開私人報告。');
 });}
 function openReport(){if(!prepared)return;setReport(prepared);window.history.replaceState(null,'',href('workroom')+'?template='+templateId+'&report='+prepared.id);setStatus('私人報告已另開，尚未保存。');}
 async function save(retry=false){await work(async generation=>{
  if(!report){setError('未能取得先前待核對內容，仍不能確認保存。請保留此請求，不會自動建立另一個操作。');return;}
  if(!pending.current&&!retry)pending.current={requestId:crypto.randomUUID(),expectedRevision:report.revision,report:structuredClone(report)};
  let result:StudioResponse<CreatorReport>;
  if(pending.current){recoveryId.current=pending.current.requestId;putRef(reportKey(actorId,report.id),recoveryId.current);result=await saveVerifiedCreatorReport(store,pending.current);}
  else if(recoveryId.current){const receipt=await store.receipt(recoveryId.current);if(generation!==epoch.current)return;if(!receipt.ok){showError(receipt.code);return;}if(receipt.data.status!=='complete'){showError('UNAVAILABLE');return;}const read=await store.get(report.id);result=read.ok&&sameValue(read.data,receipt.data.report)?read:{ok:false,code:'UNAVAILABLE',retryable:true};}
  else return;
  if(generation!==epoch.current)return;
  if(result.ok){setReport(result.data);setPrepared(result.data);setSaved(result.data);setUnknown(false);pending.current=null;putRef(reportKey(actorId,report.id),null);recoveryId.current=null;setStatus('私人報告已保存並讀回。');}
  else{setUnknown(result.retryable);if(!result.retryable){pending.current=null;putRef(reportKey(actorId,report.id),null);recoveryId.current=null;if(result.code==='CONFLICT')setStale(true);}showError(result.code);}
 });}
 function showConfirmation(){if(!report||dirty||stale)return;setConfirmation(true);setConfirmed(false);}
 async function deliver(retry=false){await work(async generation=>{
  if(!report||(!retry&&(!confirmed||dirty||stale)))return;
  if(!action.current&&!retry){
   const current=await readSource(report.source);if(generation!==epoch.current)return;if(!current.ok){showError(current.code);return;}if(!sameValue(current.data,report.source)){setStale(true);setConfirmation(false);showError('CONFLICT');return;}
   if(templateId==='C4'&&report.delivery){const command=creatorMissionCommand({type:'submitEvidence',...structuredClone(report.delivery)});action.current={kind:'mission',requestId:crypto.randomUUID(),command};}
   else if(templateId==='C5'&&report.source.kind==='guide'&&report.proposal){action.current={kind:'guide',intent:{action:'save',requestId:crypto.randomUUID(),preparationId:crypto.randomUUID(),revision:report.source.value.revision,payload:structuredClone(report.proposal)}};}else return;
   const a=action.current;putRef(actionKey(actorId,report.id),JSON.stringify(a.kind==='guide'?{kind:a.kind,requestId:a.intent.requestId,preparationId:a.intent.preparationId,revision:report.revision}:{kind:a.kind,requestId:a.requestId,revision:report.revision}));
  }
  const a=action.current;if(!a){showError('UNAVAILABLE');return;}setUnknownAction(true);
  if(a.kind==='guide'&&report.source.kind==='guide'){
   const result=await runStudioGuideAction(actorId,report.source.value.id,a.intent);if(generation!==epoch.current)return;
   if(!result.ok){if(!result.retryable){action.current=null;setUnknownAction(false);putRef(actionKey(actorId,report.id),null);if(result.code==='CONFLICT')setStale(true);}showError(result.code);return;}
   action.current=null;setUnknownAction(false);setConfirmation(false);putRef(actionKey(actorId,report.id),null);router.push(href('studio/guides/'+report.source.value.id+'/edit')+'?returnTask='+templateId+'&report='+report.id);return;
  }
  if(a.kind==='mission'&&report.source.kind==='mission'){
   const ack=await creatorMissions.command(report.source.value.id,a.command,a.requestId);if(generation!==epoch.current)return;
   if(!ack.ok){if(!ack.retryable){action.current=null;setUnknownAction(false);putRef(actionKey(actorId,report.id),null);if(ack.code==='CONFLICT')setStale(true);}showError(ack.code);return;}
   const read=await creatorMissions.get(report.source.value.id);if(generation!==epoch.current)return;if(!read.ok){showError(read.code);return;}
   const actual=read.data.submissions.find(s=>s.id===ack.data.id),command=a.command;
   if(command.type!=='submitEvidence'||!actual||actual.status!=='submitted'||actual.updatedAt!==ack.data.updatedAt||actual.notes!==command.notes||!sameValue(actual.proofUrls,command.proofUrls)){showError('UNAVAILABLE');return;}
   action.current=null;setUnknownAction(false);setConfirmation(false);setStale(true);putRef(actionKey(actorId,report.id),null);setStatus('交付已提交並讀回：等待審核。');
  }
 });}
 const returnQuery=report?'?returnTask='+templateId+'&report='+report.id:'';
 return <section className="ct-flow"><span className="cs-chip">{templateId} · {task.difficulty} · {task.minutes} · {store.label}</span><h1>{task.title}</h1><p>{task.inputs}</p><ol className="cs-steps"><li>1 選擇來源</li><li>2 討論與證據</li><li>3 私人成果</li><li>4 核對後繼續</li></ol>
 {!valid?<p role="alert">{error}</p>:<>
 <section className="cs-card"><fieldset disabled={locked||!!report}><label>這次想解決甚麼？<input maxLength={200} value={question} onChange={e=>{setQuestion(e.target.value);setPrepared(null);}}/></label>{templateId==='C3'?<><label>資料類別<select aria-label="資料類別" value={section} onChange={e=>{setSection(e.target.value as EarningsSection);setPrepared(null);}}><option value="settled">已結算紀錄</option><option value="tracked">追蹤紀錄（非付款）</option><option value="payouts">歷史付款批次（不執行付款）</option></select></label><div className="ct-two"><label>紀錄期間開始<input type="date" value={period.from} onChange={e=>{setPeriod({...period,from:e.target.value});setPrepared(null);}}/></label><label>紀錄期間結束<input type="date" value={period.to} onChange={e=>{setPeriod({...period,to:e.target.value});setPrepared(null);}}/></label></div></>:<label>選擇已保存作品<select aria-label="選擇已保存作品" value={selected} onChange={e=>{setSelected(e.target.value);setPrepared(null);}}><option value="">請選擇…</option>{choices.map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></label>}<button className="k-btn primary" disabled={!question.trim()||(templateId!=='C3'&&!selected)} onClick={()=>void prepare()}>讀取來源與開始討論</button></fieldset>{report&&<Link href={href('workroom')+'?template='+templateId}>另開同類任務</Link>}</section>
 {prepared&&<section className="cs-card" aria-label="任務討論"><h2>這個任務的獨立討論</h2>{(report??prepared).discussion.map((m,i)=><p className={'cs-message '+m.role} key={i}>{m.body}</p>)}<fieldset disabled={locked}><label>補充這個討論<textarea rows={2} maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)}/></label><button className="k-btn" disabled={!message.trim()} onClick={()=>{const next={...(report??prepared),discussion:[...(report??prepared).discussion,{role:'user' as const,body:message},{role:'assistant' as const,body:'已附上你的補充。這是來源整理模式，請將判斷寫入私人報告，不會自動改動攻略或提交合作。'}]};if(report)change(next);else setPrepared(next);setMessage('');}}>加入討論</button></fieldset><h3>展開證據</h3>{prepared.evidence.map((e,i)=><details className="ct-evidence" key={i}><summary>{e.title} · {e.version}</summary><pre>{e.text}</pre><p>來源：{e.reference}</p></details>)}{!report&&<button className="k-btn primary" disabled={locked} onClick={openReport}>另開私人報告</button>}</section>}
 {report&&<section className="cs-card" aria-label="私人任務成果"><span className="cs-chip">私人 · r{report.revision} · {report.revision?'有已保存版本':'尚未保存'}</span><h2>{report.title}</h2><p>問題：{report.question}</p><p>平台：KinnsoOS · 讀取時間：<time>{report.asOf}</time></p>{stale&&<p role="status" className="cs-error">來源已有較新版本，請重新檢查。</p>}<div className="ct-findings">{report.findings.map((f,i)=><article key={f.code+i} data-state={f.state}><span className="cs-chip">{f.state==='complete'?'已核對':f.state==='needs-work'?'待補齊':'未驗證'}</span><p>{f.label}</p></article>)}</div>
 {report.performance&&<><h3>閱讀範圍與來源缺口</h3><p>所選紀錄期間：{report.period?.from??'未設定'} 至 {report.period?.to??'未設定'}（香港時間）；分母：未驗證；外部平台：未連接。</p><p>範圍：{report.performance.coverage==='partial-page'?'部分頁面':'已回傳紀錄'}。曝光、點擊與轉換率未驗證。</p><h3>來源總計（未按選定期間重算）</h3><div className="ct-two">{report.performance.sourceTotals.map((total,i)=><article className="ct-evidence" key={i}><strong>{total.currency??'幣別未驗證'}</strong><p>原 pending：{total.pending} · 原 paid：{total.paid}</p></article>)}</div><h3>期間內來源紀錄</h3>{report.performance.records.map(item=><article className="ct-evidence" key={item.id}><strong>{item.title}</strong><p>{item.currency??'幣別未驗證'} · {item.amount??'金額未驗證'} · {item.status}</p><time>{item.updatedAt}</time></article>)}</>}
 <fieldset disabled={locked}>{report.delivery&&<><label>修訂回應與交付說明<textarea aria-label="修訂回應與交付說明" rows={4} maxLength={4000} value={report.delivery.notes} onChange={e=>change({...report,delivery:{...report.delivery!,notes:e.target.value}})}/></label><label>交付證明連結（每行一條 HTTPS 連結）<textarea rows={2} value={report.delivery.proofUrls.join('\n')} maxLength={10244} onChange={e=>change({...report,delivery:{...report.delivery!,proofUrls:e.target.value.split('\n').map(v=>v.trim()).filter(Boolean)}})}/></label></>}{report.proposal&&<><p>基準：草稿 r{report.source.kind==='guide'?report.source.value.revision:''}；已發佈 v{report.source.kind==='guide'?report.source.value.publishedVersion:''}。旅人副本不變。</p><label>新版名稱<input aria-label="新版名稱" maxLength={200} value={report.proposal.title} onChange={e=>change({...report,proposal:{...report.proposal!,title:e.target.value}})}/></label><label>新版摘要<textarea aria-label="新版摘要" rows={3} maxLength={4000} value={report.proposal.summary} onChange={e=>change({...report,proposal:{...report.proposal!,summary:e.target.value}})}/></label>{creatorVersionDiff(report).map(d=><article className="ct-diff" key={d.field}><h4>{d.label}</h4><p>原版：{d.before}</p><p>修改後：{d.after}</p></article>)}</>}<label>我的判斷與下一步<textarea aria-label="我的判斷與下一步" maxLength={4000} rows={3} value={report.notes} onChange={e=>change({...report,notes:e.target.value})}/></label></fieldset><ul>{report.gaps.map(g=><li key={g}>{g}</li>)}</ul><div className="cs-actions"><button className="k-btn primary" disabled={locked} onClick={()=>void save()}>保存私人報告</button><button className="k-btn" disabled={locked||report.revision<1} onClick={()=>void prepare(true)}>用最新來源重新檢查</button></div><p className="cs-note">成果存於私人報告，討論與來源一併保留。{store.label}；保存不是發佈或交付。</p>
 {!dirty&&report.revision>0&&<div className="cs-actions">{templateId==='C2'&&report.source.kind==='guide'&&<Link className="k-btn" href={href('studio/guides/'+report.source.value.id+'/edit')+returnQuery}>到既有編輯器修正</Link>}{templateId==='C3'&&<Link className="k-btn" href={href('studio/earnings')+returnQuery}>查看原收益紀錄</Link>}{templateId==='C4'&&report.source.kind==='mission'&&<><button className="k-btn primary" disabled={locked||stale||!report.delivery} onClick={showConfirmation}>預覽交付內容</button><Link className="k-btn" href={href('studio/missions/'+report.source.value.id)+returnQuery}>查看原交付與審核</Link></>}{templateId==='C5'&&<button className="k-btn primary" disabled={locked||stale||!creatorVersionDiff(report).length} onClick={showConfirmation}>預覽版本差異</button>}</div>}
 </section>}
 {confirmation&&report&&<section className="cs-card" aria-label={templateId==='C4'?'交付確認預覽':'版本修改確認'}><h2>{templateId==='C4'?'核對本次交付':'核對完整攻略與版本差異'}</h2>{templateId==='C4'?<><p>目的地：原合作 {report.source.kind==='mission'?report.source.value.title:''}，提交後等待審核。</p><p>里程碑：{report.source.kind==='mission'?report.source.value.milestones.find(m=>m.id===report.delivery?.milestoneId)?.title??'未驗證':'未驗證'}</p><p>原提交參考：{report.delivery?.submissionId??'新提交'}</p><p style={{whiteSpace:'pre-wrap'}}>{report.delivery?.notes}</p>{report.delivery?.proofUrls.map(url=><p key={url}>{url}</p>)}</>:<>{creatorVersionDiff(report).map(d=><article className="ct-diff" key={d.field}><h3>{d.label}</h3><p>原版：{d.before}</p><p>修改後：{d.after}</p></article>)}<h3>將保存的完整內容</h3><h4>{report.proposal?.title}</h4><p>{report.proposal?.city}</p><p>{report.proposal?.summary}</p>{report.proposal?.content.days.map((day,i)=><article className="ct-evidence" key={i}><h4>第 {day.offset+1} 天 · {day.title}</h4>{day.stops.map((stop,j)=><div key={j}><strong>{stop.title}</strong><p style={{whiteSpace:'pre-wrap'}}>{stop.description}</p><p>開始：{stop.startMinuteOfDay===null?'未設定':formatTimeOfDay(stop.startMinuteOfDay)} · 停留：{stop.durationMinutes===null?'未設定':stop.durationMinutes+' 分鐘'}</p>{stop.placeId&&<p>地點參考：{stop.placeId}</p>}</div>)}</article>)}<p>現在只保存草稿；發佈新版本須在既有編輯器另行確認。</p></>}<label><input type="checkbox" disabled={locked} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已逐項核對內容與來源用途，確認繼續。</label><button className="k-btn primary" disabled={locked||!confirmed||dirty} onClick={()=>void deliver()}>{templateId==='C4'?'確認提交審核':'確認保存至原攻略草稿'}</button><button className="k-btn" disabled={locked} onClick={()=>setConfirmation(false)}>返回修改</button></section>}
 {unknown&&<button className="k-btn" disabled={busy} onClick={()=>void save(true)}>核對／重試同一請求</button>}{unknownAction&&<button className="k-btn" disabled={busy} onClick={()=>void deliver(true)}>核對／重試同一交付</button>}{error&&<p className="cs-error" role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
 </>}<Link href={href('workroom/reports')}>私人示例成果庫</Link></section>;
}
export function CreatorReportLibrary({actorId,store}:{actorId:string;store:CreatorReportStore}) {
 const {href}=useApp();const [items,setItems]=useState<CreatorReport[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;const off=subscribeAccountInvalidation(next=>{if(next!==actorId){active=false;setItems([]);setError('帳戶已改變，私人成果已清除。');}});void store.list().then(r=>{if(!active)return;if(r.ok)setItems(r.data.items.filter(i=>i.ownerId===actorId));else setError('成果庫暫時無法讀取。');}).catch(()=>{if(active)setError('成果庫暫時無法讀取。');});return()=>{active=false;off();};},[actorId,store]);
 return <section className="cs-card"><h1>私人任務成果庫</h1><p>{store.label}。每項成果保留自己的問題、討論、證據與版本。</p>{error&&<p role="alert">{error}</p>}{!error&&!items.length&&<p>尚未保存報告，先選一個創作者範本開始。</p>}{items.map(r=><article className="ct-evidence" key={r.id}><Link href={href('workroom')+'?template='+r.templateId+'&report='+r.id}>{r.templateId} · {r.title} · r{r.revision}</Link><p>{r.question}</p><time>{r.asOf}</time></article>)}<Link href={href('workroom/templates')}>選擇任務範本</Link></section>;
}
