'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useApp,Modal} from '../travel/ui';
import {GuestPlanner} from '../travel/GuestPlanner';
import {useUnsavedDraftGuard} from '../travel/UnsavedDraftGuard';
import {readGuestTrips,saveGuestTrip,type GuestTrip} from '../../lib/trips/guest-drafts';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {prepareManualTripDraft} from '../../lib/studio/manual-trip';
import {sameValue} from '../../lib/studio/contracts';

type Props={actorId:string|null;initialNote:string};
type FormDay={key:string;title:string;stops:string};
const errors:Record<string,readonly[string,string]>={
 TITLE:['Enter a trip title of up to 200 characters.','請填寫二百字以內的行程標題。'],
 DAY_TITLE:['Enter a day title of up to 200 characters.','請填寫二百字以內的當日標題。'],
 DATE:['Choose a valid calendar date.','請選擇有效的日期。'],
 TIMEZONE:['Choose a valid time zone, such as Asia/Hong_Kong.','請填寫有效時區，例如 Asia/Hong_Kong。'],
 DAYS:['Use one to thirty days.','請安排一至三十天行程。'],
 STOPS:['Enter one to twenty stops per day, each up to 200 characters.','每天請填寫一至二十個站點，每個不超過二百字。'],
 TOTAL_STOPS:['Keep the itinerary within 200 stops in total.','整份行程最多可有二百個站點。'],
 NOTE:['Keep the trip note within 4,000 characters. Your full text is still here.','行程筆記上限為四千字，完整原文仍保留於此。'],
};

export function TripDraftHandoff(props:Props){
 return <AccountTripDraftHandoff key={props.actorId??'guest'} {...props}/>;
}
function AccountTripDraftHandoff({actorId,initialNote}:Props){
 const {t,href}=useApp(),[saved,setSaved]=useState<GuestTrip|null>(null),[valid,setValid]=useState(true);
 useEffect(()=>subscribeAccountInvalidation(next=>{if(next!==actorId){setSaved(null);setValid(false);}}),[actorId]);
 if(!valid)return <p role="alert">{t('Your account changed. Start a new task.','帳戶已變更，請重新開始任務。')}</p>;
 return <section className="cs-card cs-trip-handoff">
  <h1>{t('Plan my trip','規劃我的行程')}</h1>
  {saved?<GuestPlanner initialDraft={saved} actorId={actorId} onSaved={setSaved} onDeleted={()=>setSaved(null)}/>:<TripDraftForm actorId={actorId} initialNote={initialNote} onSaved={setSaved}/>}
  <div className="cs-actions"><Link className="k-btn" href={href('trips')}>{t('View saved device trips','查看已保存的裝置行程')}</Link></div>
 </section>;
}

