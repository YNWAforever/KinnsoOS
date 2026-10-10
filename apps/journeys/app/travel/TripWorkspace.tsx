'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {trips} from '../../lib/trips/repository';
import type {TripSnapshot,TripCommand,TripStop,TripDay} from '../../lib/contracts/trips';
import {useApp} from './ui';
import {ImportPreview} from './ImportPreview';
import {useDraftNavigation} from './UnsavedDraftGuard';
import {RecordCapture} from './RecordCapture';
import {SharePreview} from './SharePreview';
import {TripWarnings} from './TripWarnings';
import {synchronizeAccountCache,saveLocalSnapshot,readLocalSnapshot,saveLocalDraft,readLocalDraft,clearLocalDraft,subscribeAccountInvalidation,invalidateAccountViews} from '../../lib/trips/local-drafts';
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
 const {t,href,ready}=useApp(),router=useRouter(),[list,setList]=useState<{id:string;title:string}[]>([]),[next,setNext]=useState<string|null>(null),[trip,setTrip]=useState<TripSnapshot|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[title,setTitle]=useState(''),[date,setDate]=useState(''),[timezone,setTimezone]=useState('UTC'),[accountValid,setAccountValid]=useState(true);
 const pending=useRef<{key:string;requestId:string;revision:number;command?:TripCommand}|null>(null),lock=useRef(false),epoch=useRef(0),conflicted=useRef(false),reapply=useRef(false),preserveInputs=useRef(false);
 useEffect(()=>{epoch.current++;setAccountValid(!!actorId);setTrip(null);setList([]);setNext(null);setTitle('');setDate('');pending.current=null;preserveInputs.current=false;conflicted.current=false;reapply.current=false;lock.current=false;setBusy(false);
  const invalidate=(nextOwner:string|null)=>{if(nextOwner===actorId)return;epoch.current++;setAccountValid(false);setTrip(null);setList([]);setNext(null);setTitle('');setDate('');pending.current=null;lock.current=false;setBusy(false);router.refresh()};
  const unsubscribe=subscribeAccountInvalidation(invalidate);
  const check=async()=>{if(document.visibilityState!=='visible'||!navigator.onLine)return;const generation=epoch.current;try{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(generation===epoch.current&&body.data?.id!==actorId)invalidate(body.data?.id??null)}catch{}};
  document.addEventListener('visibilitychange',check);return()=>{epoch.current++;unsubscribe();document.removeEventListener('visibilitychange',check)}
 },[actorId,id,router]);
 useEffect(()=>{setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')},[]);
 useEffect(()=>{if(!actorId)return;let active=true;const generation=epoch.current;setMessage(t('Loading…','載入中…'));const load=(async()=>{await synchronizeAccountCache(actorId).catch(()=>{});return id?await trips.get(id):await trips.list()})();void load.then(async result=>{if(!active||generation!==epoch.current)return;if(!result.ok){if(id&&!navigator.onLine){const cached=await readLocalSnapshot(actorId,id);if(!active||generation!==epoch.current)return;if(cached){setTrip(cached);setTitle(cached.title);setDate(cached.startDate??'');setTimezone(cached.timezone);setMessage(t('Offline — downloaded account copy','離線 — 已下載的帳戶副本'));return}}setMessage(result.code==='NOT_FOUND'?t('Trip not found.','找不到行程。'):result.code==='AUTH_REQUIRED'?t('Sign in to load your trip.','請登入以載入行程。'):t('Connection failed. Your input is kept.','連線失敗，你的輸入已保留。'));return}
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
  const result=await trips.apply(trip.id,intent.revision,intent.requestId,command);
  if(generation!==epoch.current)return false;
  conflicted.current=!result.ok&&result.code==='CONFLICT';
  if(result.ok){setTrip(result.data);void saveLocalSnapshot(actorId!,result.data).catch(()=>{});void clearLocalDraft(actorId!,trip.id,intent.requestId).catch(()=>{});pending.current=null;setMessage(t('Saved to your account','已保存至你的帳戶'))}
  else setMessage(!navigator.onLine?t('Offline — local draft is not synced','離線 — 本機草稿尚未同步'):result.code==='CONFLICT'?t('Conflict. Your input is kept. Load the current version before applying it again.','版本衝突。輸入已保留，請載入目前版本後再套用。'):result.code==='AUTH_REQUIRED'?t('Session ended. Input is kept; sign in again.','登入已失效。輸入已保留，請重新登入。'):t('Not saved. Your input is kept; retry the same action.','未保存。輸入已保留，請重試同一操作。'));
  if(!result.ok&&!storedLocally)setMessage(t('Device draft storage failed. Input is only in this tab; keep it open.','装置草稿保存失敗，輸入僅在此頁，請保持開啟。'));if(!result.ok&&result.code==='AUTH_REQUIRED')invalidateAccountViews(null);setBusy(false);lock.current=false;return result.ok;
 }
 function add(command:TripCommand){const prior=pending.current?.command;if(prior?.type===command.type&&(command.type!=='addStop'||prior.type==='addStop'&&prior.dayId===command.dayId))void apply(prior);else void apply(command)}
 async function create() {
  if(!actorId||!accountValid||lock.current)return;const generation=epoch.current;lock.current=true;setBusy(true);const input={title,timezone,startDate:date||null},key=JSON.stringify(input);
  if(pending.current?.key!==key)pending.current={key,requestId:crypto.randomUUID(),revision:0};
  const result=await trips.create(input,pending.current.requestId);
  if(generation!==epoch.current)return;
  if(result.ok){pending.current=null;requestNavigation(href('trips/'+result.data.id))}else setMessage(t('Trip was not confirmed saved. Input is kept; retry.','未確認行程已保存。輸入已保留，請重試。'));
  setBusy(false);lock.current=false;
 }
 async function remove() {
  if(!trip||!accountValid||lock.current||!confirm(t('Delete this private trip?','刪除此私人行程？')))return;
  const generation=epoch.current;lock.current=true;setBusy(true);const key='delete:'+trip.id;
  if(pending.current?.key!==key)pending.current={key,requestId:crypto.randomUUID(),revision:trip.revision};
  const result=await trips.remove(trip.id,pending.current.revision,pending.current.requestId);
  if(generation!==epoch.current)return;
  if(result.ok){pending.current=null;requestNavigation(href('trips'))}else setMessage(t('Deletion was not confirmed. Reload and retry.','未確認刪除，請重新載入後重試。'));
  setBusy(false);lock.current=false;
 }
 async function loadMore() {
  if(!actorId||!accountValid||!next)return;const generation=epoch.current;const result=await trips.list(next);
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
 {!id?<><form onSubmit={e=>{e.preventDefault();void create()}}><label>{t('Trip title','行程標題')}<input disabled={!ready} required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{t('Start date (optional)','開始日期（可選）')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>{t('Time zone','時區')}<input required value={timezone} onChange={e=>setTimezone(e.target.value)}/></label><button className="k-btn primary" disabled={busy}>{t('Create trip','建立行程')}</button></form><ul>{list.map(item=><li key={item.id}><Link href={href('trips/'+item.id)}>{item.title}</Link></li>)}</ul>{next&&<button className="k-btn" onClick={()=>void loadMore()}>{t('More trips','更多行程')}</button>}
 </>:trip&&<><button className="k-btn" onClick={()=>exportPrivateTrip(trip)}>{t('Download private trip for offline reading','下載私人行程供離線閱讀')}</button><button className="k-btn" disabled={busy} onClick={()=>void retryDraft()}>{t('Retry local draft with revision check','以版本檢查重試本機草稿')}</button><p>{t('Revision','版本')} {trip.revision} · {trip.timezone}</p><form onSubmit={e=>{e.preventDefault();void apply({type:'patchTrip',patch:{title,startDate:date||null,timezone}})}}><label>{t('Trip title','行程標題')}<input disabled={!ready} required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{t('Start date (optional)','開始日期（可選）')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>{t('Time zone','時區')}<input value={timezone} onChange={e=>setTimezone(e.target.value)}/></label><button className="k-btn primary" disabled={busy}>{t('Save trip details','保存行程資料')}</button></form>
 {trip.days.map(day=><section key={day.id}><h2>{t('Day','第')} {day.offset+1} · {day.title}</h2><DayEditor day={day} busy={busy} save={apply}/><button className="k-btn" disabled={busy} onClick={()=>void apply({type:'removeDay',id:day.id})}>{t('Remove day','移除一天')}</button>{day.stops.map(stop=><StopEditor key={stop.id} stop={stop} dayId={day.id} days={trip.days} busy={busy} edited={()=>setMessage(t("Editing — not yet saved","編輯中 — 尚未保存"))} save={apply} remove={()=>void apply({type:'removeStop',id:stop.id})} move={()=>void apply({type:'moveStop',id:stop.id,dayId:day.id,position:0})}/>)}
 <button className="k-btn" disabled={busy} onClick={()=>add({type:'addStop',id:crypto.randomUUID(),dayId:day.id,position:day.stops.length,input:{title:t('New stop','新站點'),placeId:null,travellerNote:'',startMinuteOfDay:null,durationMinutes:null}})}>{t('Add stop','加入站點')}</button></section>)}
 <button className="k-btn primary" disabled={busy} onClick={()=>add({type:'addDay',id:crypto.randomUUID(),offset:trip.days.length?Math.max(...trip.days.map(d=>d.offset))+1:0,title:t('New day','新一天')})}>{t('Add day','加入一天')}</button>
 <button className="k-btn" disabled={busy} onClick={()=>void remove()}>{t('Delete trip','刪除行程')}</button>
 <TripWarnings trip={trip} save={apply}/><RecordCapture key={actorId+":"+trip.id+":"+mediaEnabled} tripId={trip.id} save={apply} enabled={mediaEnabled}/><div>{trip.media.filter(m=>m.state==='ready').map(m=><img key={m.id} src={'/api/media/'+m.id} alt={t('Private trip photo','私人行程照片')} style={{maxWidth:'100%'}}/>)}</div><SharePreview trip={trip} enabled={sharingEnabled}/></>}
 </>:<><h1>{t('Your trips','我的行程')}</h1><p>{t('Sign in to keep trips in your Kinnso account.','登入以將行程保存至 Kinnso 帳戶。')}</p><Link className="k-btn primary" href={href('sign-in')+'?next='+encodeURIComponent(href(id?'trips/'+id:'trips'))}>{t('Sign in','登入')}</Link></>}
 {!id&&<div hidden={!!actorId&&!accountValid}><ImportPreview actorId={connected?actorId:null}/></div>}
 </div>
}
