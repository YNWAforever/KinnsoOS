'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {adoptionPath,parseAdoptionPath,afterTripCreation} from '../../lib/guides/adoption-intent';
import {PendingAdoptionRecovery} from './PendingAdoptionRecovery';
import {trips} from '../../lib/trips/repository';
import {guides} from '../../lib/guides/repository';
import type {TripSnapshot,TripCommand,TripStop,TripDay} from '../../lib/contracts/trips';
import {useApp} from './ui';
import {ImportPreview} from './ImportPreview';
import {useDraftNavigation} from './UnsavedDraftGuard';
import {RecordCapture} from './RecordCapture';
import {SharePreview} from './SharePreview';
import {TripWarnings} from './TripWarnings';
import {synchronizeAccountCache,saveLocalSnapshot,readLocalSnapshot,saveLocalDraft,readLocalDraft,clearLocalDraft,subscribeAccountInvalidation,invalidateAccountViews,readPendingCreation,savePendingCreation,recordCreatedTrip,clearPendingCreation,restoreOriginalCreation,type PendingCreation,type CreationInput} from '../../lib/trips/local-drafts';
import {exportPrivateTrip} from '../../lib/trips/export';

function DayEditor({day,busy,save}:{day:TripDay;busy:boolean;save:(command:TripCommand)=>Promise<boolean>}) {
 const {t,ready}=useApp(),[title,setTitle]=useState(day.title),[offset,setOffset]=useState(day.offset);
 return <form onSubmit={event=>{event.preventDefault();void save({type:'updateDay',id:day.id,patch:{title,offset}})}}>
 <label>{t('Day title','當日標題')}<input disabled={!ready} required maxLength={200} value={title} onChange={event=>setTitle(event.target.value)}/></label>
 <label>{t('Day offset (first day is 0)','日數偏移（首日為 0）')}<input disabled={!ready} type="number" min={0} max={3650} required value={offset} onChange={event=>setOffset(Number(event.target.value))}/></label>
 <button className="k-btn" disabled={busy||!ready}>{t('Save day','保存當日資料')}</button></form>
}
function StopEditor({stop,dayId,days,busy,save,remove,move,edited}:{stop:TripStop;dayId:string;days:TripDay[];busy:boolean;save:(command:TripCommand)=>Promise<boolean>;remove:()=>void;move:()=>void;edited:()=>void}) {
 const {t,ready}=useApp(),[title,setTitle]=useState(stop.title),[note,setNote]=useState(stop.travellerNote),[minute,setMinute]=useState(stop.startMinuteOfDay?.toString()??''),[duration,setDuration]=useState(stop.durationMinutes?.toString()??'');
 const [targetDay,setTargetDay]=useState(dayId),[position,setPosition]=useState(0);
 return <article className="os-guide os-stop"><form onSubmit={e=>{e.preventDefault();void save({type:'updateStop',id:stop.id,patch:{title,travellerNote:note,startMinuteOfDay:minute===''?null:Number(minute),durationMinutes:duration===''?null:Number(duration)}})}}>
 <label>{t('Stop title','站點名稱')}<input disabled={!ready} required maxLength={200} value={title} onChange={e=>{setTitle(e.target.value);edited()}}/></label>
 <label htmlFor={'note-'+stop.id}>{t('Private note','私人筆記')}</label><textarea id={'note-'+stop.id} maxLength={4000} value={note} onChange={e=>{setNote(e.target.value);edited()}}/>
 <label>{t('Start minute of day (0–1439)','當日起始分鐘（0–1439）')}<input type="number" min={0} max={1439} value={minute} onChange={e=>setMinute(e.target.value)}/></label>
 <label>{t('Duration in minutes','停留分鐘')}<input type="number" min={1} max={1440} value={duration} onChange={e=>setDuration(e.target.value)}/></label>
 {note!==stop.travellerNote&&<p>{t('Currently saved note','目前已保存的筆記')}: {stop.travellerNote||t('(empty)','（空白）')}</p>}
 {stop.sourceDescription&&<p>{t('Creator instructions','作者指南')}: {stop.sourceDescription}</p>}
 {stop.source&&<p>{t('Source','來源')}: {stop.source.creatorName} · v{stop.source.guideVersion} {stop.source.withdrawn?t('(withdrawn; your notes are retained)','（已撤回；你的筆記保留）'):''}</p>}
 <button className="k-btn primary" disabled={busy}>{t('Save stop','保存站點')}</button></form>
 <button className="k-btn" disabled={busy} onClick={move}>{t('Move to first','移到首位')}</button><button className="k-btn" disabled={busy} onClick={remove}>{t('Remove stop','移除站點')}</button>
 <form onSubmit={event=>{event.preventDefault();void save({type:'moveStop',id:stop.id,dayId:targetDay,position})}}>
 <label htmlFor={'move-day-'+stop.id}>{t('Move to day','移至當日')}</label><select id={'move-day-'+stop.id} value={targetDay} onChange={event=>setTargetDay(event.target.value)}>{days.map(day=><option key={day.id} value={day.id}>{day.offset+1} · {day.title}</option>)}</select>
 <label>{t('Position (first is 0)','排序（首位為 0）')}<input type="number" required min={0} max={Math.max(0,(days.find(day=>day.id===targetDay)?.stops.length??0)-(targetDay===dayId?1:0))} value={position} onChange={event=>setPosition(Number(event.target.value))}/></label>
 <button className="k-btn" disabled={busy||!ready}>{t('Move stop','移動站點')}</button></form></article>
}
export function TripWorkspace({id,actorId,initialHeading=null,mediaEnabled=false,sharingEnabled=false}:{id?:string;actorId:string|null;initialHeading?:import('../../lib/trips/private-heading').PrivateTripHeading|null;mediaEnabled?:boolean;sharingEnabled?:boolean}) {
 const requestNavigation=useDraftNavigation();
 const {t,href,ready,locale}=useApp(),router=useRouter(),query=useSearchParams(),[list,setList]=useState<{id:string;title:string}[]>([]),[next,setNext]=useState<string|null>(null),[trip,setTrip]=useState<TripSnapshot|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[title,setTitle]=useState(''),[date,setDate]=useState(''),[timezone,setTimezone]=useState('UTC'),[accountValid,setAccountValid]=useState(true);
 const returnIntent=!id?parseAdoptionPath(query.get('next'),locale):null;
 const listPath=href('trips')+(returnIntent?'?next='+encodeURIComponent(adoptionPath(locale,returnIntent.guideId,undefined,returnIntent.flowId??undefined,returnIntent.version,returnIntent.creationId)):'');
 const creation=useRef<{intent:PendingCreation;input:CreationInput|null}|null>(null),[creationState,setCreationState]=useState<typeof creation.current>(null),[creationReady,setCreationReady]=useState(false),[sourceVersion,setSourceVersion]=useState<number|null>(null),[originalFieldsRequired,setOriginalFieldsRequired]=useState(false);
 const pending=useRef<{key:string;requestId:string;revision:number;command?:TripCommand}|null>(null),lock=useRef(false),epoch=useRef(0),conflicted=useRef(false),reapply=useRef(false),preserveInputs=useRef(false);
 useEffect(()=>{epoch.current++;setAccountValid(!!actorId);setTrip(null);setList([]);setNext(null);setTitle('');setDate('');pending.current=null;preserveInputs.current=false;conflicted.current=false;reapply.current=false;lock.current=false;setBusy(false);
  const invalidate=(nextOwner:string|null)=>{if(nextOwner===actorId)return;epoch.current++;creation.current=null;setCreationState(null);setCreationReady(false);setSourceVersion(null);setOriginalFieldsRequired(false);setMessage(t('Account changed. Sign in again to review your original action.','帳戶已變更，請重新登入並核對原操作。'));setAccountValid(false);setTrip(null);setList([]);setNext(null);setTitle('');setDate('');pending.current=null;lock.current=false;setBusy(false);router.refresh()};
  const unsubscribe=subscribeAccountInvalidation(invalidate);
  const check=async()=>{if(document.visibilityState!=='visible'||!navigator.onLine)return;const generation=epoch.current;try{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(generation===epoch.current&&body.data?.id!==actorId)invalidate(body.data?.id??null)}catch{/* Foreground requests still verify the current account. */}};
  document.addEventListener('visibilitychange',check);return()=>{epoch.current++;unsubscribe();document.removeEventListener('visibilitychange',check)}
 },[actorId,id,router]);
 useEffect(()=>{
  if(id||!actorId)return;let active=true;const generation=epoch.current;
  creation.current=null;setCreationState(null);setCreationReady(false);setSourceVersion(null);setOriginalFieldsRequired(false);
  void (async()=>{try{
   await synchronizeAccountCache(actorId);
   const stored=await readPendingCreation(actorId,returnIntent?.guideId??null);
   if(!active||generation!==epoch.current)return;
   creation.current=stored;setCreationState(stored);
   if(stored?.input){setTitle(stored.input.title);setDate(stored.input.startDate??'');setTimezone(stored.input.timezone)}
   if(returnIntent&&!stored){
    const source=await guides.get(returnIntent.guideId);
    if(!active||generation!==epoch.current)return;
    if(!source.ok||source.data.kind!=='itinerary'){setMessage(t('This guide has no available structured itinerary. Return to the guide; no trip was created.','此攻略未有可用的結構化行程，請返回攻略；尚未建立行程。'));return}
    if(returnIntent.version!==undefined&&source.data.version!==returnIntent.version){setMessage(t('The source version changed. Return to the guide and review it before creating a trip.','來源版本已有變更，請返回攻略重新核對後再建立行程。'));return}
    setTitle(source.data.title);setSourceVersion(source.data.version);
   }
   if(active&&generation===epoch.current)setCreationReady(true);
  }catch{if(active&&generation===epoch.current)setMessage(t('Creation recovery could not be loaded. Reload before creating a trip.','未能載入建立行程恢復資料，請重新載入後再建立。'))}})();
  return()=>{active=false};
 },[actorId,id,returnIntent?.guideId,returnIntent?.version]);
 useEffect(()=>{setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')},[]);
 useEffect(()=>{if(!actorId)return;let active=true;const generation=epoch.current;setMessage(t('Loading…','載入中…'));const load=(async()=>{await synchronizeAccountCache(actorId).catch(()=>{});return id?await trips.get(id,actorId):await trips.list(undefined,actorId)})();void load.then(async result=>{if(!active||generation!==epoch.current)return;if(!result.ok){if(id&&!navigator.onLine){const cached=await readLocalSnapshot(actorId,id);if(!active||generation!==epoch.current)return;if(cached){setTrip(cached);setTitle(cached.title);setDate(cached.startDate??'');setTimezone(cached.timezone);setMessage(t('Offline — downloaded account copy','離線 — 已下載的帳戶副本'));return}}setMessage(result.code==='NOT_FOUND'?t('Trip not found.','找不到行程。'):result.code==='AUTH_REQUIRED'?t('Sign in to load your trip.','請登入以載入行程。'):t('Connection failed. Your input is kept.','連線失敗，你的輸入已保留。'));return}
 if(id){const data=result.data as TripSnapshot;setTrip(data);void saveLocalSnapshot(actorId,data).catch(()=>{});if(!preserveInputs.current){setTitle(data.title);setDate(data.startDate??'');setTimezone(data.timezone)}preserveInputs.current=false}else{const data=result.data as {items:{id:string;title:string}[];nextCursor:string|null};setList(data.items);setNext(data.nextCursor)}setMessage('')});return()=>{active=false}},[id,actorId,retry]);
 async function apply(command:TripCommand) {
  if(!trip||!accountValid||lock.current)return false;const generation=epoch.current;lock.current=true;setBusy(true);setMessage(t('Saving…','保存中…'));
  const key=JSON.stringify(command),stored=await readLocalDraft(actorId!,trip.id).catch(()=>null);
  if(generation!==epoch.current)return false;
  const sameTarget=stored?.command.type===command.type&&('id' in command&&'id' in stored.command?command.id===stored.command.id:JSON.stringify(stored.command)===key);
  const replaceDraft=!!stored&&reapply.current&&sameTarget;
  if(stored&&!replaceDraft){if(JSON.stringify(stored.command)!==key){setMessage(t('Another pending edit must be retried or reviewed first. New input stays in this tab.','請先重試或核對待同步編輯。新輸入會保留在此頁。'));setBusy(false);lock.current=false;return false}pending.current={key,requestId:stored.requestId,revision:stored.baseRevision,command}}
  else if(pending.current?.key!==key||replaceDraft)pending.current={key,requestId:crypto.randomUUID(),revision:trip.revision,command};
  reapply.current=false;const intent=pending.current!;let storedLocally=true;
  try{await saveLocalDraft(actorId!,trip.id,intent.revision,command,intent.requestId,replaceDraft)}catch(error){if(generation!==epoch.current)return false;storedLocally=false;if(error instanceof Error&&['PENDING_DRAFT','CACHE_ACCOUNT_CHANGED'].includes(error.message)){setMessage(t('Another pending edit or account change prevents this save. Input stays in this tab.','另有待同步編輯或帳戶已改變，輸入保留在此頁。'));setBusy(false);lock.current=false;return false}}
  if(generation!==epoch.current)return false;
  const result=await trips.apply(trip.id,intent.revision,intent.requestId,command,actorId!);
  if(generation!==epoch.current)return false;
  conflicted.current=!result.ok&&result.code==='CONFLICT';
  if(result.ok){setTrip(result.data);void saveLocalSnapshot(actorId!,result.data).catch(()=>{});void clearLocalDraft(actorId!,trip.id,intent.requestId).catch(()=>{});pending.current=null;setMessage(t('Saved to your account','已保存至你的帳戶'));void trips.get(trip.id,actorId!)}
  else setMessage(!navigator.onLine?t('Offline — local draft is not synced','離線 — 本機草稿尚未同步'):result.code==='CONFLICT'?t('Conflict. Your input is kept. Load the current version before applying it again.','版本衝突。輸入已保留，請載入目前版本後再套用。'):result.code==='AUTH_REQUIRED'?t('Session ended. Input is kept; sign in again.','登入已失效。輸入已保留，請重新登入。'):t('Not saved. Your input is kept; retry the same action.','未保存。輸入已保留，請重試同一操作。'));
  if(!result.ok&&!storedLocally)setMessage(t('Device draft storage failed. Input is only in this tab; keep it open.','装置草稿保存失敗，輸入僅在此頁，請保持開啟。'));if(!result.ok&&result.code==='AUTH_REQUIRED')invalidateAccountViews(null);setBusy(false);lock.current=false;return result.ok;
 }
 function add(command:TripCommand){const prior=pending.current?.command;if(prior?.type===command.type&&(command.type!=='addStop'||prior.type==='addStop'&&prior.dayId===command.dayId))void apply(prior);else void apply(command)}
 async function create() {
  if(!actorId||!accountValid||!creationReady||lock.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);
  const previous=creation.current;
  let current=previous??{intent:{requestId:crypto.randomUUID(),guideId:returnIntent?.guideId??null,version:returnIntent?sourceVersion:null,flowId:returnIntent?.flowId??(returnIntent?crypto.randomUUID():null),tripId:null},input:{title,timezone,startDate:date||null}};
  const {intent}=current;
  const destination=(tripId:string)=>intent.guideId?afterTripCreation(adoptionPath(locale,intent.guideId,undefined,intent.flowId??undefined,intent.version??undefined),tripId,locale,intent.requestId):href('trips/'+tripId);
  try{
   if(!previous){
    await savePendingCreation(actorId,intent,current.input!);
    if(generation!==epoch.current)return;
    creation.current=current;setCreationState(current);
   }
   let tripId=intent.tripId;
   if(previous&&!tripId){
    const receipt=await trips.creation(intent.requestId,actorId);
    if(generation!==epoch.current)return;
    if(!receipt.ok){setMessage(t('The original creation could not be checked. Its request is kept; retry this check.','未能核對原建立操作，原請求已保留，請重試核對。'));if(receipt.code==='AUTH_REQUIRED')invalidateAccountViews(null);return}
    tripId=receipt.data.tripId;
   }
   if(!tripId){
    if(!current.input){
     if(!intent.inputHash){setMessage(t('The original fields were cleared at sign-out. The result is unconfirmed; keep this receipt and check your trips.','登出時已清除原欄位，結果仍未確認；請保留收據並檢查行程。'));return}
     if(!originalFieldsRequired){
      if(intent.guideId){const source=await guides.get(intent.guideId);if(generation!==epoch.current)return;if(source.ok)setTitle(source.data.title)}
      setOriginalFieldsRequired(true);setMessage(t('Your original fields were cleared at sign-out. Review the original title, date and time zone below, then retry the same request.','登出時已清除原欄位，請核對下方原本的名稱、日期及時區，再重試同一請求。'));return;
     }
     try{
      const restored=await restoreOriginalCreation(actorId,intent.guideId,intent.requestId,{title,timezone,startDate:date||null});
      if(generation!==epoch.current)return;
      current={...current,input:restored};creation.current=current;setCreationState(current);setOriginalFieldsRequired(false);
     }catch(error){
      if(generation!==epoch.current)return;
      if(error instanceof Error&&error.message==='ORIGINAL_INPUT_MISMATCH'){setMessage(t('These fields do not match the original request. Nothing was submitted; check the original title, date and time zone.','欄位與原請求不符，尚未提交；請核對原本的名稱、日期及時區。'));return}throw error;
     }
    }
    const result=await trips.create(current.input!,intent.requestId,actorId);
    if(generation!==epoch.current)return;
    if(!result.ok){setMessage(t('Trip creation is unconfirmed. Retry the original request; its fields are kept.','尚未確認行程建立結果，請重試原請求，原欄位已保留。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null);return}
    tripId=result.data.id;
   }
   await recordCreatedTrip(actorId,intent.guideId,intent.requestId,tripId);
   if(generation!==epoch.current)return;
   const saved={intent:{...intent,tripId},input:null};creation.current=saved;setCreationState(saved);
   requestNavigation(destination(tripId));
  }catch(error){
   if(generation!==epoch.current)return;
   if(error instanceof Error&&error.message==='CACHE_ACCOUNT_CHANGED'){invalidateAccountViews(null);return}
   if(!creation.current&&error instanceof Error&&error.message==='INVALID_CREATION'){setMessage(t('Check the trip title, date and time zone. Nothing was submitted.','請核對行程名稱、日期及時區，尚未提交。'));return}
   setMessage(creation.current?t('Recovery is retained. Reload and check the original creation before starting another.','恢復紀錄已保留，請重新載入並核對原建立操作，才開始另一操作。'):t('Creation recovery could not be saved. Nothing was submitted; reload to retry.','未能保存建立恢復紀錄，尚未提交；請重新載入重試。'));
  }finally{if(generation===epoch.current){setBusy(false);lock.current=false}}
 }
 async function remove() {
  if(!trip||!accountValid||lock.current||!confirm(t('Delete this private trip?','刪除此私人行程？')))return;
  const generation=epoch.current;lock.current=true;setBusy(true);const key='delete:'+trip.id;
  if(pending.current?.key!==key)pending.current={key,requestId:crypto.randomUUID(),revision:trip.revision};
  const result=await trips.remove(trip.id,pending.current.revision,pending.current.requestId,actorId!);
  if(generation!==epoch.current)return;
  if(result.ok){pending.current=null;requestNavigation(href('trips'))}else setMessage(t('Deletion was not confirmed. Reload and retry.','未確認刪除，請重新載入後重試。'));
  setBusy(false);lock.current=false;
 }
 async function loadMore() {
  if(!actorId||!accountValid||!next)return;const generation=epoch.current;const result=await trips.list(next,actorId!);
  if(generation!==epoch.current)return;
  if(result.ok){setList(current=>[...current,...result.data.items]);setNext(result.data.nextCursor)}else setMessage(t('More trips could not be loaded.','未能載入更多行程。'));
 }
 async function retryDraft() {
  if(!trip||!actorId||!accountValid||lock.current)return;const generation=epoch.current;const draft=await readLocalDraft(actorId,trip.id);
  if(generation!==epoch.current||lock.current)return;
  if(!draft){setMessage(t('No pending local draft','沒有待同步草稿'));return}
  pending.current={key:JSON.stringify(draft.command),requestId:draft.requestId,revision:draft.baseRevision,command:draft.command};await apply(draft.command);
 }
 const connected=!!actorId&&accountValid;
 const initialTitle=accountValid&&initialHeading?.actorId===actorId&&initialHeading?.tripId===id?initialHeading.title:null;
 return <div className={connected?"k-page os-trips":"k-page"} data-ready={ready} data-trip-editor={!!id}>{connected?<><Link href={href('trips')}>{t('My trips','我的行程')}</Link><h1>{trip?trip.title:initialTitle??t('Your trips','我的行程')}</h1><p role="status" data-testid="trip-save-state" aria-live="polite">{message}</p>
 <button className="k-btn" disabled={busy} onClick={()=>{reapply.current=conflicted.current;preserveInputs.current=conflicted.current;conflicted.current=false;setRetry(n=>n+1)}}>{t('Load current version','載入目前版本')}</button>
 {!id?<>{returnIntent&&<p>{t('Choose a trip or create one. You will return to the guide to review its days and stops before applying.','選擇或建立行程後，會返回攻略，先核對日期及站點再套用。')}</p>}{creationState&&<p role="status">{creationState.intent.tripId?t('Your empty trip was created. Continue to review the guide; nothing is applied automatically.','你的空白行程已建立，請繼續核對攻略；內容不會自動套用。'):t('An earlier creation is unconfirmed. Retry its original request before starting another.','較早的建立操作未獲確認，請先重試原請求，才開始另一操作。')}</p>}{returnIntent&&<Link href={adoptionPath(locale,returnIntent.guideId,undefined,returnIntent.flowId??undefined,returnIntent.version)}>{t('Back to guide','返回攻略')}</Link>}<form onSubmit={e=>{e.preventDefault();void create()}}><fieldset style={{border:0,padding:0,margin:0,minWidth:0}} disabled={!ready||!creationReady||busy||!!creationState&&!originalFieldsRequired}><label>{t('Trip title','行程標題')}<input disabled={!ready} required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{t('Start date (optional)','開始日期（可選）')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>{t('Time zone','時區')}<input required value={timezone} onChange={e=>setTimezone(e.target.value)}/></label></fieldset><button className="k-btn primary" disabled={busy||!creationReady||!accountValid}>{originalFieldsRequired?t('Confirm original fields and retry','確認原欄位並重試'):creationState?t('Check original trip creation','核對原建立行程操作'):t('Create trip','建立行程')}</button></form>{creationState?.intent.tripId&&!returnIntent&&<button className="k-btn" disabled={busy} onClick={()=>{const generation=epoch.current;void clearPendingCreation(actorId!,null,creationState.intent.requestId).then(()=>{if(generation!==epoch.current)return;creation.current=null;setCreationState(null);setTitle('');setDate('')}).catch(()=>setMessage(t('The creation receipt could not be cleared. Reload to retry.','未能清除建立收據，請重新載入重試。')))}}>{t('Start another trip','另建一個行程')}</button>}<ul>{list.map(item=><li key={item.id}><Link href={afterTripCreation(returnIntent?query.get('next'):null,item.id,locale)}>{item.title}</Link></li>)}</ul>{next&&<button className="k-btn" onClick={()=>void loadMore()}>{t('More trips','更多行程')}</button>}
 </>:trip&&<><button className="k-btn" onClick={()=>exportPrivateTrip(trip)}>{t('Download private trip for offline reading','下載私人行程供離線閱讀')}</button><button className="k-btn" disabled={busy} onClick={()=>void retryDraft()}>{t('Retry local draft with revision check','以版本檢查重試本機草稿')}</button><p>{t('Revision','版本')} {trip.revision} · {trip.timezone}</p><form onSubmit={e=>{e.preventDefault();void apply({type:'patchTrip',patch:{title,startDate:date||null,timezone}})}}><label>{t('Trip title','行程標題')}<input disabled={!ready} required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{t('Start date (optional)','開始日期（可選）')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>{t('Time zone','時區')}<input value={timezone} onChange={e=>setTimezone(e.target.value)}/></label><button className="k-btn primary" disabled={busy}>{t('Save trip details','保存行程資料')}</button></form>
 {trip.days.map(day=><section key={day.id}><h2>{t('Day','第')} {day.offset+1} · {day.title}</h2><DayEditor day={day} busy={busy} save={apply}/><button className="k-btn" disabled={busy} onClick={()=>void apply({type:'removeDay',id:day.id})}>{t('Remove day','移除一天')}</button>{day.stops.map(stop=><StopEditor key={stop.id} stop={stop} dayId={day.id} days={trip.days} busy={busy} edited={()=>setMessage(t("Editing — not yet saved","編輯中 — 尚未保存"))} save={apply} remove={()=>void apply({type:'removeStop',id:stop.id})} move={()=>void apply({type:'moveStop',id:stop.id,dayId:day.id,position:0})}/>)}
 <button className="k-btn" disabled={busy} onClick={()=>add({type:'addStop',id:crypto.randomUUID(),dayId:day.id,position:day.stops.length,input:{title:t('New stop','新站點'),placeId:null,travellerNote:'',startMinuteOfDay:null,durationMinutes:null}})}>{t('Add stop','加入站點')}</button></section>)}
 <button className="k-btn primary" disabled={busy} onClick={()=>add({type:'addDay',id:crypto.randomUUID(),offset:trip.days.length?Math.max(...trip.days.map(d=>d.offset))+1:0,title:t('New day','新一天')})}>{t('Add day','加入一天')}</button>
 <button className="k-btn" disabled={busy} onClick={()=>void remove()}>{t('Delete trip','刪除行程')}</button>
 <TripWarnings trip={trip} save={apply}/><RecordCapture key={actorId+":"+trip.id+":"+mediaEnabled} tripId={trip.id} save={apply} enabled={mediaEnabled}/><div>{trip.media.filter(m=>m.state==='ready').map(m=><img key={m.id} src={'/api/media/'+m.id} alt={t('Private trip photo','私人行程照片')} style={{maxWidth:'100%'}}/>)}</div><SharePreview trip={trip} enabled={sharingEnabled}/></>}
 <PendingAdoptionRecovery key={actorId+':'+(id??'list')} actorId={actorId!} tripId={id}/>
 </>:<><h1>{t('Your trips','我的行程')}</h1>{actorId&&!accountValid&&<p role="status">{message}</p>}<p>{t('Sign in to keep trips in your Kinnso account.','登入以將行程保存至 Kinnso 帳戶。')}</p><Link className="k-btn primary" href={href('sign-in')+'?next='+encodeURIComponent(id?href('trips/'+id):listPath)}>{t('Sign in','登入')}</Link></>}
 {!id&&<div hidden={!!actorId&&!accountValid}><ImportPreview actorId={connected?actorId:null}/></div>}
 </div>
}
