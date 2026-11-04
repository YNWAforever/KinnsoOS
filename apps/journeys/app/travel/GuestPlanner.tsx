'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import Link from 'next/link';
import type {GuideSnapshot} from '../../lib/contracts/trips';
import {deleteGuestTrip,guideDraft,readGuestTrips,restorableGuideDrafts,saveGuestTrip,type GuestTrip} from '../../lib/trips/guest-drafts';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp,Modal} from './ui';
import {useUnsavedDraftGuard} from './UnsavedDraftGuard';
import {manualTripDetailsIssue} from '../../lib/studio/manual-trip';
import {sameValue} from '../../lib/studio/contracts';
import {beginGuestTripEdit,guestTripEditSnapshot,changeManualTripStructure,changeManualStopSchedule,stopScheduleInput,stopScheduleIssue,manualTripStopScheduleIssue,type GuestTripEdit,type ManualTripStructureCommand,type StopScheduleInput} from '../../lib/trips/device-trip-editor';

const scheduleErrors:Record<'STOP_TIME'|'STOP_DURATION',readonly[string,string]>={STOP_TIME:['Use a 24-hour time from 00:00 to 23:59, or leave it blank.','請填寫 00:00 至 23:59 的二十四小時制時間，或留空。'],STOP_DURATION:['Use a whole number of minutes from 1 to 1440, or leave it blank.','請填寫 1 至 1440 的整數分鐘，或留空。']};

