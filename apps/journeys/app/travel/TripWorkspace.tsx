'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {adoptionPath,parseAdoptionPath,afterTripCreation} from '../../lib/guides/adoption-intent';
import {PendingAdoptionRecovery} from './PendingAdoptionRecovery';
import {TripIndexShareHolds} from './TripIndexShareHolds';
import {trips} from '../../lib/trips/repository';
import {guides} from '../../lib/guides/repository';
import type {TripSnapshot,TripCommand,TripStop,TripDay} from '../../lib/contracts/trips';
import {useApp} from './ui';
import {ImportPreview} from './ImportPreview';
import {useDraftNavigation} from './UnsavedDraftGuard';
import {RecordCapture} from './RecordCapture';
import {SharePreview} from './SharePreview';
import {TripWarnings} from './TripWarnings';
import {TodayItinerary} from './TodayItinerary';
import {synchronizeAccountCache,saveLocalSnapshot,readLocalSnapshot,saveLocalDraft,readLocalDraft,clearLocalDraft,subscribeAccountInvalidation,invalidateAccountViews,readPendingCreation,savePendingCreation,recordCreatedTrip,clearPendingCreation,clearRejectedCreation,restoreOriginalCreation,type PendingCreation,type CreationInput} from '../../lib/trips/local-drafts';
import {exportPrivateTrip} from '../../lib/trips/export';
import {tripScheduleIssue,tripScheduleErrors} from '../../lib/trips/input-validation';

