'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import type {GuideSnapshot} from '../../lib/contracts/trips';
import {guideDraft,readGuestTrips,restorableGuideDrafts,saveGuestTrip,type GuestTrip} from '../../lib/trips/guest-drafts';
import {useApp} from './ui';

export function GuestPlanner({guide}:{guide:GuideSnapshot}){
 const {t,href}=useApp();
 const [draft,setDraft]=useState<GuestTrip|null>(null),[message,setMessage]=useState('');
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
 const [copies,setCopies]=useState<GuestTrip[]>([]);
 const lock=useRef(false),editRevision=useRef(0),readEpoch=useRef(0);

 useEffect(()=>{readEpoch.current++;return()=>{readEpoch.current++;}},[]);

 useEffect(()=>{
  if(!draft||(!dirty&&!busy))return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[dirty,busy,draft===null]);

 async function restore(){
  if(lock.current)return;
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
  editRevision.current++;setDraft(copy);setCopies([]);setDirty(false);
  setMessage(t('Device draft restored. It is not synced to an account.','裝置草稿已恢復，尚未同步至帳戶。'));
 }

 function editStop(dayIndex:number,stopIndex:number,field:'title'|'travellerNote',value:string){
  editRevision.current++;
  setDraft(current=>current&&{...current,days:current.days.map((day,i)=>i===dayIndex?{
   ...day,stops:day.stops.map((stop,j)=>j===stopIndex?{...stop,[field]:value}:stop),
  }:day)});
  setDirty(true);
  setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));
 }

 async function save(next:GuestTrip){
  if(lock.current)return;
  lock.current=true;
  const savingRevision=editRevision.current;
  setBusy(true);setDirty(true);setDraft(next);
  setMessage(t('Saving device draft…','正在保存裝置草稿…'));
  try{
   await saveGuestTrip(next);
   // IndexedDB acknowledged this snapshot, not any edits made while it was saving.
   if(editRevision.current===savingRevision){
    setDirty(false);
    setMessage(t('Device draft saved. It is not synced to an account.','裝置草稿已保存，尚未同步至帳戶。'));
   }else{
    setMessage(t('Device edits are not saved yet.','裝置修改尚未保存。'));
   }
  }catch{
   setMessage(t('Device draft was not saved. Keep this tab open.','未能保存裝置草稿，請保持此頁開啟。'));
  }finally{lock.current=false;setBusy(false);}
 }

 if(!draft)return <section>
  <button className="k-btn primary" disabled={busy} onClick={()=>void save(guideDraft(guide,crypto.randomUUID(),'guest-'+crypto.randomUUID(),Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'))}>{t('Plan as a device-only draft','以裝置草稿規劃')}</button>
  <button className="k-btn" disabled={busy} onClick={()=>void restore()}>{t('Find saved device drafts','尋找已保存的裝置草稿')}</button>
  <p>{t('Device drafts can be read by anyone using this browser. Only open your own copy on a shared device.','此瀏覽器的使用者均可讀取裝置草稿。共用裝置上請只開啟自己的副本。')}</p>
  <ul>{copies.map(copy=><li key={copy.id}><button className="k-btn" data-draft-id={copy.id} onClick={()=>resume(copy)}>{t('Resume device draft','繼續編輯裝置草稿')} · {copy.title} · v{copy.source?.version} · {copy.days.length} {t('days','日')}</button></li>)}</ul>
  <p role="status" data-testid="guest-save-state">{message}</p>
 </section>;
 return <section className="os-guide os-stop">
  <h2>{t('Device-only draft','只在此裝置的草稿')}</h2>
  <p>{t('This device copy is separate from your account. After signing in, review and confirm its import. Original local data is kept.','此裝置副本與帳戶分開。登入後須核對及確認匯入，原本機資料會保留。')}</p>
  {draft.days.map((day,index)=><section key={index}>
   <h3>{day.title}</h3>
   {day.stops.map((stop,position)=><div key={position}>
    <label>{t('Draft stop title','草稿站點名稱')}<input value={stop.title} maxLength={200} onChange={e=>editStop(index,position,'title',e.target.value)}/></label>
    <label>{t('Draft private note','草稿私人筆記')}<textarea value={stop.travellerNote} maxLength={4000} onChange={e=>editStop(index,position,'travellerNote',e.target.value)}/></label>
   </div>)}
  </section>)}
  <button className="k-btn" disabled={busy} onClick={()=>void save(draft)}>{t('Save device draft','保存裝置草稿')}</button>
  {busy||dirty?<>
   <button className="k-btn" disabled>{t('Sign in to review import','登入以核對匯入')}</button>
   <p>{t('Save your latest edits before signing in to import this draft.','請先保存最新修改，再登入匯入此草稿。')}</p>
  </>:<Link className="k-btn" href={href('sign-in')+'?next='+encodeURIComponent(href('trips'))}>{t('Sign in to review import','登入以核對匯入')}</Link>}
  <p role="status" data-testid="guest-save-state">{message}</p>
 </section>;
}