type GuestPlannerProps={actorId?:string|null;onDeleted?:(copy:GuestTrip)=>void}&(
 {guide:GuideSnapshot;initialDraft?:never;onSaved?:never}|
 {guide?:never;initialDraft:GuestTrip;onSaved:(copy:GuestTrip)=>void}
);
export function GuestPlanner({guide,actorId=null,initialDraft,onSaved,onDeleted}:GuestPlannerProps){
 const {t,href}=useApp();
 const [draft,setDraft]=useState<GuestTripEdit|null>(()=>initialDraft?beginGuestTripEdit(initialDraft):null),[message,setMessage]=useState(initialDraft?t('Device draft saved. It is not synced to an account.','裝置草稿已保存，尚未同步至帳戶。'):'');
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
 const [copies,setCopies]=useState<GuestTrip[]>([]);
 const [deleteTarget,setDeleteTarget]=useState<GuestTrip|null>(null);
 const [structureRemoval,setStructureRemoval]=useState<{dayKey:string;stopKey?:string;generation:number}|null>(null);
 const [stopDestinations,setStopDestinations]=useState<Record<string,{dayKey:string;generation:number}>>({});
 const [scheduleGeneration,setScheduleGeneration]=useState(0);
 const lock=useRef(false),editRevision=useRef(0),readEpoch=useRef(0);
 const saveController=useRef<AbortController|null>(null),currentActor=useRef(actorId);
 const editorRoot=useRef<HTMLElement|null>(null),transferFocus=useRef<{stopKey:string;actorId:string|null;generation:number}|null>(null);
 const currentDraft=useRef(draft);currentDraft.current=draft;
 useUnsavedDraftGuard({dirty:!!draft&&dirty,busy:!!draft&&busy,scopeKey:(actorId??'anonymous')+':'+(draft?.id??''),saveLatest:()=>currentDraft.current?save(currentDraft.current,false):Promise.resolve(false)});
 useLayoutEffect(()=>{
  const request=transferFocus.current;transferFocus.current=null;
  if(!request||request.actorId!==actorId||request.generation!==readEpoch.current)return;
  Array.from(editorRoot.current?.querySelectorAll<HTMLInputElement>('input[data-editor-stop]')??[]).find(input=>input.dataset.editorStop===request.stopKey)?.focus();
 },[draft,actorId]);

 const accountNotice=t('Account changed. Device edits are kept in this tab; review them before saving again.','帳戶已改變，裝置修改仍在此頁，請核對後再保存。');
 useEffect(()=>{
  readEpoch.current++;setScheduleGeneration(readEpoch.current);lock.current=false;setBusy(false);
  const invalidate=()=>{
   readEpoch.current++;setScheduleGeneration(readEpoch.current);saveController.current?.abort();saveController.current=null;
   lock.current=false;setBusy(false);setCopies([]);setDeleteTarget(null);setStructureRemoval(null);setStopDestinations({});transferFocus.current=null;
   if(currentDraft.current)setDirty(true);
   setMessage(accountNotice);
  };
  if(currentActor.current!==actorId){currentActor.current=actorId;invalidate();}
  const off=subscribeAccountInvalidation(next=>{if(next!==actorId)invalidate();});
  return()=>{readEpoch.current++;saveController.current?.abort();saveController.current=null;transferFocus.current=null;off();};
 },[actorId,accountNotice]);

 useEffect(()=>{
  if(!draft||(!dirty&&!busy))return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[dirty,busy,draft===null]);

 async function restore(){
  if(lock.current||!guide)return;
  const generation=readEpoch.current;lock.current=true;setBusy(true);setCopies([]);
  setMessage(t('Reading saved device drafts…','正在讀取已保存的裝置草稿…'));
  try{
   const rows=restorableGuideDrafts(await readGuestTrips(),guide.id);
   if(generation!==readEpoch.current)return;
   setCopies(rows);
   setMessage(rows.length?t('Choose a saved copy to continue editing.','請選擇已保存的副本繼續編輯。'):t('No saved device drafts for this guide could be restored.','此攻略沒有可恢復的裝置草稿。'));
  }catch{
   if(generation!==readEpoch.current)return;
   setMessage(t('Device drafts could not be read. Original copies are kept; retry.','未能讀取裝置草稿，原副本已保留，請重試。'));
  }finally{
   if(generation===readEpoch.current){lock.current=false;setBusy(false);}
  }
 }

 function resume(copy:GuestTrip){
  if(lock.current)return;
  const editing=beginGuestTripEdit(copy);editRevision.current++;currentDraft.current=editing;setDraft(editing);setCopies([]);setDirty(false);setStructureRemoval(null);setStopDestinations({});transferFocus.current=null;
  setMessage(t('Device draft restored. It is not synced to an account.','裝置草稿已恢復，尚未同步至帳戶。'));
 }

 function editStop(dayIndex:number,stopIndex:number,field:'title'|'travellerNote',value:string){
  editRevision.current++;
  const current=currentDraft.current;const next=current&&{...current,days:current.days.map((day,i)=>i===dayIndex?{
   ...day,stops:day.stops.map((stop,j)=>j===stopIndex?{...stop,[field]:value}:stop),
  }:day)};currentDraft.current=next;setDraft(next);
  setDirty(true);
  setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));
 }

 function editDetails(patch:Partial<Pick<GuestTrip,'title'|'startDate'|'timezone'>>){
  const current=currentDraft.current;if(!current||current.origin!=='manual')return;
  editRevision.current++;const next={...current,...patch};currentDraft.current=next;setDraft(next);setDirty(true);
  setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));
 }
 function editDayTitle(index:number,title:string){
  const current=currentDraft.current;if(!current||current.origin!=='manual')return;
  editRevision.current++;const next={...current,days:current.days.map((day,i)=>i===index?{...day,title}:day)};currentDraft.current=next;setDraft(next);setDirty(true);
  setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));
 }

 function editSchedule(stopKey:string,field:keyof StopScheduleInput,value:string){
  const current=currentDraft.current;
  if(lock.current||currentActor.current!==actorId||scheduleGeneration!==readEpoch.current||current?.origin!=='manual')return;
  const next=changeManualStopSchedule(current,stopKey,field,value);if(next===current)return;
  editRevision.current++;currentDraft.current=next;setDraft(next);setDirty(true);
  setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));
 }

 function structure(command:ManualTripStructureCommand){
  if(lock.current||currentActor.current!==actorId||!currentDraft.current)return;
  try{
   const current=currentDraft.current,next=changeManualTripStructure(current,command);
   if(next===current)return;
   transferFocus.current=command.type==='transferStop'?{stopKey:command.stopKey,actorId,generation:readEpoch.current}:null;
   setStopDestinations(current=>{
    const choices:typeof current={};
    for(const day of next.days)for(const stop of day.stops){const choice=current[stop.editorKey];if(choice&&choice.generation===readEpoch.current&&choice.dayKey!==day.editorKey&&next.days.some(destination=>destination.editorKey===choice.dayKey))choices[stop.editorKey]=choice;}
    return choices;
   });
   editRevision.current++;currentDraft.current=next;setDraft(next);setDirty(true);
   setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));
  }catch(error){
   const code=error instanceof Error?error.message:'';
   setMessage(code==='DAY_LIMIT'?t('A device trip can have up to 30 days.','裝置行程最多可有三十天。'):code==='STOP_LIMIT'?t('Use up to 50 stops per day and 200 stops in total.','每天最多五十個站點，整份行程合共最多二百個。'):t('This change could not be applied. Your draft is kept.','未能套用此修改，草稿已保留。'));
  }
 }

 async function save(next:GuestTripEdit,notifyParent=true):Promise<boolean>{
  if(lock.current)return false;
  const issue=manualTripDetailsIssue(next)||manualTripStopScheduleIssue(next);
  if(issue){
   const errors:Record<string,readonly[string,string]>={...scheduleErrors,TITLE:['Enter a trip title of up to 200 characters.','請填寫二百字以內的行程標題。'],DAY_TITLE:['Enter a day title of up to 200 characters.','請填寫二百字以內的當日標題。'],DATE:['Choose a valid calendar date.','請選擇有效的日期。'],TIMEZONE:['Choose a valid time zone, such as Asia/Hong_Kong.','請填寫有效時區，例如 Asia/Hong_Kong。']};
   const message=errors[issue];setDirty(true);setMessage(message?t(...message):t('Check the trip details. Your edits are kept.','請核對行程資料，你的修改已保留。'));return false;
  }
  lock.current=true;
  const savingRevision=editRevision.current,generation=readEpoch.current;
  const request=new AbortController();saveController.current=request;
  currentDraft.current=next;setBusy(true);setDirty(true);setDraft(next);
  setMessage(t('Saving device draft…','正在保存裝置草稿…'));
  try{
   const snapshot=guestTripEditSnapshot(next);
   await saveGuestTrip(snapshot,request.signal);
   if(generation!==readEpoch.current)return false;
   if(editRevision.current!==savingRevision){setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));return false;}
   const rows=await readGuestTrips();if(generation!==readEpoch.current)return false;
   // A readback acknowledges this snapshot, not edits made while reading it.
   if(editRevision.current===savingRevision){
    const stored=rows.find(row=>row.id===next.id&&row.ownerId===next.ownerId);
    if(!sameValue(stored,snapshot))throw Error('READBACK');
    setDirty(false);
    setMessage(t('Device draft saved. It is not synced to an account.','裝置草稿已保存，尚未同步至帳戶。'));
    if(notifyParent)onSaved?.(snapshot);
    return true;
   }else{
    setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));
   }
  }catch{
   if(generation===readEpoch.current)setMessage(t('Device save was not confirmed. Keep this tab open and retry the same copy.','未能確認裝置保存結果。請保持此頁開啟，並重試同一副本。'));
  }finally{if(generation===readEpoch.current){lock.current=false;setBusy(false);}}
  return false;
 }

 async function remove(copy:GuestTrip){
  if(lock.current)return;const generation=readEpoch.current;lock.current=true;setBusy(true);
  try{await deleteGuestTrip(copy.id,copy.ownerId);if(generation!==readEpoch.current)return;
   setDeleteTarget(null);setCopies(rows=>rows.filter(row=>row.id!==copy.id||row.ownerId!==copy.ownerId));
   if(currentDraft.current?.id===copy.id&&currentDraft.current.ownerId===copy.ownerId){editRevision.current++;currentDraft.current=null;setDraft(null);setDirty(false);}
   setMessage(t('This device copy was deleted. Other copies and account trips are kept.','此裝置副本已刪除，其他副本及帳戶行程保留。'));onDeleted?.(guestTripEditSnapshot(copy));
  }catch{if(generation===readEpoch.current)setMessage(t('Device deletion was not confirmed. Original copies are kept; retry.','未確認裝置副本刪除，原副本已保留，請重試。'));}
  finally{if(generation===readEpoch.current){lock.current=false;setBusy(false);}}
 }
 const deletion=deleteTarget&&<Modal title={t('Delete device copy?','刪除此裝置副本？')} onClose={()=>{if(!busy)setDeleteTarget(null)}}><div className="k-modal-body"><p>{t('Delete only this selected copy from this browser. Unsaved edits to this copy will also be discarded. Other device copies and account trips are kept.','只刪除此瀏覽器中選定的副本，亦會放棄此副本未保存的修改。其他裝置副本及帳戶行程保留。')}</p><p>{deleteTarget.title}</p><button className="k-btn" disabled={busy} onClick={()=>setDeleteTarget(null)}>{t('Keep device draft','保留裝置草稿')}</button><button className="k-btn" disabled={busy} onClick={()=>void remove(deleteTarget)}>{t('Delete device copy','刪除裝置副本')}</button></div></Modal>;
 if(!draft)return <section>
  {!actorId&&guide&&<button className="k-btn primary" disabled={busy} onClick={()=>{
   const copy=guideDraft(guide,crypto.randomUUID(),'guest-'+crypto.randomUUID(),Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');void save(beginGuestTripEdit(copy));
  }}>{t('Plan as a device-only draft','以裝置草稿規劃')}</button>}
  {guide&&<button className="k-btn" disabled={busy} onClick={()=>void restore()}>{t('Find saved device drafts','尋找已保存的裝置草稿')}</button>}
  <p>{t('Device drafts can be read by anyone using this browser. Only open your own copy on a shared device.','此瀏覽器的使用者均可讀取裝置草稿。共用裝置上請只開啟自己的副本。')}</p>
  <ul>{copies.map(copy=><li key={copy.id}><button className="k-btn" data-draft-id={copy.id} onClick={()=>resume(copy)}>{t('Resume device draft','繼續編輯裝置草稿')} · {copy.title} · v{copy.source?.version} · {copy.days.length} {t('days','日')}</button><button className="k-btn" disabled={busy} onClick={()=>setDeleteTarget(copy)}>{t('Delete this device draft','刪除此裝置草稿')}</button></li>)}</ul>{deletion}
  <p role="status" aria-label={t('Device draft status','裝置草稿狀態')} data-testid="guest-save-state">{message}</p>
 </section>;
 const removalDay=structureRemoval&&draft.days.find(day=>day.editorKey===structureRemoval.dayKey);
 const removalStop=removalDay&&structureRemoval?.stopKey?removalDay.stops.find(stop=>stop.editorKey===structureRemoval.stopKey):null;
 const removalValid=removalDay&&(!structureRemoval?.stopKey||removalStop);
 const stopCount=draft.days.reduce((count,day)=>count+day.stops.length,0);
 return <section className="os-guide os-stop" ref={editorRoot}>
  <h2>{t('Device-only draft','只在此裝置的草稿')}</h2>
  {draft.origin==='manual'?<div>
   <label>{t('Draft trip title','草稿行程標題')}<input value={draft.title} maxLength={200} onChange={event=>editDetails({title:event.target.value})}/></label>
   <label>{t('Draft start date (optional)','草稿開始日期（可選）')}<input type="date" value={draft.startDate??''} onChange={event=>editDetails({startDate:event.target.value||null})}/></label>
   <label>{t('Draft time zone','草稿時區')}<input value={draft.timezone} maxLength={80} onChange={event=>editDetails({timezone:event.target.value})}/></label>
  </div>:<><p>{t('Planning time zone','規劃時區')}: {draft.timezone}</p>{draft.startDate&&<p>{t('Start date','開始日期')}: {draft.startDate}</p>}</>}
  {initialDraft&&<p>{draft.origin!=='manual'&&<>{draft.title} · </>}{t('Local identity','本機身份')}: {draft.ownerId}{draft.source&&` · v${draft.source.version}`}</p>}
  <p>{t('This device copy is separate from your account. Review and confirm its import to save an account copy. Original local data is kept.','此裝置副本與帳戶分開。須核對及確認匯入，才會保存至帳戶，原本機資料會保留。')}</p>
  {draft.origin==='manual'&&<p>{t('Changing days renumbers them from the start date. The saved copy changes only after Save.','更改日程會由開始日期重新編排天數。修改只會在保存後寫入。')}</p>}
  {draft.days.map((day,index)=><section key={day.editorKey} role="group" aria-label={t(`Saved day ${index+1}`,`已保存日程 ${index+1}`)}>
   <h3 style={{overflowWrap:'anywhere'}}>{day.title}</h3>
   {draft.origin==='manual'&&<label>{t('Draft day title','草稿當日標題')}<input value={day.title} maxLength={200} onChange={event=>editDayTitle(index,event.target.value)}/></label>}
   {draft.origin==='manual'&&<div className="k-actions">
    <button className="k-btn" disabled={busy||index===0} onClick={()=>structure({type:'moveDay',dayKey:day.editorKey,direction:-1})}>{t('Move day earlier','提前一天')}</button>
    <button className="k-btn" disabled={busy||index===draft.days.length-1} onClick={()=>structure({type:'moveDay',dayKey:day.editorKey,direction:1})}>{t('Move day later','延後一天')}</button>
    <button className="k-btn" disabled={busy||draft.days.length===1} onClick={()=>{if(!lock.current&&currentActor.current===actorId)setStructureRemoval({dayKey:day.editorKey,generation:readEpoch.current});}}>{t('Remove day','移除此日')}</button>
   </div>}
   {day.stops.map((stop,position)=>{
    const target=stopDestinations[stop.editorKey];
    const destination=target?.generation===readEpoch.current?draft.days.find(candidate=>candidate.editorKey===target.dayKey&&candidate.editorKey!==day.editorKey):undefined;
    const schedule=draft.origin==='manual'?stopScheduleInput(stop):null,issue=stopScheduleIssue(stop),errorId=stop.editorKey+'-schedule-error';
    return <div key={stop.editorKey} role="group" aria-label={t(`Stop ${position+1}`,`站點 ${position+1}`)}>
    <label>{t('Draft stop title','草稿站點名稱')}<input data-editor-stop={stop.editorKey} value={stop.title} maxLength={200} onChange={e=>editStop(index,position,'title',e.target.value)}/></label>
    <label>{t('Draft private note','草稿私人筆記')}<textarea value={stop.travellerNote} maxLength={4000} onChange={e=>editStop(index,position,'travellerNote',e.target.value)}/></label>
    {schedule&&<div>
     <label>{t('Start time (HH:mm, optional)','開始時間（HH:mm，可選）')}<input type="text" placeholder="HH:mm" value={schedule.startTime} disabled={busy} aria-invalid={issue==='STOP_TIME'} aria-describedby={issue==='STOP_TIME'?errorId:undefined} onChange={event=>editSchedule(stop.editorKey,'startTime',event.target.value)}/></label>
     <label>{t('Duration in minutes (optional)','停留分鐘（可選）')}<input type="text" inputMode="numeric" value={schedule.duration} disabled={busy} aria-invalid={issue==='STOP_DURATION'} aria-describedby={issue==='STOP_DURATION'?errorId:undefined} onChange={event=>editSchedule(stop.editorKey,'duration',event.target.value)}/></label>
     {issue&&<p id={errorId}>{t(...scheduleErrors[issue])}</p>}
    </div>}
    {draft.origin==='manual'&&<div className="k-actions">
     <button className="k-btn" disabled={busy||position===0} onClick={()=>structure({type:'moveStop',dayKey:day.editorKey,stopKey:stop.editorKey,direction:-1})}>{t('Move stop earlier','提前站點')}</button>
     <button className="k-btn" disabled={busy||position===day.stops.length-1} onClick={()=>structure({type:'moveStop',dayKey:day.editorKey,stopKey:stop.editorKey,direction:1})}>{t('Move stop later','延後站點')}</button>
     <button className="k-btn" disabled={busy} onClick={()=>{if(!lock.current&&currentActor.current===actorId)setStructureRemoval({dayKey:day.editorKey,stopKey:stop.editorKey,generation:readEpoch.current});}}>{t('Remove stop','移除站點')}</button>
    </div>}
    {draft.origin==='manual'&&<div>
     <label>{t('Move to day','移至日程')}<select style={{maxWidth:'100%',width:'100%',minWidth:0}} value={destination?.editorKey??''} disabled={busy||draft.days.length<2} onChange={event=>{
      if(lock.current||currentActor.current!==actorId)return;
      const value=event.target.value,generation=readEpoch.current;setStopDestinations(current=>{const next={...current};if(value)next[stop.editorKey]={dayKey:value,generation};else delete next[stop.editorKey];return next;});
     }}><option value="">{t('Choose another day','選擇另一日程')}</option>{draft.days.filter(candidate=>candidate.editorKey!==day.editorKey).map(candidate=><option key={candidate.editorKey} value={candidate.editorKey} disabled={candidate.stops.length>=50}>{t(`Day ${candidate.offset+1} · ${candidate.title}`,`第 ${candidate.offset+1} 天 · ${candidate.title}`)}</option>)}</select></label>
     <button className="k-btn" disabled={busy||!destination||destination.stops.length>=50} onClick={()=>{
      if(!target||target.generation!==readEpoch.current)return;
      structure({type:'transferStop',dayKey:day.editorKey,stopKey:stop.editorKey,targetDayKey:target.dayKey});
     }}>{t('Move stop to day','移動站點至日程')}</button>
    </div>}
   </div>;})}
   {draft.origin==='manual'&&<button className="k-btn" disabled={busy||day.stops.length>=50||stopCount>=200} onClick={()=>structure({type:'addStop',dayKey:day.editorKey})}>{t('Add stop','加入站點')}</button>}
  </section>)}
  {draft.origin==='manual'&&<button className="k-btn" disabled={busy||draft.days.length>=30} onClick={()=>structure({type:'addDay',title:t('New day','新一天')})}>{t('Add day','加入一天')}</button>}
  <button className="k-btn" disabled={busy} onClick={()=>void save(draft)}>{t('Save device draft','保存裝置草稿')}</button>
  <button className="k-btn" disabled={busy} onClick={()=>setDeleteTarget(draft)}>{t('Delete this device draft','刪除此裝置草稿')}</button>{deletion}
  <p>{t('Only confirmed saved copies can be restored after this tab or app closes. If your browser shows a leave-page warning, cancel it and save here first.','此頁或應用程式關閉後，只能恢復已確認保存的副本。如瀏覽器顯示離頁警告，請取消離開並先在此保存。')}</p>
  {busy||dirty?<>
   <button className="k-btn" disabled>{actorId?t('Review import to your account','核對匯入你的帳戶'):t('Sign in to review import','登入以核對匯入')}</button>
   <p>{t('Save your latest edits before reviewing this draft for account import.','請先保存最新修改，再核對匯入此草稿至帳戶。')}</p>
  </>:<Link className="k-btn" href={actorId?href('trips'):href('sign-in')+'?next='+encodeURIComponent(href('trips'))}>{actorId?t('Review import to your account','核對匯入你的帳戶'):t('Sign in to review import','登入以核對匯入')}</Link>}
  <p role="status" aria-label={t('Device draft status','裝置草稿狀態')} data-testid="guest-save-state">{message}</p>
  {removalValid&&<Modal title={removalStop?t('Remove this stop?','移除此站點？'):t('Remove this day?','移除此日？')} onClose={()=>{if(!lock.current&&structureRemoval?.generation===readEpoch.current)setStructureRemoval(null);}}><div className="k-modal-body">
   <p>{removalStop?removalStop.title||t('Untitled stop','未命名站點'):removalDay.title}</p>
   <p>{removalStop?t('This removes the stop and its private note. The saved copy is unchanged until Save.','這會移除站點及其私人筆記。保存前不會改動已保存的副本。'):t('This removes the day, its stops and their private notes. Remaining days are renumbered. The saved copy is unchanged until Save.','這會移除此日、所有站點及私人筆記，其他日程會重新編排。保存前不會改動已保存的副本。')}</p>
   <div className="k-actions"><button className="k-btn" disabled={busy} onClick={()=>{if(structureRemoval?.generation===readEpoch.current)setStructureRemoval(null);}}>{removalStop?t('Keep stop','保留站點'):t('Keep day','保留此日')}</button><button className="k-btn" disabled={busy} onClick={()=>{
    if(lock.current||!structureRemoval||structureRemoval.generation!==readEpoch.current)return;
    structure(structureRemoval.stopKey?{type:'removeStop',dayKey:structureRemoval.dayKey,stopKey:structureRemoval.stopKey}:{type:'removeDay',dayKey:structureRemoval.dayKey});setStructureRemoval(null);
   }}>{removalStop?t('Remove stop','移除站點'):t('Remove day','移除此日')}</button></div>
  </div></Modal>}
 </section>;
}