function DayEditor({day,busy,save,edited}:{day:TripDay;busy:boolean;save:(command:TripCommand)=>Promise<boolean>;edited:()=>void}) {
 const {t,ready}=useApp(),[title,setTitle]=useState(day.title),[offset,setOffset]=useState(day.offset);
 return <form onSubmit={event=>{event.preventDefault();void save({type:'updateDay',id:day.id,patch:{title,offset}})}}>
 <label>{t('Day title','當日標題')}<input disabled={!ready} required maxLength={200} value={title} onChange={event=>{setTitle(event.target.value);edited()}}/></label>
 <label>{t('Day offset (first day is 0)','日數偏移（首日為 0）')}<input disabled={!ready} type="number" min={0} max={3650} required value={offset} onChange={event=>{setOffset(Number(event.target.value));edited()}}/></label>
 <button className="k-btn" disabled={busy||!ready}>{t('Save day','保存當日資料')}</button></form>
}
function StopEditor({stop,dayId,days,busy,save,remove,move,edited}:{stop:TripStop;dayId:string;days:TripDay[];busy:boolean;save:(command:TripCommand)=>Promise<boolean>;remove:()=>void;move:()=>void;edited:()=>void}) {
 const {t,ready}=useApp(),[title,setTitle]=useState(stop.title),[note,setNote]=useState(stop.travellerNote),[minute,setMinute]=useState(stop.startMinuteOfDay?.toString()??''),[duration,setDuration]=useState(stop.durationMinutes?.toString()??'');
 const [targetDay,setTargetDay]=useState(dayId),[position,setPosition]=useState(0);
 return <article className="os-guide os-stop"><form onSubmit={e=>{e.preventDefault();void save({type:'updateStop',id:stop.id,patch:{title,travellerNote:note,startMinuteOfDay:minute===''?null:Number(minute),durationMinutes:duration===''?null:Number(duration)}})}}>
 <label>{t('Stop title','站點名稱')}<input disabled={!ready} required maxLength={200} value={title} onChange={e=>{setTitle(e.target.value);edited()}}/></label>
 <label htmlFor={'note-'+stop.id}>{t('Private note','私人筆記')}</label><textarea id={'note-'+stop.id} maxLength={4000} value={note} onChange={e=>{setNote(e.target.value);edited()}}/>
 <label>{t('Start minute of day (0–1439)','當日起始分鐘（0–1439）')}<input type="number" min={0} max={1439} value={minute} onChange={e=>{setMinute(e.target.value);edited()}}/></label>
 <label>{t('Duration in minutes','停留分鐘')}<input type="number" min={1} max={1440} value={duration} onChange={e=>{setDuration(e.target.value);edited()}}/></label>
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
export function TripWorkspace({id,actorId,initialHeading=null,mediaEnabled=false,sharingEnabled=false,shareRecoveryEnabled=false}:{id?:string;actorId:string|null;initialHeading?:import('../../lib/trips/private-heading').PrivateTripHeading|null;mediaEnabled?:boolean;sharingEnabled?:boolean;shareRecoveryEnabled?:boolean}) {
 const requestNavigation=useDraftNavigation();
 const {t,href,ready,locale}=useApp(),router=useRouter(),query=useSearchParams(),[list,setList]=useState<{id:string;title:string;fromGuide?:string|null;receiptHref?:string}[]>([]),[next,setNext]=useState<string|null>(null),[trip,setTrip]=useState<TripSnapshot|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[title,setTitle]=useState(''),[date,setDate]=useState(''),[timezone,setTimezone]=useState('UTC'),[accountValid,setAccountValid]=useState(true),[formGeneration,setFormGeneration]=useState(0);
 const returnIntent=!id&&query.getAll('next').length===1?parseAdoptionPath(query.get('next'),locale):null;
 const listPath=href('trips')+(returnIntent?'?next='+encodeURIComponent(adoptionPath(locale,returnIntent.guideId,undefined,returnIntent.flowId??undefined,returnIntent.version,returnIntent.creationId)):'');
 const creation=useRef<{intent:PendingCreation;input:CreationInput|null;editGeneration?:number;fromGuide?:string|null}|null>(null),[creationState,setCreationState]=useState<typeof creation.current>(null),[creationReady,setCreationReady]=useState(false),[sourceVersion,setSourceVersion]=useState<number|null>(null),[originalFieldsRequired,setOriginalFieldsRequired]=useState(false);
 const pending=useRef<{key:string;requestId:string;revision:number;command?:TripCommand;input?:Pick<TripSnapshot,'title'|'timezone'|'startDate'>;fromGuide?:string|null;editGeneration?:number;terminal?:boolean}|null>(null),lock=useRef(false),epoch=useRef(0),conflicted=useRef(false),reapply=useRef(false),preserveInputs=useRef(false);
 const candidate=query?.get('fromGuide'),validGuide=candidate&&query?.getAll('fromGuide').length===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)?candidate:null;
 const [origin,setOrigin]=useState<{actorId:string;id:string}|null>(actorId&&validGuide?{actorId,id:validGuide}:null);
 const originActor=useRef(actorId),readVersion=useRef(0),editGeneration=useRef(0),dirtyEdits=useRef(new Map<string,number>()),recoveryReadFailed=useRef(false);
 const originId=origin?.actorId===actorId?origin.id:null;
 function edited(key='trip'){editGeneration.current++;dirtyEdits.current.set(key,editGeneration.current);setMessage(t('Editing — not yet saved','編輯中 — 尚未保存'));}
 function recoveryFailed(){recoveryReadFailed.current=true;setMessage(t('Local draft could not be read. Your input and pending action are kept; retry recovery.','未能讀取本機草稿，輸入及待處理操作已保留，請重試復原。'));}
 useEffect(()=>{if(originActor.current!==actorId){originActor.current=actorId;setOrigin(null);if(query?.has('fromGuide'))router.replace(href(id?'trips/'+id:'trips'));}editGeneration.current=0;dirtyEdits.current.clear();recoveryReadFailed.current=false;readVersion.current++;creation.current=null;setCreationState(null);setCreationReady(false);setSourceVersion(null);setOriginalFieldsRequired(false);setFormGeneration(0);epoch.current++;setAccountValid(!!actorId);setTrip(null);setList([]);setNext(null);setTitle('');setDate('');pending.current=null;preserveInputs.current=false;conflicted.current=false;reapply.current=false;lock.current=false;setBusy(false);
  const invalidate=(nextOwner:string|null)=>{if(nextOwner===actorId)return;epoch.current++;readVersion.current++;creation.current=null;setCreationState(null);setCreationReady(false);setSourceVersion(null);setOriginalFieldsRequired(false);setMessage(t('Account changed. Sign in again to review your original action.','帳戶已變更，請重新登入並核對原操作。'));setOrigin(null);if(query?.has('fromGuide'))router.replace(href(id?'trips/'+id:'trips'));setAccountValid(false);setTrip(null);setList([]);setNext(null);setTitle('');setDate('');pending.current=null;lock.current=false;setBusy(false);router.refresh()};
  const unsubscribe=subscribeAccountInvalidation(invalidate);
  const check=async()=>{if(document.visibilityState!=='visible'||!navigator.onLine)return;const generation=epoch.current;try{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(generation===epoch.current&&body.data?.id!==actorId)invalidate(body.data?.id??null)}catch{/* Foreground requests still verify the current account. */}};
  document.addEventListener('visibilitychange',check);return()=>{epoch.current++;unsubscribe();document.removeEventListener('visibilitychange',check)}
 },[actorId,id,router,returnIntent?.guideId,returnIntent?.version]);
 useEffect(()=>{
  if(id||!actorId)return;let active=true;const generation=epoch.current,inputVersion=editGeneration.current;
  creation.current=null;setCreationState(null);setCreationReady(false);setSourceVersion(null);setOriginalFieldsRequired(false);
  void (async()=>{try{
   await synchronizeAccountCache(actorId);
   if(!active||generation!==epoch.current)return;
   const stored=await readPendingCreation(actorId,returnIntent?.guideId??null);
   if(!active||generation!==epoch.current)return;
   const recovered=stored?{...stored,editGeneration:editGeneration.current===inputVersion?inputVersion:undefined}:null;
   creation.current=recovered;setCreationState(recovered);
   if(stored?.input&&editGeneration.current===inputVersion){setTitle(stored.input.title);setDate(stored.input.startDate??'');setTimezone(stored.input.timezone)}
   if(returnIntent&&!stored){
    const source=await guides.get(returnIntent.guideId);
    if(!active||generation!==epoch.current)return;
    if(!source.ok||source.data.kind!=='itinerary'){setMessage(t('This guide has no available structured itinerary. Return to the guide; no trip was created.','此攻略未有可用的結構化行程，請返回攻略；尚未建立行程。'));return}
    if(returnIntent.version!==undefined&&source.data.version!==returnIntent.version){setMessage(t('The source version changed. Return to the guide and review it before creating a trip.','來源版本已有變更，請返回攻略重新核對後再建立行程。'));return}
    if(editGeneration.current===inputVersion)setTitle(source.data.title);setSourceVersion(source.data.version);
   }
   if(active&&generation===epoch.current)setCreationReady(true);
  }catch{if(active&&generation===epoch.current)setMessage(t('Creation recovery could not be loaded. Reload before creating a trip.','未能載入建立行程恢復資料，請重新載入後再建立。'))}})();
  return()=>{active=false};
 },[actorId,id,returnIntent?.guideId,returnIntent?.version]);
 useEffect(()=>{setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')},[]);
 useEffect(()=>{if(!actorId)return;let active=true;const generation=epoch.current,version=++readVersion.current;setMessage(t('Loading…','載入中…'));const load=(async()=>{await synchronizeAccountCache(actorId).catch(()=>{});return id?await trips.get(id,actorId):await trips.list(undefined,actorId)})();void load.then(async result=>{if(!active||generation!==epoch.current||version!==readVersion.current)return;if(!result.ok){if(id&&!navigator.onLine){const cached=await readLocalSnapshot(actorId,id);if(!active||generation!==epoch.current||version!==readVersion.current)return;if(cached){setTrip(cached);if(!preserveInputs.current&&!dirtyEdits.current.has('trip')){setTitle(cached.title);setDate(cached.startDate??'');setTimezone(cached.timezone)}setMessage(t('Offline — downloaded account copy','離線 — 已下載的帳戶副本'));return}}setMessage(result.code==='NOT_FOUND'?t('Trip not found.','找不到行程。'):result.code==='AUTH_REQUIRED'?t('Sign in to load your trip.','請登入以載入行程。'):t('Connection failed. Your input is kept.','連線失敗，你的輸入已保留。'));return}
 if(id){const data=result.data as TripSnapshot;setTrip(data);void saveLocalSnapshot(actorId,data).catch(()=>{});if(!preserveInputs.current&&!dirtyEdits.current.has('trip')){setTitle(data.title);setDate(data.startDate??'');setTimezone(data.timezone)}preserveInputs.current=false;if(conflicted.current){reapply.current=true;conflicted.current=false}}else{const data=result.data as {items:{id:string;title:string}[];nextCursor:string|null};setList(data.items);setNext(data.nextCursor)}setMessage('')});return()=>{active=false}},[id,actorId,retry]);
 async function apply(command:TripCommand) {
  if(!trip||!accountValid||lock.current)return false;
  const generation=epoch.current,key=JSON.stringify(command);lock.current=true;setBusy(true);
  let stored:Awaited<ReturnType<typeof readLocalDraft>>;
  try{stored=await readLocalDraft(actorId!,trip.id);}catch{if(generation===epoch.current){recoveryFailed();setBusy(false);lock.current=false;}return false;}
  if(generation!==epoch.current)return false;
  recoveryReadFailed.current=false;
  const sameTarget=stored?.command.type===command.type&&('id' in command&&'id' in stored.command?command.id===stored.command.id:command.type==='patchTrip'||JSON.stringify(stored.command)===key);
  const replaceDraft=!!stored&&(reapply.current||pending.current?.terminal===true)&&sameTarget;
  if(conflicted.current&&!reapply.current){setMessage(t('Load the current version before applying a conflicting edit again. Your input is kept.','請先載入目前版本，再套用衝突編輯，輸入已保留。'));setBusy(false);lock.current=false;return false;}
  if(pending.current&&!pending.current.command||pending.current?.command&&pending.current.key!==key&&!reapply.current&&!pending.current.terminal){
   setMessage(t('Another pending edit must be retried or reviewed first. New input stays in this tab.','請先重試或核對待同步編輯，新輸入會保留在此頁。'));setBusy(false);lock.current=false;return false;
  }
  if(stored&&!replaceDraft){
   if(JSON.stringify(stored.command)!==key){setMessage(t('Another pending edit must be retried or reviewed first. New input stays in this tab.','請先重試或核對待同步編輯，新輸入會保留在此頁。'));setBusy(false);lock.current=false;return false;}
   pending.current={key,requestId:stored.requestId,revision:stored.baseRevision,command:stored.command,editGeneration:pending.current?.requestId===stored.requestId?pending.current.editGeneration:undefined};
  }else if(pending.current?.key!==key||replaceDraft||pending.current?.terminal)pending.current={key,requestId:crypto.randomUUID(),revision:trip.revision,command,editGeneration:editGeneration.current};
  const intent=pending.current!;
  if(intent.command?.type==='patchTrip'){
   const issue=tripScheduleIssue(intent.command.patch.timezone??trip.timezone,intent.command.patch.startDate===undefined?trip.startDate:intent.command.patch.startDate);
   if(issue){intent.terminal=true;setMessage(t(...tripScheduleErrors[issue]));setBusy(false);lock.current=false;return false;}
  }
  try{await saveLocalDraft(actorId!,trip.id,intent.revision,intent.command!,intent.requestId,replaceDraft);}
  catch{if(generation===epoch.current){setMessage(t('Device draft could not be stored. Input is kept; retry the same action.','未能保存裝置草稿，輸入已保留，請重試同一操作。'));setBusy(false);lock.current=false;}return false;}
  if(generation!==epoch.current)return false;
  reapply.current=false;setMessage(t('Saving…','保存中…'));
  const result=await trips.apply(trip.id,intent.revision,intent.requestId,intent.command!,actorId!);
  if(generation!==epoch.current)return false;
  conflicted.current=!result.ok&&result.code==='CONFLICT';
  if(result.ok){
   readVersion.current++;setTrip(result.data);void saveLocalSnapshot(actorId!,result.data).catch(()=>{});void clearLocalDraft(actorId!,trip.id,intent.requestId).catch(()=>{});pending.current=null;
   const savedCommand=intent.command!,savedKey=savedCommand.type==='patchTrip'?'trip':savedCommand.type==='updateDay'?'day:'+savedCommand.id:savedCommand.type==='updateStop'?'stop:'+savedCommand.id:null;
   if(savedKey&&(dirtyEdits.current.get(savedKey)??Infinity)<=(intent.editGeneration??-1))dirtyEdits.current.delete(savedKey);
   setMessage(!dirtyEdits.current.size?t('Saved to your account','已保存至你的帳戶'):t('Earlier edits saved; other changes are not yet saved.','部分修改已保存，仍有修改尚未保存。'));
   void trips.get(trip.id,actorId!);
  }else{
   intent.terminal=result.code==='INVALID'&&!result.retryable;
   setMessage(result.code==='INVALID'?t('Check the trip details, date and time zone. The edit was rejected; your input is kept.','請檢查行程資料、日期及時區。編輯未獲接納，輸入已保留。'):!navigator.onLine?t('Offline — local draft is not synced','離線 — 本機草稿尚未同步'):result.code==='CONFLICT'?t('Conflict. Your input is kept. Load the current version before applying it again.','版本衝突，輸入已保留，請載入目前版本後再套用。'):result.code==='AUTH_REQUIRED'?t('Session ended. Input is kept; sign in again.','登入已失效，輸入已保留，請重新登入。'):t('Not saved. Your input is kept; retry the same action.','未保存，輸入已保留，請重試同一操作。'));
   if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null);
  }
  setBusy(false);lock.current=false;return result.ok;
 }
 function add(command:TripCommand){const prior=pending.current?.command;if(prior?.type===command.type&&(command.type!=='addStop'||prior.type==='addStop'&&prior.dayId===command.dayId))void apply(prior);else void apply(command)}
 async function create() {
  if(!actorId||!accountValid||!creationReady||lock.current||pending.current)return;
  const generation=epoch.current,previous=creation.current;
  const input={title,timezone,startDate:date||null};
  if(!previous){const issue=tripScheduleIssue(input.timezone,input.startDate);if(issue){setMessage(t(...tripScheduleErrors[issue]));return}}
  lock.current=true;setBusy(true);
  let current:NonNullable<typeof creation.current>=previous??{intent:{requestId:crypto.randomUUID(),guideId:returnIntent?.guideId??null,version:returnIntent?sourceVersion:null,flowId:returnIntent?.flowId??(returnIntent?crypto.randomUUID():null),tripId:null},input,editGeneration:editGeneration.current,fromGuide:originId};
  const {intent}=current;
  const destination=(tripId:string)=>intent.guideId?afterTripCreation(adoptionPath(locale,intent.guideId,undefined,intent.flowId??undefined,intent.version??undefined),tripId,locale,intent.requestId):href('trips/'+tripId)+(current.fromGuide?'?fromGuide='+encodeURIComponent(current.fromGuide):'');
  let confirmedTitle=current.input?.title??t('Open confirmed trip','開啟已確認的行程');
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
      if(intent.guideId){const inputVersion=editGeneration.current,source=await guides.get(intent.guideId);if(generation!==epoch.current)return;if(source.ok&&inputVersion===editGeneration.current&&!dirtyEdits.current.has('trip'))setTitle(source.data.title)}
      setOriginalFieldsRequired(true);setMessage(t('Your original fields were cleared at sign-out. Review the original title, date and time zone below, then retry the same request.','登出時已清除原欄位，請核對下方原本的名稱、日期及時區，再重試同一請求。'));return;
     }
     const issue=tripScheduleIssue(input.timezone,input.startDate);if(issue){setMessage(t(...tripScheduleErrors[issue]));return}
     try{
      const inputVersion=editGeneration.current,restored=await restoreOriginalCreation(actorId,intent.guideId,intent.requestId,input);
      if(generation!==epoch.current)return;
      current={...current,input:restored,editGeneration:inputVersion};creation.current=current;setCreationState(current);setOriginalFieldsRequired(false);confirmedTitle=restored.title;
     }catch(error){
      if(generation!==epoch.current)return;
      if(error instanceof Error&&error.message==='ORIGINAL_INPUT_MISMATCH'){setMessage(t('These fields do not match the original request. Nothing was submitted; check the original title, date and time zone.','欄位與原請求不符，尚未提交；請核對原本的名稱、日期及時區。'));return}throw error;
     }
    }
    const result=await trips.create(current.input!,intent.requestId,actorId);
    if(generation!==epoch.current)return;
    if(!result.ok){
     if(!previous&&result.code==='INVALID'&&!result.retryable){
      await clearRejectedCreation(actorId,intent.guideId,intent.requestId,current.input!);
      if(generation!==epoch.current)return;
      creation.current=null;setCreationState(null);
      setMessage(t('Check the trip details, date and time zone. Creation was rejected; your input is kept for correction.','請檢查行程資料、日期及時區。建立未獲接納，輸入已保留，可修正後再提交。'));
     }else setMessage(t('Trip creation is unconfirmed. Retry the original request; its fields are kept.','尚未確認行程建立結果，請重試原請求，原欄位已保留。'));
     if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null);return;
    }
    tripId=result.data.id;confirmedTitle=result.data.title;
   }
   await recordCreatedTrip(actorId,intent.guideId,intent.requestId,tripId);
   if(generation!==epoch.current)return;
   const saved={...current,intent:{...intent,tripId},input:null};creation.current=saved;setCreationState(saved);
   readVersion.current++;
   const receiptHref=destination(tripId);
   setList(items=>[{id:tripId,title:confirmedTitle,fromGuide:current.fromGuide,receiptHref},...items.filter(item=>item.id!==tripId)]);
   if(editGeneration.current===current.editGeneration){dirtyEdits.current.delete('trip');requestNavigation(receiptHref)}
   else setMessage(t('Trip created. Newer inputs are not saved. Open the confirmed trip below, or keep editing to create another trip.','行程已建立，較新輸入尚未保存。可在下方開啟已確認的行程，或繼續編輯以建立另一行程。'));
  }catch(error){
   if(generation!==epoch.current)return;
   if(error instanceof Error&&error.message==='CACHE_ACCOUNT_CHANGED'){invalidateAccountViews(null);return}
   if(!creation.current&&error instanceof Error&&error.message==='INVALID_CREATION'){setMessage(t('Check the trip title, date and time zone. Nothing was submitted.','請核對行程名稱、日期及時區，尚未提交。'));return}
   setMessage(creation.current?t('Recovery is retained. Reload and check the original creation before starting another.','恢復紀錄已保留，請重新載入並核對原建立操作，才開始另一操作。'):t('Creation recovery could not be saved. Nothing was submitted; reload to retry.','未能保存建立恢復紀錄，尚未提交；請重新載入重試。'));
  }finally{if(generation===epoch.current){setBusy(false);lock.current=false}}
 }
 async function remove() {
  if(recoveryReadFailed.current||pending.current&&pending.current.key!=='delete:'+trip?.id){setMessage(t('Recover or retry the pending edit before deleting. Your input is kept.','刪除前請先復原或重試待處理編輯，輸入已保留。'));return;}
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
  if(!trip||!actorId||!accountValid||lock.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);
  let draft:Awaited<ReturnType<typeof readLocalDraft>>;
  try{draft=await readLocalDraft(actorId,trip.id);}catch{if(generation===epoch.current){recoveryFailed();setBusy(false);lock.current=false;}return;}
  if(generation!==epoch.current)return;
  recoveryReadFailed.current=false;lock.current=false;setBusy(false);
  if(!draft){if(pending.current?.command){await apply(pending.current.command);return;}setMessage(t('No pending local draft','沒有待同步草稿'));return;}
  const prior=pending.current;
  pending.current={key:JSON.stringify(draft.command),requestId:draft.requestId,revision:draft.baseRevision,command:draft.command,editGeneration:prior?.requestId===draft.requestId?prior.editGeneration:undefined,terminal:prior?.requestId===draft.requestId?prior.terminal:false};
  await apply(draft.command);
 }
 async function discardLocalDraft() {
  if(!trip||!actorId||!accountValid||lock.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);
  try{
   const latest=await trips.get(trip.id,actorId);
   if(generation!==epoch.current)return;
   if(!latest.ok){setMessage(t('The current saved version could not be loaded. The local draft is kept.','未能載入目前保存版本，本機草稿已保留。'));if(latest.code==='AUTH_REQUIRED')invalidateAccountViews(null);return}
   const draft=await readLocalDraft(actorId,trip.id);
   if(generation!==epoch.current)return;
   if(draft)await clearLocalDraft(actorId,trip.id,draft.requestId);
   if(generation!==epoch.current)return;
   readVersion.current++;pending.current=null;conflicted.current=false;reapply.current=false;preserveInputs.current=false;recoveryReadFailed.current=false;dirtyEdits.current.clear();editGeneration.current++;
   setTrip(latest.data);void saveLocalSnapshot(actorId,latest.data).catch(()=>{});
   setTitle(latest.data.title);setDate(latest.data.startDate??'');setTimezone(latest.data.timezone);
   setFormGeneration(value=>value+1);
   setMessage(t('Local draft discarded. Current saved version loaded; nothing was merged.','本機草稿已捨棄，已載入目前保存版本，沒有合併任何修改。'));
  }catch{
   if(generation===epoch.current)setMessage(t('The local draft could not be discarded. Keep this page open and retry.','未能捨棄本機草稿，請保持此頁開啟並重試。'));
  }finally{if(generation===epoch.current){setBusy(false);lock.current=false}}
 }
 const connected=!!actorId&&accountValid;
 const initialTitle=accountValid&&initialHeading?.actorId===actorId&&initialHeading?.tripId===id?initialHeading.title:null;
 return <div className={connected?"k-page os-trips":"k-page"} data-ready={ready} data-trip-editor={!!id}>{connected?<><Link href={href('trips')}>{t('My trips','我的行程')}</Link><h1>{trip?trip.title:initialTitle??t('Your trips','我的行程')}</h1><p role="status" data-testid="trip-save-state" aria-live="polite">{message}</p>{originId&&<Link className="k-btn" href={href('g/'+originId)}>{t('Return to source guide','返回來源攻略')}</Link>}
 <button className="k-btn" disabled={busy} onClick={()=>{reapply.current=false;preserveInputs.current=conflicted.current;setRetry(n=>n+1)}}>{t('Load current version','載入目前版本')}</button>
   {(conflicted.current||reapply.current)&&<section data-testid="conflict-recovery" role="alert"><p>{t('The original request and input are kept. Load the current version before explicitly reapplying an edit, or discard the local draft.','原請求及輸入已保留；請先載入目前版本，再明確重新套用編輯，或捨棄本機草稿。')}</p><button className="k-btn" disabled={busy} onClick={()=>void discardLocalDraft()}>{t('Discard local draft and use current version','捨棄本機草稿並使用目前版本')}</button></section>}
  {!id?<>{returnIntent&&<p>{t('Choose a trip or create one. You will return to the guide to review its days and stops before applying.','選擇或建立行程後，會返回攻略，先核對日期及站點再套用。')}</p>}{creationState&&<p role="status">{creationState.intent.tripId?t('Your empty trip was created. Continue to review the guide; nothing is applied automatically.','你的空白行程已建立，請繼續核對攻略；內容不會自動套用。'):t('An earlier creation is unconfirmed. Retry its original request before starting another.','較早的建立操作未獲確認，請先重試原請求，才開始另一操作。')}</p>}{returnIntent&&<Link href={adoptionPath(locale,returnIntent.guideId,undefined,returnIntent.flowId??undefined,returnIntent.version)}>{t('Back to guide','返回攻略')}</Link>}<form onSubmit={e=>{e.preventDefault();void create()}}><label>{t('Trip title','行程標題')}<input disabled={!ready} required maxLength={200} value={title} onChange={e=>{setTitle(e.target.value);edited()}}/></label><label>{t('Start date (optional)','開始日期（可選）')}<input type="date" value={date} onChange={e=>{setDate(e.target.value);edited()}}/></label><label>{t('Time zone','時區')}<input required value={timezone} onChange={e=>{setTimezone(e.target.value);edited()}}/></label><button className="k-btn primary" disabled={busy||!creationReady||!accountValid}>{originalFieldsRequired?t('Confirm original fields and retry','確認原欄位並重試'):creationState?t('Check original trip creation','核對原建立行程操作'):t('Create trip','建立行程')}</button></form>{creationState?.intent.tripId&&!returnIntent&&<button className="k-btn" disabled={busy} onClick={()=>{if(lock.current)return;const generation=epoch.current;lock.current=true;setBusy(true);void clearPendingCreation(actorId!,creationState.intent.guideId,creationState.intent.requestId).then(()=>{if(generation!==epoch.current)return;creation.current=null;setCreationState(null);setMessage(t('Previous creation confirmed. Your current input is kept for a new trip.','原建立操作已確認，現有輸入已保留，可用作新行程。'))}).catch(()=>{if(generation===epoch.current)setMessage(t('The creation receipt could not be cleared. Reload to retry.','未能清除建立收據，請重新載入重試。'))}).finally(()=>{if(generation===epoch.current){lock.current=false;setBusy(false)}})}}>{t('Start another trip','另建一個行程')}</button>}<PendingAdoptionRecovery key={actorId+':list'} actorId={actorId!}/><TripIndexShareHolds key={actorId+':shares'} actorId={actorId!} trips={list} sharingEnabled={sharingEnabled}/><ul>{list.map(item=><li key={item.id}><Link href={item.receiptHref??(returnIntent?afterTripCreation(query.get('next'),item.id,locale):href('trips/'+item.id)+(item.fromGuide?'?fromGuide='+encodeURIComponent(item.fromGuide):''))}>{item.title}</Link></li>)}</ul>{next&&<button className="k-btn" onClick={()=>void loadMore()}>{t('More trips','更多行程')}</button>}
 </>:trip&&<><TodayItinerary key={actorId+':'+trip.id} trip={trip} actorId={actorId!}/><button className="k-btn" onClick={()=>exportPrivateTrip(trip)}>{t('Download private trip for offline reading','下載私人行程供離線閱讀')}</button><button className="k-btn" disabled={busy} onClick={()=>void retryDraft()}>{t('Retry local draft with revision check','以版本檢查重試本機草稿')}</button><p>{t('Revision','版本')} {trip.revision} · {trip.timezone}</p><form onSubmit={e=>{e.preventDefault();void apply({type:'patchTrip',patch:{title,startDate:date||null,timezone}})}}><label>{t('Trip title','行程標題')}<input disabled={!ready} required maxLength={200} value={title} onChange={e=>{setTitle(e.target.value);edited()}}/></label><label>{t('Start date (optional)','開始日期（可選）')}<input type="date" value={date} onChange={e=>{setDate(e.target.value);edited()}}/></label><label>{t('Time zone','時區')}<input value={timezone} onChange={e=>{setTimezone(e.target.value);edited()}}/></label><button className="k-btn primary" disabled={busy}>{t('Save trip details','保存行程資料')}</button></form>
 {trip.days.map(day=><section key={day.id}><h2>{t('Day','第')} {day.offset+1} · {day.title}</h2><DayEditor key={day.id+':'+formGeneration} day={day} busy={busy} save={apply} edited={()=>edited('day:'+day.id)}/><button className="k-btn" disabled={busy} onClick={()=>void apply({type:'removeDay',id:day.id})}>{t('Remove day','移除一天')}</button>{day.stops.map(stop=><StopEditor key={stop.id+':'+formGeneration} stop={stop} dayId={day.id} days={trip.days} busy={busy} edited={()=>edited('stop:'+stop.id)} save={apply} remove={()=>void apply({type:'removeStop',id:stop.id})} move={()=>void apply({type:'moveStop',id:stop.id,dayId:day.id,position:0})}/>)}
 <button className="k-btn" disabled={busy} onClick={()=>add({type:'addStop',id:crypto.randomUUID(),dayId:day.id,position:day.stops.length,input:{title:t('New stop','新站點'),placeId:null,travellerNote:'',startMinuteOfDay:null,durationMinutes:null}})}>{t('Add stop','加入站點')}</button></section>)}
 <button className="k-btn primary" disabled={busy} onClick={()=>add({type:'addDay',id:crypto.randomUUID(),offset:trip.days.length?Math.max(...trip.days.map(d=>d.offset))+1:0,title:t('New day','新一天')})}>{t('Add day','加入一天')}</button>
 <button className="k-btn" disabled={busy} onClick={()=>void remove()}>{t('Delete trip','刪除行程')}</button>
 <TripWarnings trip={trip} save={apply}/><RecordCapture key={actorId+":"+trip.id+":"+mediaEnabled} tripId={trip.id} save={apply} enabled={mediaEnabled}/><div>{trip.media.filter(m=>m.state==='ready').map(m=><img key={m.id} src={'/api/media/'+m.id} alt={t('Private trip photo','私人行程照片')} style={{maxWidth:'100%'}}/>)}</div><SharePreview trip={trip} enabled={sharingEnabled} recoveryEnabled={shareRecoveryEnabled}/></>}
   {id&&<PendingAdoptionRecovery key={actorId+':'+id} actorId={actorId!} tripId={id}/>}
  </>:<><h1>{t('Your trips','我的行程')}</h1>{actorId&&!accountValid&&<p role="status">{message}</p>}<p>{t('Sign in to keep trips in your Kinnso account.','登入以將行程保存至 Kinnso 帳戶。')}</p><Link className="k-btn primary" href={href('sign-in')+'?next='+encodeURIComponent(id?href('trips/'+id):listPath)}>{t('Sign in','登入')}</Link></>}
 {!id&&<div hidden={!!actorId&&!accountValid}><ImportPreview actorId={connected?actorId:null}/></div>}
 </div>
}
