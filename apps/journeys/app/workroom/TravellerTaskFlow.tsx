'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {useApp} from '../travel/ui';
import {trips} from '../../lib/trips/repository';
import {bookmarks,type BookmarkRow} from '../../lib/bookmarks/repository';
import {guides} from '../../lib/guides/repository';
import {tripScheduleIssue} from '../../lib/trips/input-validation';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import type {TripSnapshot,GuideSnapshot,GuideSummary,PublicTripProjection} from '../../lib/contracts/trips';
import {templateById} from '../../lib/studio/templates';
import {travellerAdoptionEvidence,travellerPublicProjection,type TravellerBrief,type TravellerOperation,type TravellerTaskId,type TravellerStore,type TravellerOutcome} from '../../lib/studio/traveller-tasks';
import {executeTravellerBrief,revokeTravellerShare} from '../../lib/studio/traveller-execution';
import './traveller-tasks.css';
import {DiscoveryTripPreview} from './DiscoveryTripPreview';
import type {DiscoveryStore} from '../../lib/discovery/contracts';
const uid=()=>crypto.randomUUID();
function data<T>(r:{ok:true;data:T}|{ok:false;code:string}):T {if(!r.ok)throw Error(['RESTRICTED','FORBIDDEN','NOT_FOUND'].includes(r.code)?'來源或權限已變更，無法開啟這份私人內容。':'未能讀取，請重試；未確認任何保存。');return r.data;}