function TripDraftForm({actorId,initialNote,onSaved}:Props&{onSaved:(trip:GuestTrip)=>void}){
 const {t}=useApp();
 const [identity]=useState(()=>({id:crypto.randomUUID(),ownerId:'guest-'+crypto.randomUUID()}));
 const [title,setTitle]=useState(''),[timezone,setTimezone]=useState('UTC'),[date,setDate]=useState(''),[note,setNote]=useState(initialNote);
 const [days,setDays]=useState<FormDay[]>(()=>[{key:crypto.randomUUID(),title:t('Day 1','第 1 天'),stops:''}]);
 const [removeKey,setRemoveKey]=useState<string|null>(null);
 const [preview,setPreview]=useState<GuestTrip|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[edited,setEdited]=useState(false);
 const controller=useRef<AbortController|null>(null),locked=useRef(false);
 useEffect(()=>{setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');},[]);
 useEffect(()=>{
  const off=subscribeAccountInvalidation(next=>{if(next!==actorId)controller.current?.abort();});
  return()=>{controller.current?.abort();off();};
 },[actorId]);
 function change(){setEdited(true);setPreview(null);setConfirmed(false);setError('');}
 function editDay(key:string,field:'title'|'stops',value:string){
  if(locked.current)return;
  setDays(current=>current.map(day=>day.key===key?{...day,[field]:value}:day));change();
 }
 function addDay(){
  if(locked.current||days.length>=30)return;
  const key=crypto.randomUUID();
  setDays(current=>current.length>=30?current:[...current,{key,title:t(`Day ${current.length+1}`,`第 ${current.length+1} 天`),stops:''}]);change();
 }
 function moveDay(key:string,direction:-1|1){
  if(locked.current)return;
  setDays(current=>{
   const from=current.findIndex(day=>day.key===key),to=from+direction;
   if(from<0||to<0||to>=current.length)return current;
   const next=[...current];[next[from],next[to]]=[next[to],next[from]];return next;
  });change();
 }
 function removeDay(){
  if(locked.current||days.length<2||!removeKey)return;
  setDays(current=>current.length<2?current:current.filter(day=>day.key!==removeKey));setRemoveKey(null);change();
 }
 function review(){
  if(locked.current)return;
  setError('');setConfirmed(false);setPreview(null);
  try{setPreview(prepareManualTripDraft({title,timezone,startDate:date,days:days.map(day=>({title:day.title,stops:day.stops.split('\n').map(value=>value.trim()).filter(Boolean)})),note},identity));}
  catch(error){const key=error instanceof Error?error.message:'';const message=errors[key];setError(message?t(...message):t('Check the itinerary details. Your input is kept.','請核對行程資料，你的輸入已保留。'));}
 }
 async function save():Promise<boolean>{
  if(locked.current)return false;
  if(!preview||!confirmed){setError(t('Review the itinerary and confirm device storage before saving.','請先核對行程並確認保存至此裝置。'));return false;}
  const request=new AbortController();controller.current=request;locked.current=true;setBusy(true);setError('');
  const active=()=>!request.signal.aborted&&controller.current===request;
  try{
   await saveGuestTrip(preview,request.signal);
   if(!active())return false;
   const rows=await readGuestTrips();if(!active())return false;
   const copy=rows.find(row=>row.id===preview.id&&row.ownerId===preview.ownerId);
   if(!sameValue(copy,preview))throw Error('READBACK');
   onSaved(copy!);return true;
  }catch{
   if(active())setError(t('Could not confirm the device save. Your input is kept; retry saves the same copy.','未能確認裝置保存結果。輸入已保留，重試會沿用同一副本。'));
   return false;
  }finally{if(active()){locked.current=false;setBusy(false);}}
 }
 useUnsavedDraftGuard({dirty:edited||!!note,busy,scopeKey:(actorId??'guest')+':'+identity.id,saveLatest:save});
 const removeTarget=days.find(day=>day.key===removeKey);
 return <>
  <form onSubmit={event=>{event.preventDefault();review();}}>
   <fieldset disabled={busy}>
    <div className="cs-trip-fields">
     <label>{t('Trip title','行程標題')}<input value={title} maxLength={200} onChange={event=>{setTitle(event.target.value);change();}}/></label>
     <label>{t('Start date (optional)','開始日期（可選）')}<input type="date" value={date} onChange={event=>{setDate(event.target.value);change();}}/></label>
     <label>{t('Time zone','時區')}<input value={timezone} maxLength={80} onChange={event=>{setTimezone(event.target.value);change();}}/></label>
    </div>
    <p className="cs-note">{t('Up to 30 days, 20 stops per day and 200 stops in total.','最多三十天，每天二十個站點，整份行程合共二百個站點。')}</p>
    {days.map((day,index)=><fieldset className="cs-trip-day" key={day.key}>
     <legend>{t(`Day ${index+1}`,`第 ${index+1} 天`)}</legend>
     <label>{t('Day title','當日標題')}<input value={day.title} maxLength={200} onChange={event=>editDay(day.key,'title',event.target.value)}/></label>
     <label>{t('Stops, one per line','站點，每行一個')}<textarea rows={5} maxLength={4020} value={day.stops} onChange={event=>editDay(day.key,'stops',event.target.value)}/></label>
     <div className="cs-actions">
      <button className="k-btn" type="button" disabled={index===0} onClick={()=>moveDay(day.key,-1)}>{t('Move day earlier','提前一天')}</button>
      <button className="k-btn" type="button" disabled={index===days.length-1} onClick={()=>moveDay(day.key,1)}>{t('Move day later','延後一天')}</button>
      <button className="k-btn" type="button" disabled={days.length===1} onClick={()=>setRemoveKey(day.key)}>{t('Remove day','移除此日')}</button>
     </div>
    </fieldset>)}
    <button className="k-btn" type="button" disabled={days.length>=30} onClick={addDay}>{t('Add day','加入一天')}</button>
    <label>{t('Trip note (optional)','行程筆記（可選）')}<textarea rows={4} maxLength={4000} value={note} onChange={event=>{setNote(event.target.value);change();}}/></label>
    <button className="k-btn primary" type="submit">{t('Review itinerary','檢視行程')}</button>
   </fieldset>
  </form>
  {preview&&<section className="cs-brief-preview" aria-label={t('Itinerary preview','行程預覽')}>
   <h2>{preview.title}</h2><p>{preview.startDate??t('Date not set','日期未定')} · {preview.timezone}</p>
   {preview.days.map(day=><section key={day.offset}><h3>{day.title}</h3><ol>{day.stops.map((stop,index)=><li key={index}>{stop.title}</li>)}</ol></section>)}
   <p>{t('Times are not scheduled. The note is attached to the first stop of the first day.','時間尚未安排，筆記會附於第一天的首個站點。')}</p>
   {preview.days[0].stops[0].travellerNote&&<blockquote className="cs-trip-note">{preview.days[0].stops[0].travellerNote}</blockquote>}
   <p>{t('Anyone using this browser can open device drafts. Account import is a separate confirmation.','此瀏覽器的使用者均可開啟裝置草稿。匯入帳戶需要另行確認。')}</p>
   <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>{t('I want to save this itinerary and its notes on this device.','我確認將此行程及筆記保存於這部裝置。')}</label>
   <button className="k-btn primary" disabled={busy||!confirmed} onClick={()=>void save()}>{busy?t('Saving device draft…','正在保存裝置草稿…'):t('Save itinerary on this device','保存行程至此裝置')}</button>
  </section>}
  {error&&<p className="cs-error" role="alert">{error}</p>}
  {removeTarget&&<Modal title={t('Remove this day?','移除此日？')} onClose={()=>{if(!busy)setRemoveKey(null);}}><div className="k-modal-body">
   <p>{removeTarget.title}</p><p>{t('This removes the day and its stops from this unsaved itinerary.','這會從尚未保存的行程中移除此日及所有站點。')}</p>
   <div className="cs-actions"><button className="k-btn" disabled={busy} onClick={()=>setRemoveKey(null)}>{t('Keep day','保留此日')}</button><button className="k-btn" disabled={busy} onClick={removeDay}>{t('Remove day','移除此日')}</button></div>
  </div></Modal>}
 </>;
}
