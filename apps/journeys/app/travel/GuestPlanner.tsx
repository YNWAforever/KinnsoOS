'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import type {GuideSnapshot} from '../../lib/contracts/trips';
import {guideDraft,saveGuestTrip,type GuestTrip} from '../../lib/trips/guest-drafts';
import {useApp} from './ui';

export function GuestPlanner({guide}:{guide:GuideSnapshot}){
 const {t,href}=useApp();
 const [draft,setDraft]=useState<GuestTrip|null>(null),[message,setMessage]=useState('');
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
 const lock=useRef(false),editRevision=useRef(0);

 useEffect(()=>{
  if(!dirty&&!busy)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[dirty,busy]);

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

 if(!draft)return <button className="k-btn primary" onClick={()=>void save(guideDraft(guide,crypto.randomUUID(),'guest-'+crypto.randomUUID(),Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'))}>{t('Plan as a device-only draft','以裝置草稿規劃')}</button>;
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