export function PublicTravellerPreview({value,mediaBase='/api/media/'}:{value:PublicTripProjection;mediaBase?:string}) {
 return <section className="tt-projection" aria-label="將公開的完整內容"><h3>{value.title}</h3>{value.days.map(d=><article key={d.id}><h4>第 {d.offset+1} 天 · {d.title}</h4>{d.stops.map(s=><div className="tt-stop" key={s.id}><strong>{s.title}</strong><p>{s.startMinuteOfDay===null?'時間未定':`${Math.floor(s.startMinuteOfDay/60).toString().padStart(2,'0')}:${(s.startMinuteOfDay%60).toString().padStart(2,'0')}`} · {s.durationMinutes===null?'停留時間未定':`${s.durationMinutes} 分鐘`}</p>{s.description&&<p>{s.description}</p>}{s.source&&<small>來源：{s.source.creatorName} · v{s.source.guideVersion}{s.source.withdrawn?' · 來源已撤回':''}</small>}</div>)}</article>)}<div className="tt-sample-images">{value.approvedMediaIds.map(id=><figure key={id}><img src={mediaBase+id} alt="固定示例色塊圖片" width={120} height={80}/><figcaption>自有示例色塊 · 不含私人描述</figcaption></figure>)}</div><p>已選圖片：{value.approvedMediaIds.length} 張{value.approvedMediaIds.length>0?'（固定示例圖）':''}</p><p>私人筆記、圖片描述、未選站點及未選圖片均不公開。</p></section>;
}
export function TravellerTaskFlow({templateId,actorId,store,discoveryStore}:{templateId:TravellerTaskId;actorId:string;store:TravellerStore;discoveryStore?:DiscoveryStore}){
 const {href}=useApp(),query=useSearchParams(),task=templateById(templateId);
 const [list,setList]=useState<{id:string;title:string;revision:number}[]>([]),[saved,setSaved]=useState<BookmarkRow[]>([]),[tripId,setTripId]=useState(''),[guideId,setGuideId]=useState('');
 const [trip,setTrip]=useState<TripSnapshot|null>(null),[guide,setGuide]=useState<GuideSnapshot|GuideSummary|null>(null);
 const [question,setQuestion]=useState(templateId==='T1'?'幫我安排一天慢遊，保留休息時間。':templateId==='T2'?'把收藏的 guide 加入我的行程，保留原有私人筆記。':templateId==='T3'?'只分享我選的內容，之後可以撤回。':templateId==='T4'?'整理收藏，分清可採用攻略與靈感摘要。':'記下今天的片刻，只保存在自己的行程。');
 const [title,setTitle]=useState('我的輕鬆一天（示例）'),[date,setDate]=useState('2026-11-07'),[zone,setZone]=useState('Asia/Hong_Kong'),[stopNames,setStopNames]=useState('海旁慢步（示例）\n午後休息（示例）');
 const [note,setNote]=useState('PRIVATE_TRAVEL_MEMORY：今天的私人示例感想。'),[description,setDescription]=useState('示例色塊，沒有真實人物或位置。'),[photo,setPhoto]=useState(false),[stopId,setStopId]=useState('');
 const [selected,setSelected]=useState<string[]>([]),[selectedMedia,setSelectedMedia]=useState<string[]>([]),[removeIds,setRemoveIds]=useState<string[]>([]),[notes,setNotes]=useState('');
 const [evidence,setEvidence]=useState<string[]>([]),[loaded,setLoaded]=useState(false),[brief,setBrief]=useState<TravellerBrief|null>(null),[stored,setStored]=useState(false),[confirmed,setConfirmed]=useState(false),[outcome,setOutcome]=useState<TravellerOutcome|null>(null),[revokeConfirm,setRevokeConfirm]=useState(false);
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[valid,setValid]=useState(true);
 const generation=useRef(0),locked=useRef(false),cancellation=useRef<AbortController|null>(null);
 useEffect(()=>{
  const version=++generation.current;setValid(true);
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next===actorId)return;generation.current++;cancellation.current?.abort();setValid(false);setTrip(null);setGuide(null);setBrief(null);setEvidence([]);setOutcome(null);setError('帳戶已變更，私人內容已清除。請重新登入。');});
  void(async()=>{try{
   const [a,b]=await Promise.all([trips.list(undefined,actorId),bookmarks.list(actorId)]);if(version!==generation.current)return;
   const ts=data(a),bs=data(b);setList(ts.items);setSaved(bs.items);setTripId(ts.items.some(t=>t.id===query.get('tripId'))?query.get('tripId')!:ts.items[0]?.id??'');setGuideId(bs.items.find(b=>b.guides)?.guide_id??'');
   const id=query.get('run');if(id){const readback=await store.get(id);const savedBrief=data(!readback.ok&&readback.code==='NOT_FOUND'?await store.intent(id):readback);if(version!==generation.current)return;if(savedBrief.ownerId!==actorId||savedBrief.templateId!==templateId)throw Error('這份 brief 不屬於目前任務。');setBrief(savedBrief);setStored(readback.ok);setLoaded(true);setEvidence(savedBrief.evidence);setQuestion(savedBrief.question);setNotes(savedBrief.notes);setMessage(readback.ok?'已讀回私人 brief。執行時沿用當中的原請求。':'已恢復原 brief 的完整內容；保存結果未知，請核對同一請求。');}
  }catch(e){if(version===generation.current)setError(String((e as Error).message));}})();
  return()=>{generation.current++;cancellation.current?.abort();unsubscribe();};
 },[actorId,templateId]);
 async function action(work:(active:()=>boolean,signal:AbortSignal)=>Promise<void>){if(locked.current||!valid)return;locked.current=true;setBusy(true);setError('');const controller=new AbortController();cancellation.current=controller;const epoch=generation.current,active=()=>epoch===generation.current&&!controller.signal.aborted;
  try{await work(active,controller.signal);}catch(e){if(active())setError((e as Error).message);}finally{if(active()){locked.current=false;setBusy(false);cancellation.current=null;}}
 }
 async function read(){await action(async active=>{
  const proof=['示例來源：KinnsoOS 本機原創資料，並非真實旅遊資訊。','交通、開放時間、票價及天氣：未驗證；沒有 Calendar、Drive 或 Gmail 連接。'];
  if(templateId==='T1'){if(!title.trim()||tripScheduleIssue(zone,date)||!stopNames.trim()||stopNames.split('\n').filter(s=>s.trim()).length>5||stopNames.split('\n').some(s=>s.trim().length>200))throw Error('請填行程名稱、有效日期／時區，以及一至五個示例站點。');proof.push(`你的要求：${question}`,`安排：${date} · ${zone}`,`由你提供的站點：${stopNames.split('\n').filter(s=>s.trim()).join('、')}`);}
  if(['T2','T3','T5'].includes(templateId)){
   const current=data(await trips.get(tripId,actorId));if(!active())return;setTrip(current);setStopId(current.days.flatMap(d=>d.stops)[0]?.id??'');setSelected([]);setSelectedMedia([]);
   proof.push(`私人行程：${current.title} · 版本 ${current.revision} · ${current.days.length} 天`);
   if(templateId==='T2'){
    const bm=data(await bookmarks.list(actorId,undefined,guideId));if(!active())return;if(!bm.items.some(b=>b.guide_id===guideId&&b.guides))throw Error('這份 guide 已不在可讀取收藏，請重新選擇。');
    const g=data(await guides.get(guideId));if(!active())return;setGuide(g);const info=travellerAdoptionEvidence(g,current);proof.push(`guide：${g.title} · v${info.version} · ${info.creatorName}`,`新增 ${info.days} 天、${info.stops} 站；保留 ${info.privateNotesKept} 則已有私人筆記。`,`採用的是此版本副本，作者日後發佈新版不會覆寫你的行程。`);
   }
   if(templateId==='T5')proof.push('筆記和圖片描述存入已選站點的私人筆記；圖片需完成示例核實再附加。');
  }
  if(templateId==='T4'){const bs=data(await bookmarks.list(actorId));if(!active())return;setSaved(bs.items);setRemoveIds([]);for(const row of bs.items){if(!row.guides){proof.push('來源已撤回的收藏：仍保留紀錄，不猜測內容。');continue;}const g=data(await guides.get(row.guide_id));if(!active())return;proof.push(`${g.title} → ${g.kind==='itinerary'?'可採用攻略':'靈感摘要（不能轉為行程）'}`);}proof.push('分類只保存為私人整理建議；原收藏不新增分類欄位。');}
  if(!active())return;setEvidence(proof);setLoaded(true);setBrief(null);setStored(false);setOutcome(null);setMessage('已讀取來源，請展開證據並核對後另開私人 brief。');
 });}
 function makeBrief(){try{
  setError('');const operations:TravellerOperation[]=[];
  if(templateId==='T1'){
   const dayId=uid();operations.push({kind:'create',requestId:uid(),input:{title,timezone:zone,startDate:date||null}},{kind:'command',requestId:uid(),tripId:'created',revision:1,command:{type:'addDay',id:dayId,offset:0,title:'輕鬆第一天'}});
   stopNames.split('\n').map(s=>s.trim()).filter(Boolean).forEach((name,i)=>operations.push({kind:'command',requestId:uid(),tripId:'created',revision:i+2,command:{type:'addStop',id:uid(),dayId,position:i,input:{title:name,placeId:null,travellerNote:'',startMinuteOfDay:600+i*120,durationMinutes:60}}}));
  }else if(templateId==='T2'){
   if(!trip||guide?.kind!=='itinerary')throw Error('請先讀取可採用的 guide。');operations.push({kind:'adopt',requestId:uid(),tripId:trip.id,revision:trip.revision,guideId:guide.id,version:guide.version,guide});
  }else if(templateId==='T3'){
   if(!trip)throw Error('請先選行程。');const projection=travellerPublicProjection(trip,selected,selectedMedia,actorId),requestId=uid();operations.push({kind:'share',requestId,revision:trip.revision,intent:{requestId,tripId:trip.id,stopIds:[...selected],mediaIds:[...selectedMedia],expiresAt:new Date(Date.now()+6*86400000).toISOString()},projection});
  }else if(templateId==='T4'){
   for(const id of removeIds)operations.push({kind:'bookmark',requestId:uid(),guideId:id,desiredState:false});
  }else{
   if(!trip||!trip.days.flatMap(d=>d.stops).some(s=>s.id===stopId))throw Error('請先在行程加入站點，再記錄片刻。');const privateNote=note+(photo?'\n圖片描述（私人）：'+description:'');if(!privateNote.trim()||privateNote.length>4000)throw Error('請填寫四千字以內的私人筆記。');
   operations.push({kind:'command',tripId:trip.id,revision:trip.revision,requestId:uid(),command:{type:'updateStop',id:stopId,patch:{travellerNote:privateNote}}});if(photo)operations.push({kind:'photo',tripId:trip.id,revision:trip.revision+1,requestId:uid(),attachRequestId:uid(),stopId});
  }
  setBrief({id:uid(),ownerId:actorId,templateId,visibility:'private',title:task.title,question,evidence:[...evidence],notes,createdAt:new Date().toISOString(),operations,tripId:trip?.id??null,tripRevision:trip?.revision??null,guideId:templateId==='T2'?guide?.id??null:null,guideVersion:templateId==='T2'&&guide?.kind==='itinerary'?guide.version:null});setStored(false);setConfirmed(false);setMessage('私人 brief 已準備，尚未保存或套用。');
 }catch(e){setError((e as Error).message);}}
 async function saveBrief(){if(!brief)return;await action(async active=>{
  // URL contains only the opaque ID. Failed acknowledgements can read the same intent.
  history.replaceState(null,'',href('workroom')+'?template='+templateId+'&run='+brief.id);
  data(await store.stage(brief));if(!active())return;const staged=data(await store.intent(brief.id));if(!active())return;if(JSON.stringify(staged)!==JSON.stringify(brief))throw Error('結果未知，未能保留原請求。');
  data(await store.save(brief));if(!active())return;const savedBrief=data(await store.get(brief.id));if(!active())return;if(JSON.stringify(savedBrief)!==JSON.stringify(brief))throw Error('結果未知，未能讀回相同的 brief。');setStored(true);setMessage('私人 brief 已保存並讀回。');
 });}
 async function execute(){if(!brief||!stored||!confirmed)return;await action(async (active,signal)=>{const result=await executeTravellerBrief(brief,store,active,signal);if(!active())return;setOutcome(result);setMessage(result.message);});}
 const stops=trip?.days.flatMap(d=>d.stops)??[],projection=brief?.operations.find(o=>o.kind==='share');
 if(!valid)return <section className="cs-card"><p role="alert">{error}</p></section>;
 return <section className="tt-flow cs-card" aria-label="旅人任務"><div className="tt-heading"><span className="cs-chip">{templateId} · {task.difficulty} · {task.minutes}</span><h1>{task.title}</h1><p>把想法變成自己的旅程，一步一步確認。</p></div>
  {templateId==='T1'&&discoveryStore&&query.get('discoveryIntentId')&&query.get('publicationId')&&!loaded&&<DiscoveryTripPreview store={discoveryStore} intentId={query.get('discoveryIntentId')!} publicationId={query.get('publicationId')!} onUse={intent=>{setTitle('我的香港旅程（示例）');setDate(intent.dateSpec.kind==='fixed'?intent.dateSpec.start:'');setZone('Asia/Hong_Kong');}}/>}
  <ol className="tt-progress" aria-label="任務進度">{['選擇資料','查看證據','私人 brief','核對成果'].map((s,i)=><li key={s} aria-current={(outcome?3:brief?2:loaded?1:0)===i?'step':undefined}>{i+1} {s}</li>)}</ol>
  <p className="tt-notice">只用示例資料 · 私人保存於本機記憶體 · 重啟或重設後清除</p>
  {!brief&&<fieldset disabled={busy||loaded}><label>這次想完成甚麼？<textarea aria-label="這次想完成甚麼？" value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)}/></label>
   {templateId==='T1'?<div className="tt-grid"><label>行程名稱<input maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>出發日期<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>時區<input value={zone} onChange={e=>setZone(e.target.value)}/></label><label>示例站點（每行一個，最多五個）<textarea aria-label="示例站點（每行一個，最多五個）" value={stopNames} onChange={e=>setStopNames(e.target.value)}/></label></div>:templateId!=='T4'&&<label>選擇自己的行程<select aria-label="選擇自己的行程" value={tripId} onChange={e=>setTripId(e.target.value)}>{list.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>}
   {templateId==='T2'&&<label>選擇收藏 guide<select aria-label="選擇收藏 guide" value={guideId} onChange={e=>setGuideId(e.target.value)}>{saved.filter(b=>b.guides).map(b=><option key={b.guide_id} value={b.guide_id}>{b.guides!.title}</option>)}</select></label>}
  </fieldset>}
  {!loaded&&!brief&&<button className="k-btn primary" disabled={busy} onClick={()=>void read()}>讀取來源與開始討論</button>}
  {loaded&&<section aria-label="旅人討論"><h2>這次的討論</h2><p className="tt-question">{question}</p><p>以下按你選的資料整理。未驗證的內容保留標示；沒有替你搜尋或連接帳號。</p><details><summary>展開來源與證據（{evidence.length} 項）</summary><ul>{evidence.map((s,i)=><li key={i}>{s}</li>)}</ul></details></section>}
  {loaded&&!brief&&<>
   {templateId==='T3'&&<fieldset disabled={busy}><legend>逐項選擇公開內容</legend>{stops.map(s=><label className="tt-check" key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/>{s.title}</label>)}{trip?.media.filter(m=>m.state==='ready'&&m.ownerId===actorId).map(m=><label className="tt-check" key={m.id}><input type="checkbox" checked={selectedMedia.includes(m.id)} onChange={e=>setSelectedMedia(e.target.checked?[...selectedMedia,m.id]:selectedMedia.filter(id=>id!==m.id))}/>我有權公開這張示例圖片（{m.id.slice(0,8)}）</label>)}<p>分享約六天後到期。私人筆記和圖片描述不會帶入。</p>{selected.length>0&&trip&&<PublicTravellerPreview value={travellerPublicProjection(trip,selected,selectedMedia,actorId)}/>}</fieldset>}
   {templateId==='T4'&&<fieldset disabled={busy}><legend>保留收藏，或逐項選擇移除</legend>{saved.map(b=><label className="tt-check" key={b.guide_id}><input type="checkbox" checked={removeIds.includes(b.guide_id)} onChange={e=>setRemoveIds(e.target.checked?[...removeIds,b.guide_id]:removeIds.filter(id=>id!==b.guide_id))}/>移除收藏：{b.guides?.title??'已撤回來源'}</label>)}<p>沒有勾選的收藏會保留；分類只存入下面的私人整理建議。</p></fieldset>}
   {templateId==='T5'&&<fieldset disabled={busy}><label>記錄到哪一站？<select aria-label="記錄到哪一站？" value={stopId} onChange={e=>setStopId(e.target.value)}>{stops.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><p>目前筆記：{stops.find(s=>s.id===stopId)?.travellerNote||'未有筆記'}。確認後會以以下完整內容更新。</p><label>新的私人筆記<textarea aria-label="新的私人筆記" maxLength={3800} value={note} onChange={e=>setNote(e.target.value)}/></label><label className="tt-check"><input type="checkbox" checked={photo} onChange={e=>setPhoto(e.target.checked)}/>附加固定示例圖（只用自有色塊，不上載個人檔案）</label>{photo&&<label>圖片描述（保持私人）<textarea aria-label="圖片描述（保持私人）" maxLength={180} value={description} onChange={e=>setDescription(e.target.value)}/></label>}</fieldset>}
   <label>{templateId==='T4'?'我的私人整理建議':'我的判斷與補充'}<textarea aria-label={templateId==='T4'?'我的私人整理建議':'我的判斷與補充'} value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)}/></label>
   <div className="tt-actions"><button className="k-btn primary" disabled={busy} onClick={makeBrief}>另開私人 brief</button><button className="k-btn" disabled={busy} onClick={()=>{setLoaded(false);setTrip(null);setGuide(null);}}>返回修改資料</button></div>
  </>}
  {brief&&<section aria-label="旅人私人 brief"><h2>{brief.title} · 私人 brief</h2><p>{brief.notes||'未加入額外補充。'}</p><ul>{brief.evidence.map((s,i)=><li key={i}>{s}</li>)}</ul>
   {projection?.kind==='share'?<PublicTravellerPreview value={projection.projection}/>:<ol>{brief.operations.map((op,i)=><li key={op.requestId}>{op.kind==='create'?`建立行程：${op.input.title} · ${op.input.startDate} · ${op.input.timezone}`:op.kind==='adopt'?`採用 ${op.guide.title} v${op.version} · ${op.guide.creator.name}`:op.kind==='bookmark'?`移除收藏：${saved.find(b=>b.guide_id===op.guideId)?.guides?.title??op.guideId}`:op.kind==='photo'?'固定示例圖：先核實，再附加至已選站點（私人）':op.kind==='command'?op.command.type==='addStop'?`${op.command.input.title} · ${op.command.input.startMinuteOfDay! /60}:00 · 60 分鐘`:op.command.type==='addDay'?`加入一天：${op.command.title}`:op.command.type==='updateStop'?`更新完整私人筆記：${op.command.patch.travellerNote}`:'更新行程':'分享'}{i===0&&brief.tripId&&<p>存回：{list.find(t=>t.id===brief.tripId)?.title??brief.tripId} · 核對版本 {brief.tripRevision}</p>}</li>)}</ol>}
   {brief.operations.some(o=>o.kind==='adopt')&&brief.operations.map(o=>o.kind==='adopt'?<div key={o.requestId}>{o.guide.days.map(d=><article key={d.id}><h3>{d.title}</h3>{d.stops.map(s=><p key={s.id}>{s.title}：{s.description}</p>)}</article>)}</div>:null)}
   {!brief.operations.length&&<p>只保存私人整理建議，不更改收藏。</p>}
   {!stored?<button className="k-btn primary" disabled={busy} onClick={()=>void saveBrief()}>保存／核對私人 brief</button>:<>
    <label className="tt-check"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核對完整內容、來源及存回位置，確認繼續。</label>
    <button className="k-btn primary" disabled={busy||!confirmed} onClick={()=>void execute()}>核對／執行原操作</button>
   </>}
  </section>}
  {outcome&&<section aria-label="旅人成果" className="tt-result"><h2>已核對的成果</h2><p>{outcome.message}</p>{outcome.tripId&&<><Link className="k-btn" href={href('trips/'+outcome.tripId)}>開啟既有行程編輯器</Link><Link className="k-btn" href={href('workroom')+'?template=T3&tripId='+outcome.tripId}>接著分享行程</Link></>}{outcome.share?.url&&<><p><a href={outcome.share.url} target="_blank" rel="noreferrer">開啟唯讀示例分享</a></p><p className="tt-notice">只在這部電腦的本機預覽可用。到期：{new Date(outcome.share.expiresAt).toLocaleString('zh-HK')}</p><label className="tt-check"><input type="checkbox" checked={revokeConfirm} disabled={busy} onChange={e=>setRevokeConfirm(e.target.checked)}/>確認撤回這條示例分享連結</label><button className="k-btn" disabled={busy||!revokeConfirm} onClick={()=>void action(async active=>{const receipt=await revokeTravellerShare(outcome.share!,store,active);if(!active())return;setOutcome({...outcome,share:receipt,message:'示例分享已撤回，已確認原連結無法再讀取。'});setMessage('示例分享已撤回，已確認原連結無法再讀取。');})}>撤回並核對連結</button></>}<p>撤回會阻止之後讀取連結，無法刪除別人已保存的副本。</p></section>}
  <p role="status" aria-live="polite">{busy?'處理中，請稍候…':message}</p>{error&&<p role="alert">{error}</p>}
  <nav className="tt-actions"><Link href={href('workroom/traveller-results')}>旅人私人 brief 庫</Link><Link href={href('trips')}>原有行程</Link><Link href={href('saved')}>原有收藏</Link><Link href={href('workroom')+'?template='+templateId}>另開一個獨立任務</Link></nav>
 </section>;
}
export function TravellerBriefLibrary({store,actorId}:{store:TravellerStore;actorId:string}) {
 const {href}=useApp(),[items,setItems]=useState<TravellerBrief[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){active=false;setItems([]);setError('帳戶已變更，私人內容已清除。');}});void store.list().then(r=>{if(active){if(r.ok)setItems(r.data.items);else setError('未能讀取私人 brief。');}});return()=>{active=false;unsubscribe();};},[actorId,store]);
 return <section className="cs-card tt-flow"><h1>旅人私人 brief 庫</h1><p>每個任務獨立保存。原行程及收藏仍可直接開啟；重啟本機預覽會清除示例。</p>{error&&<p role="alert">{error}</p>}{!items.length&&!error&&<p>未有已保存的旅人 brief。</p>}{items.map(b=><article className="tt-stop" key={b.id}><Link href={href('workroom')+'?template='+b.templateId+'&run='+b.id}>{b.templateId} · {b.title}</Link><p>{b.question}</p><small>{new Date(b.createdAt).toLocaleString('zh-HK')} · 私人示例</small></article>)}</section>;
}
