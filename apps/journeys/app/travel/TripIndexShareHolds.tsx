'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {sharing} from '../../lib/trips/sharing';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {listShareHolds,parseShareHold,sameShareHold,shareHoldKey,shareIntent,type ShareHoldList,type ShareHoldV2} from '../../lib/trips/share-hold';
import {useApp} from './ui';

// States a session share hold on the trips index. Retry resends that hold's
// original request. Receipt reads and the share-receipt keyring stay on the trip.
export function TripIndexShareHolds({actorId,trips,sharingEnabled}:{actorId:string;trips:{id:string;title:string}[];sharingEnabled:boolean}){
 const {t,href}=useApp(),[snapshot,setSnapshot]=useState<({hidden:boolean}&ShareHoldList)|{ready:false}>({ready:false}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const epoch=useRef(0),lock=useRef(false);
 useEffect(()=>{let active=true;epoch.current++;lock.current=false;setBusy(false);setMessage('');setSnapshot({ready:false});
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next===actorId)return;active=false;epoch.current++;lock.current=false;setMessage('');setSnapshot({readable:true,items:[],hidden:true});});
  try{const listed=listShareHolds(window.sessionStorage);if(active)setSnapshot({...listed,hidden:false});}
  catch{if(active)setSnapshot({readable:false,items:[],hidden:false});}
  return()=>{active=false;epoch.current++;unsubscribe();};
 },[actorId]);
 async function retry(hold:ShareHoldV2){
  if(lock.current||!sharingEnabled||!('items' in snapshot)||snapshot.hidden)return;
  const generation=epoch.current;lock.current=true;setBusy(true);setMessage('');
  try{
   const raw=window.sessionStorage.getItem(shareHoldKey(hold.tripId));
   if(generation!==epoch.current)return;
   if(raw===null)throw Error('Missing share hold');
   const again=parseShareHold(raw,hold.tripId);
   if(again.version!==2||!sameShareHold(again,hold)){if(generation===epoch.current)setMessage(t('The held share changed before retry. No request was sent. Its outcome stays unknown.','重試前分享鎖定已變更，未送出請求，結果仍然未知。'));return;}
   await sharing.create(shareIntent(again));
   if(generation!==epoch.current)return;
   // This list does not settle a create response. Receipt reads stay on the trip.
   setMessage(t('The share outcome stays unknown. The original request is kept.','分享結果仍然未知，原請求已保留。'));
  }catch{if(generation===epoch.current)setMessage(t('The share outcome stays unknown. The original request is kept.','分享結果仍然未知，原請求已保留。'));}
  finally{if(generation===epoch.current){setBusy(false);lock.current=false;}}
 }
 if(!('items' in snapshot)||snapshot.hidden||(snapshot.readable&&snapshot.items.length===0))return null;
 const titleFor=(tripId:string|null)=>tripId?trips.find(trip=>trip.id.toLowerCase()===tripId.toLowerCase())?.title??null:null;
 return <section aria-label={t('Held shares on your trip list','行程清單上已鎖定的分享')}>
  <h2>{t('Held share requests','已鎖定的分享請求')}</h2>
  {!snapshot.readable&&<p role="status">{t('Share holds could not be read. Their outcome stays unknown.','未能讀取分享鎖定，結果仍然未知。')}</p>}
  {snapshot.items.map((item,index)=>{
   const title=titleFor(item.hold?.tripId??item.tripId)??t('Trip title unknown','行程名稱未知');
   if(item.hold?.version===2)return <article key={item.hold.requestId}><p>{title}</p><p>{t('An earlier share stays held. Its outcome is unknown. Retry uses the original request.','較早的分享仍然鎖定，結果未知。重試會使用原請求。')}</p><p style={{overflowWrap:'anywhere'}}>{t('Original share request','原分享請求')} {item.hold.requestId}</p>{sharingEnabled?<button className="k-btn" disabled={busy} onClick={()=>void retry(item.hold as ShareHoldV2)}>{t('Retry original request','重試原來請求')}</button>:<p>{t('Read-only sharing is currently unavailable. The held request remains listed.','唯讀分享目前尚未接通。已鎖定的請求仍列於此。')}</p>}<Link href={href('trips/'+item.hold.tripId)}>{t('Check private trip','檢查私人行程')}</Link></article>;
   if(item.hold?.version===1)return <article key={item.hold.tripId+':v1:'+index}><p>{title}</p><p role="status">{t('This held share has no original request id. Its outcome stays unknown.','此鎖定分享沒有原請求編號，結果仍然未知。')}</p></article>;
   return <article key={'unread:'+(item.tripId??index)}><p>{title}</p><p role="status">{t('A share hold could not be read. Its outcome stays unknown.','未能讀取一項分享鎖定，結果仍然未知。')}</p></article>;
  })}
  <p role="status">{message}</p>
 </section>;
}
