'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useDraftNavigation} from './UnsavedDraftGuard';
import {useApp} from './ui';
import {trips} from '../../lib/trips/repository';
import {synchronizeAccountCache,readPendingAdoptions,clearPendingAdoption,subscribeAccountInvalidation,readPendingCreation,clearPendingCreation,invalidateAccountViews,type PendingAdoption} from '../../lib/trips/local-drafts';
export function PendingAdoptionRecovery({actorId,tripId}:{actorId:string;tripId?:string}){
 const {t,href}=useApp(),navigate=useDraftNavigation(),[items,setItems]=useState<{intent:PendingAdoption;title:string}[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[valid,setValid]=useState(true);
 const epoch=useRef(0),lock=useRef(false);
 useEffect(()=>{let active=true;epoch.current++;setItems([]);setValid(true);
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){active=false;epoch.current++;setItems([]);setValid(false)}});
  void (async()=>{try{
   await synchronizeAccountCache(actorId);
   const pending=await readPendingAdoptions(actorId),rows=[];
   for(const intent of pending.filter(item=>!tripId||item.tripId===tripId)){
    const current=await trips.get(intent.tripId,actorId);
    if(!active)return;
    if(current.ok)rows.push({intent,title:current.data.title});
   }
   if(active)setItems(rows);
  }catch{if(active)setMessage(t('Unconfirmed applications could not be loaded. Reload to retry.','未能載入待確認套用，請重新載入以重試。'))}})();
  return()=>{active=false;epoch.current++;unsubscribe()};
 },[actorId,tripId]);
 async function retry(intent:PendingAdoption){
  if(lock.current||!valid)return;const generation=epoch.current;lock.current=true;setBusy(true);
  const result=await trips.adopt(intent.guideId,intent.version,intent.tripId,intent.revision,intent.requestId,intent.flowId,actorId);
  if(generation!==epoch.current)return;
  if(result.ok){
   try{const creation=await readPendingCreation(actorId,intent.guideId);if(generation!==epoch.current)return;if(creation?.intent.tripId===intent.tripId){await clearPendingCreation(actorId,intent.guideId,creation.intent.requestId);if(generation!==epoch.current)return}await clearPendingAdoption(actorId,intent.guideId,intent.requestId)}catch{if(generation!==epoch.current)return;setMessage(t('The application was confirmed. Its recovery entry is retained; reload your trip.','套用已確認，恢復紀錄仍保留，請重新載入行程。'));setBusy(false);lock.current=false;return}
   if(generation!==epoch.current)return;
   setItems(rows=>rows.filter(row=>row.intent.requestId!==intent.requestId));navigate(href('trips/'+intent.tripId));
  }else if(['CONFLICT','INVALID','NOT_FOUND','FORBIDDEN'].includes(result.code)){
   try{
    await clearPendingAdoption(actorId,intent.guideId,intent.requestId);
    if(generation!==epoch.current)return;
    setItems(rows=>rows.filter(row=>row.intent.requestId!==intent.requestId));
    setMessage(t('The original application was refused. Your existing private trip is kept; review the current guide before starting again.','原套用已被拒絕，現有私人行程保留；請核對目前攻略後再開始。'));
   }catch{if(generation!==epoch.current)return;setMessage(t('The recovery entry could not be cleared. The original request is kept.','未能清除恢復紀錄，原請求已保留。'))}
  }else {if(result.code==='AUTH_REQUIRED'){invalidateAccountViews(null);return}setMessage(t('The original application could not be confirmed. Its request is kept.','未能確認原套用操作，原請求已保留。'));}
  setBusy(false);lock.current=false;
 }
 if(!valid)return null;
 return <section aria-label={t('Unconfirmed guide applications','待確認攻略套用')}>{items.length>0&&<><h2>{t('Check an earlier application','檢查較早的套用')}</h2>{items.map(({intent,title})=><article key={intent.requestId}><p>{title} · v{intent.version}</p><button className="k-btn" disabled={busy} onClick={()=>void retry(intent)}>{t('Retry original application','重試原套用操作')}</button><Link href={href('trips/'+intent.tripId)}>{t('Check private trip','檢查私人行程')}</Link></article>)}</>}<p role="status">{message}</p></section>;
}
