'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {guides} from '../../lib/guides/repository';
import {adoptionPreview} from '../../lib/guides/adoption-preview';
import {adoptionPath,parseAdoptionPath} from '../../lib/guides/adoption-intent';
import {trackPilotEvent} from '../../lib/telemetry/pilot-client';
import {bookmarks,type BookmarkCursor,type BookmarkRow} from '../../lib/bookmarks/repository';
import {trips} from '../../lib/trips/repository';
import {invalidateAccountViews,subscribeAccountInvalidation,synchronizeAccountCache,readPendingAdoption,savePendingAdoption,clearPendingAdoption,readPendingCreation,clearPendingCreation,type PendingAdoption,type PendingCreation} from '../../lib/trips/local-drafts';
import type {PublicGuide} from '../../lib/seo/public-guide';
import type {PublicDay} from '../../lib/contracts/trips';
import {useApp} from './ui';
import {GuestPlanner} from './GuestPlanner';
import {PublicGuideContent} from '../../lib/seo/PublicGuideContent';
import {useDraftNavigation} from './UnsavedDraftGuard';
export function GuideWorkspace({id,actorId,initialGuide=null}:{id:string;actorId:string|null;initialGuide?:PublicGuide|null}) {
 const requestNavigation=useDraftNavigation();
 const {t,href,locale}=useApp(),router=useRouter(),query=useSearchParams(),[guide,setGuide]=useState<PublicGuide|null>(initialGuide),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[list,setList]=useState<{id:string;title:string;revision:number}[]>([]),[selected,setSelected]=useState(''),[guideFailed,setGuideFailed]=useState(false),[guideAttempt,setGuideAttempt]=useState(0);
 const [preview,setPreview]=useState<ReturnType<typeof adoptionPreview>>(null),[accountValid,setAccountValid]=useState(!!actorId),[next,setNext]=useState<string|null>(null);
 const [previewDays,setPreviewDays]=useState<PublicDay[]>([]);
  const [createdTrip,setCreatedTrip]=useState<PendingCreation|null>(null);
 const [bookmarkStatus,setBookmarkStatus]=useState<'loading'|'ready'|'error'>('loading'),bookmarkRead=useRef({ticket:0,loading:false});
 const adoption=useRef<PendingAdoption|null>(null),[recovered,setRecovered]=useState<PendingAdoption|null>(null),[adoptionReady,setAdoptionReady]=useState(false),[flowId,setFlowId]=useState(''),autoReviewed=useRef('');
 const returnIntent=parseAdoptionPath(href('g/'+id)+'?'+query.toString(),locale);
 useEffect(()=>{setFlowId(returnIntent?.flowId??crypto.randomUUID())},[id,returnIntent?.flowId]);
 useEffect(()=>{
  if(!guide||guide.kind!=='itinerary'||!flowId)return;
  void trackPilotEvent({phase:'guide_viewed',guideId:id,flowId});
  if(query.get('adopt')==='1')void trackPilotEvent({phase:'started',guideId:id,flowId});
 },[id,guide?.kind,flowId]);
 const lock=useRef(false),intent=useRef<{desired:boolean;id:string}|null>(null),epoch=useRef(0),resumeCancelled=useRef(false);
 useEffect(()=>{
   epoch.current++;bookmarkRead.current.ticket++;bookmarkRead.current.loading=false;setBookmarkStatus('loading');setAccountValid(!!actorId);setList([]);setNext(null);setSaved(false);setSelected('');setPreview(null);setCreatedTrip(null);adoption.current=null;setRecovered(null);setAdoptionReady(false);autoReviewed.current='';intent.current=null;lock.current=false;setBusy(false);setMessage('');
  const invalidate=(nextOwner:string|null)=>{
   if(nextOwner===actorId)return;
    epoch.current++;bookmarkRead.current.ticket++;bookmarkRead.current.loading=false;setBookmarkStatus('loading');resumeCancelled.current=true;setAccountValid(false);setList([]);setNext(null);setSaved(false);setSelected('');setPreview(null);setCreatedTrip(null);adoption.current=null;setRecovered(null);setAdoptionReady(false);intent.current=null;lock.current=false;setBusy(false);
   setMessage(t('Account changed. Sign in or reload to continue.','帳戶已變更，請登入或重新載入以繼續。'));
   if(query.get('bookmark')==='1')router.replace(href('g/'+id));
   router.refresh();
  };
  const unsubscribe=subscribeAccountInvalidation(invalidate);
  const check=async()=>{if(document.visibilityState!=='visible'||!navigator.onLine)return;const generation=epoch.current;try{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(generation===epoch.current&&body.data?.id!==actorId)invalidate(body.data?.id??null)}catch{/* Foreground requests still verify the current account. */}};
  document.addEventListener('visibilitychange',check);
  return()=>{epoch.current++;unsubscribe();document.removeEventListener('visibilitychange',check)};
 },[id,actorId,router]);
 // A transient refresh failure must not discard a guide that is already published
 // on screen: that turned a flaky read into a dead end with no way back. Only a
 // genuine NOT_FOUND removes it.
 useEffect(()=>{let active=true;setGuide(initialGuide);setGuideFailed(false);void guides.get(id).then(r=>{if(!active)return;
  if(r.ok){setGuide(r.data);setGuideFailed(false)}
  else if(r.code==='NOT_FOUND'){setGuide(null);setGuideFailed(false);setMessage(t('Guide not found.','找不到攻略。'))}
  else {setGuideFailed(true);setMessage(t('Guide could not be loaded.','未能載入攻略。'))}
 });return()=>{active=false}},[id,initialGuide,guideAttempt]);
 useEffect(()=>{if(!actorId)return;let active=true;const generation=epoch.current;
  void loadBookmarkStatus(true);
  void trips.list(undefined,actorId!).then(r=>{if(active&&generation===epoch.current){if(r.ok){setList(previous=>[...r.data.items,...previous.filter(item=>!r.data.items.some(row=>row.id===item.id))]);setNext(r.data.nextCursor)}else setMessage(t('Your trips could not be loaded. Reload to retry.','未能載入你的行程，請重新載入以重試。'))}});
  return()=>{active=false};
 },[id,actorId]);
 useEffect(()=>{
  if(!actorId)return;let active=true;const generation=epoch.current;
  void (async()=>{try{
   await synchronizeAccountCache(actorId);
   const stored=await readPendingAdoption(actorId,id);
   if(!active||generation!==epoch.current)return;
    const creation=await readPendingCreation(actorId,id);
    if(!active||generation!==epoch.current)return;
    setCreatedTrip(creation?.intent??null);
   adoption.current=stored;setRecovered(stored);setSelected(stored?.tripId??returnIntent?.tripId??'');setAdoptionReady(true);
  }catch{if(active&&generation===epoch.current)setMessage(t('Application recovery could not be loaded. Reload before applying.','未能載入套用恢復資料，請重新載入後再套用。'))}})();
  return()=>{active=false};
 },[id,actorId]);
 useEffect(()=>{
  const target=returnIntent?.tripId,key=id+':'+target;
   if(!target||!adoptionReady||!guide||guide.kind!=='itinerary'||returnIntent?.version!==undefined&&returnIntent.version!==guide.version||adoption.current||!actorId||!accountValid||autoReviewed.current===key||lock.current)return;
  autoReviewed.current=key;void reviewAdoption(target);
 },[guide,adoptionReady,returnIntent?.tripId,actorId,accountValid]);
 async function loadBookmarkStatus(initial=false){
  if(!actorId||(!initial&&!accountValid)||intent.current||lock.current||bookmarkRead.current.loading)return;
  const generation=epoch.current,ticket=++bookmarkRead.current.ticket;bookmarkRead.current.loading=true;setBookmarkStatus('loading');
  const result=await bookmarks.list(actorId,undefined,id);if(generation!==epoch.current||ticket!==bookmarkRead.current.ticket)return;
  bookmarkRead.current.loading=false;
  if(result.ok){setSaved(result.data.items.some(row=>row.guide_id===id));setBookmarkStatus('ready')}
  else if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null);
  else setBookmarkStatus('error');
 }
 async function loadMore(){
  if(!actorId||!accountValid||!next||lock.current||adoption.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);
  const result=await trips.list(next,actorId!);if(generation!==epoch.current)return;
  if(result.ok){setList(previous=>[...previous,...result.data.items.filter(item=>!previous.some(row=>row.id===item.id))]);setNext(result.data.nextCursor);setMessage('')}
  else{setMessage(t('More trips could not be loaded. Retry.','未能載入更多行程，請重試。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null)}
  setBusy(false);lock.current=false;
 }
 async function toggle(desired:boolean,requestId?:string) {
  if(lock.current)return;
  if(!actorId||!accountValid){const next=href('g/'+id)+'?bookmark=1&requestId='+crypto.randomUUID();requestNavigation(href('sign-in')+'?next='+encodeURIComponent(next));return}
  const generation=epoch.current;bookmarkRead.current.ticket++;bookmarkRead.current.loading=false;lock.current=true;setBusy(true);if(intent.current?.desired!==desired)intent.current={desired,id:requestId??crypto.randomUUID()};
  const result=await bookmarks.toggle(id,desired,intent.current.id,actorId);if(generation!==epoch.current)return;
  if(result.ok){setSaved(result.data.saved);setBookmarkStatus('ready');intent.current=null;setMessage(result.data.saved?t('Bookmark saved to your account','收藏已保存至你的帳戶'):t('Bookmark removed from your account','已從你的帳戶取消收藏'));router.replace(returnIntent?adoptionPath(locale,id,returnIntent.tripId??undefined,flowId||undefined,returnIntent.version,returnIntent.creationId):href('g/'+id))}
  else{setMessage(t('Bookmark was not confirmed. Retry.','未確認收藏結果，請重試。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null)}
  setBusy(false);lock.current=false;
 }
 useEffect(()=>{if(actorId&&!resumeCancelled.current&&query.get('bookmark')==='1')void toggle(true,query.get('requestId')??undefined)},[actorId]);
 function startAdoption(){if(flowId)void trackPilotEvent({phase:'started',guideId:id,flowId})}
 async function reviewAdoption(tripId=selected){
  if(!guide||guide.kind!=='itinerary'||!actorId||!accountValid||!adoptionReady||!tripId||lock.current||adoption.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);setPreview(null);
  if(flowId)void trackPilotEvent({phase:'started',guideId:id,flowId});
  const result=await trips.get(tripId,actorId!);if(generation!==epoch.current)return;
  if(result.ok){setSelected(result.data.id);setList(previous=>previous.some(item=>item.id===result.data.id)?previous:[...previous,{id:result.data.id,title:result.data.title,revision:result.data.revision}]);setPreviewDays(guide.days);setPreview(adoptionPreview(guide,result.data));setMessage('')}
  else{setMessage(t('Current trip could not be loaded. No changes were applied.','未能載入目前行程，尚未套用任何更改。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null)}
  setBusy(false);lock.current=false;
 }
 async function confirmAdoption(){
  if((!preview&&!adoption.current)||!actorId||!accountValid||!adoptionReady||!flowId||lock.current)return;
  const generation=epoch.current,wasPending=adoption.current!==null;lock.current=true;setBusy(true);
  const command=adoption.current??{guideId:id,version:preview!.guideVersion,tripId:preview!.tripId,revision:preview!.revision,requestId:crypto.randomUUID(),flowId};
  try{await savePendingAdoption(actorId,command)}catch{
   if(generation!==epoch.current)return;
   setMessage(t('Application recovery could not be saved. Nothing was submitted; reload to recover any pending action.','未能保存套用恢復資料，尚未提交；請重新載入以恢復待確認操作。'));setBusy(false);lock.current=false;return;
  }
  if(generation!==epoch.current)return;
  adoption.current=command;
  const result=await trips.adopt(command.guideId,command.version,command.tripId,command.revision,command.requestId,command.flowId,actorId);if(generation!==epoch.current)return;
  if(result.ok){
    try{
     if(createdTrip?.tripId===command.tripId){await clearPendingCreation(actorId,id,createdTrip.requestId);if(generation!==epoch.current)return}
     await clearPendingAdoption(actorId,id,command.requestId);
    }catch{/* A retained original receipt can be replayed safely. */}
   if(generation!==epoch.current)return;
   setMessage(t('Itinerary applied to your private trip.','行程已套用至你的私人行程。'));requestNavigation(href('trips/'+result.data.id));
  }
  else if(!wasPending&&!result.retryable&&['CONFLICT','INVALID','NOT_FOUND','FORBIDDEN'].includes(result.code)){
   try{await clearPendingAdoption(actorId,id,command.requestId);if(generation!==epoch.current)return;adoption.current=null;setRecovered(null);setPreview(null)}
   catch{if(generation!==epoch.current)return;setMessage(t('The action ended, but its recovery record could not be cleared. Reload to retry the original action.','操作已終止，但未能清除恢復紀錄；請重新載入並重試原操作。'));setBusy(false);lock.current=false;return}
   setMessage(result.code==='CONFLICT'?t('Trip changed. Review the current version before applying.','行程已有變更，請核對目前版本後再套用。'):t('This application was refused. Your existing private trip is kept.','此套用已被拒絕，你現有的私人行程保留。'));
  }
  else{setRecovered(command);setMessage(t('Application was not confirmed. Retry the same action or check your trip.','未確認套用結果；請重試同一操作或檢查行程。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null)}
  if(generation!==epoch.current)return;
  setBusy(false);lock.current=false;
 }
  const creationNotice=createdTrip?.tripId&&actorId&&accountValid?<p role="status">{adoption.current?t('Your trip was created. The guide application is not confirmed; check the original action.','你的行程已建立，攻略套用結果尚未確認，請核對原操作。'):t('Your empty trip was created. No guide content is applied until you confirm.','你的空白行程已建立，確認前不會套用攻略內容。')} <Link href={href('trips/'+createdTrip.tripId)}>{t('Open your created trip','開啟已建立的行程')}</Link></p>:null;
  if(!guide)return <div className="k-page"><h1>{t('Published guide','已發布攻略')}</h1><p role={guideFailed?'alert':'status'}>{message||t('Loading…','載入中…')}</p>{creationNotice}{guideFailed&&<button className="k-btn" onClick={()=>setGuideAttempt(value=>value+1)}>{t('Retry guide','重試載入攻略')}</button>}</div>;
 return <div className="k-page"><Link href={href('explore')}>{t('Explore','探索')}</Link>{guideFailed&&<p role="alert">{t('Showing the last loaded version. Retry to refresh.','顯示上次載入的版本，請重試以重新載入。')} <button className="k-btn" onClick={()=>setGuideAttempt(value=>value+1)}>{t('Retry guide','重試載入攻略')}</button></p>}<PublicGuideContent guide={guide} locale={locale}/>
 <p className="k-muted">{t('Guide text is shown as published by its author.','攻略原文依作者發布內容顯示。')}</p>
 <p className="k-muted">{t('Original language: not provided.','原文語言：來源未提供。')}</p>
 <p className="k-muted">{t('Last updated: not provided.','最後更新：來源未提供。')}</p>
 <p className="k-muted">{t('Opening hours: not provided. Confirm before travelling.','營業時間：來源未提供，出發前請核實。')}</p>
 <p role="status" aria-label={t('Guide action status','攻略操作狀態')}>{message}</p>
 {actorId&&accountValid&&bookmarkStatus!=='ready'&&!intent.current?<>
  <p role={bookmarkStatus==='error'?'alert':'status'}>{bookmarkStatus==='error'?t('Bookmark status could not be loaded. Retry.','未能載入收藏狀態，請重試。'):t('Checking bookmark status…','正在核對收藏狀態…')}</p>
  {bookmarkStatus==='error'&&<button className="k-btn" disabled={busy} onClick={()=>void loadBookmarkStatus()}>{t('Retry bookmark status','重試載入收藏狀態')}</button>}
 </>:<button className="k-btn" disabled={busy} onClick={()=>void toggle(intent.current?.desired??!saved)}>{intent.current?(busy?t('Updating bookmark…','正在更新收藏…'):t('Retry bookmark change','重試收藏變更')):saved?t('Remove bookmark','取消收藏'):t('Bookmark guide','收藏攻略')}</button>}
 {guide.kind==='summary'?<><p>{t('This is a summary guide. It has no structured itinerary to apply.','這是摘要攻略，未提供可套用的結構化行程。')}</p><p>{t('Use this as inspiration, then add your own days and stops. Nothing is copied automatically.','把這份攻略作為靈感，再自行加入日期和站點；內容不會自動複製。')}</p><Link className="k-btn primary" href={href('trips')}>{t('Build your own itinerary','建立自己的行程')}</Link></>:<><p>v{guide.version}</p>
 {actorId&&accountValid?<>
  <label htmlFor={'guide-trip-'+id}>{t('Apply to a trip','套用至行程')}</label><select id={'guide-trip-'+id} value={selected} disabled={busy||!adoptionReady||!!adoption.current} onChange={e=>{setSelected(e.target.value);setPreview(null)}}><option value="">{t('Choose an existing trip','選擇現有行程')}</option>{list.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select>
  {next&&<button className="k-btn" disabled={busy||!!adoption.current} onClick={()=>void loadMore()}>{t('More trips','載入更多行程')}</button>}
   {creationNotice}
   {returnIntent?.version!==undefined&&returnIntent.version!==guide.version&&!preview&&<p role="status">{t('The source version changed. Review the current published version before confirming.','來源版本已有變更，確認前請重新核對目前已發布版本。')}</p>}
   <Link className="k-btn" onClick={startAdoption} href={recovered?href('trips/'+recovered.tripId):createdTrip?.tripId?adoptionPath(locale,id,createdTrip.tripId,createdTrip.flowId??undefined,createdTrip.version??undefined,createdTrip.requestId):href('trips')+'?next='+encodeURIComponent(adoptionPath(locale,id,undefined,flowId||undefined,guide.version))}>{recovered?t('Check private trip','檢查私人行程'):createdTrip?t('Resume your trip creation','繼續原建立行程操作'):t('Create a new trip and apply','建立新行程並採用')}</Link><button className="k-btn primary" disabled={busy||!adoptionReady||!selected||!!adoption.current} onClick={()=>void reviewAdoption()}>{t('Apply published itinerary','套用已發布行程')}</button>
  {recovered&&<section aria-label={t('Recover original application','恢復原套用操作')}><p>{t('An earlier application was not confirmed. Retry its original request or check the private trip before starting another.','較早的套用未獲確認；開始另一操作前，請重試原請求或檢查私人行程。')} v{recovered.version}</p><button className="k-btn primary" disabled={busy} onClick={()=>void confirmAdoption()}>{t('Retry original application','重試原套用操作')}</button><Link href={href('trips/'+recovered.tripId)}>{t('Check private trip','檢查私人行程')}</Link></section>}
  {preview&&<section data-testid="adoption-preview" aria-label={t('Review itinerary changes','核對行程更改')}><h2>{t('Review before applying','套用前核對')} · {preview.tripTitle}</h2>
   <p>{t('Target trip time zone','目標行程時區')}: {preview.tripTimezone}</p>
   <p>{t('Existing source versions','現有來源版本')}: {preview.existingVersions.length?preview.existingVersions.map(v=>'v'+v).join(', '):t('None','無')}</p><p>{t('Published version','已發布版本')}: v{preview.guideVersion}</p>
   <p>{t('Days','日數')}: {preview.daysBefore} → {preview.daysAfter}</p><p>{t('Stops added','新增站點')}: {preview.stopsAdded}</p><p>{t('Private notes retained','保留私人筆記')}: {preview.privateNotesKept}</p>
   <p>{t('This appends a separate authored copy. Existing days, source copies and your private notes stay in the trip.','此操作會加入獨立的作者行程副本，現有日程、來源副本及私人筆記會保留。')}</p>
   <ol>{previewDays.map(day=><li key={day.id}>{day.title}<ul>{day.stops.map(stop=><li key={stop.id}>{stop.title}<p>{stop.description}</p></li>)}</ul></li>)}</ol>
   <button className="k-btn primary" disabled={busy} onClick={()=>void confirmAdoption()}>{t('Confirm apply to this trip','確認套用至此行程')}</button>
    <button className="k-btn" disabled={busy} onClick={()=>{setPreview(null);if(adoption.current){setRecovered(adoption.current);setMessage(t('Application is not confirmed. Retry the original action or check your private trip.','尚未確認套用結果，請重試原操作或檢查私人行程。'))}else setMessage(t('Preview cancelled. No guide content was applied.','已取消預覽，未有套用攻略內容。'))}}>{t('Cancel preview','取消預覽')}</button>
  </section>}
  </>:<Link className="k-btn primary" onClick={startAdoption} href={href('sign-in')+'?next='+encodeURIComponent(adoptionPath(locale,id,undefined,flowId||undefined,guide.version))}>{t('Sign in to apply this itinerary','登入以套用此行程')}</Link>}{(!actorId||accountValid)&&<GuestPlanner key={guide.id+':'+(actorId??'guest')} guide={guide} actorId={actorId}/>}</>}
 </div>
}
export function BookmarkWorkspace({actorId}:{actorId:string|null}) {
 const {t,href}=useApp(),router=useRouter(),[rows,setRows]=useState<BookmarkRow[]|null>(null),[next,setNext]=useState<BookmarkCursor|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[accountValid,setAccountValid]=useState(!!actorId),epoch=useRef(0),lock=useRef(false),[removal,setRemoval]=useState<{guideId:string;requestId:string;busy:boolean}|null>(null),[removalError,setRemovalError]=useState(''),removalLock=useRef(false),validActor=useRef(!!actorId);
 useEffect(()=>{epoch.current++;validActor.current=!!actorId;removalLock.current=false;setRemoval(null);setRemovalError('');setAccountValid(!!actorId);setRows(null);setNext(null);setMessage('');setBusy(false);lock.current=false;
  const invalidate=(nextOwner:string|null)=>{if(nextOwner===actorId)return;epoch.current++;validActor.current=false;removalLock.current=false;setRemoval(null);setRemovalError('');setAccountValid(false);setRows(null);setNext(null);setMessage('');setBusy(false);lock.current=false;router.refresh()};
  const unsubscribe=subscribeAccountInvalidation(invalidate);
  const check=async()=>{if(document.visibilityState!=='visible'||!navigator.onLine)return;const generation=epoch.current;try{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(generation===epoch.current&&body.data?.id!==actorId)invalidate(body.data?.id??null)}catch{/* Foreground requests still verify the current account. */}};
  document.addEventListener('visibilitychange',check);return()=>{epoch.current++;unsubscribe();document.removeEventListener('visibilitychange',check)};
 },[actorId,router]);
 async function loadPage(cursor:BookmarkCursor|null,initial=false){
  if(!actorId||(!initial&&!accountValid)||lock.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);
  const result=await bookmarks.list(actorId,cursor??undefined);if(generation!==epoch.current)return;
  if(result.ok){setRows(previous=>cursor?[...(previous??[]),...result.data.items]:result.data.items);setNext(result.data.nextCursor);setMessage('')}
  else if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null);
  else setMessage(t('Bookmarks could not be loaded. Retry to continue.','未能載入收藏，請重試以繼續。'));
  lock.current=false;setBusy(false);
 }
 // A saved guide stays bookmarked even after its source is withdrawn, so the list
 // itself has to own the removal — otherwise those rows have no way out at all.
 // A retry of the same row reuses the original request id rather than issuing a
 // fresh command for a write whose outcome was never confirmed.
 async function removeBookmark(guideId:string){
  if(!actorId||!validActor.current||removalLock.current)return;
  removalLock.current=true;
  const generation=epoch.current,requestId=removal?.guideId===guideId?removal.requestId:crypto.randomUUID();
  setRemoval({guideId,requestId,busy:true});setRemovalError('');
  const result=await bookmarks.toggle(guideId,false,requestId,actorId!);if(generation!==epoch.current)return;
  removalLock.current=false;
  if(result.ok){setRows(previous=>(previous??[]).filter(row=>row.guide_id!==guideId));setRemoval(null)}
  else if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null);
  else {setRemoval({guideId,requestId,busy:false});setRemovalError(t('Bookmark could not be removed. Retry.','未能取消收藏，請重試。'))}
 }
 useEffect(()=>{if(actorId)void loadPage(null,true)},[actorId]);
 return <div className="k-page"><h1>{t('Your bookmarks','我的收藏')}</h1>{!actorId||!accountValid?<Link className="k-btn primary" href={href('sign-in')+'?next='+encodeURIComponent(href('saved'))}>{t('Sign in','登入')}</Link>:<>
  {message&&<><p role="alert">{message}</p><button className="k-btn" disabled={busy} onClick={()=>void loadPage(rows===null?null:next)}>{t('Retry bookmarks','重試載入收藏')}</button></>}
  {rows?<ul>{rows.map(row=><li key={row.guide_id}>{row.guides?<Link href={href('g/'+row.guide_id)}>{row.guides.title}</Link>:t('Source unavailable','來源未能提供')} <button className="k-btn" disabled={removal?.busy} onClick={()=>void removeBookmark(row.guide_id)}>{removal?.guideId===row.guide_id&&removalError?t('Retry removal','重試取消'):t('Remove bookmark','取消收藏')}</button></li>)}{!rows.length&&<li>{t('No bookmarks yet.','暫未有收藏。')}</li>}</ul>:!message&&<p role="status">{t('Loading…','載入中…')}</p>}
  {removalError&&<p role="alert">{removalError}</p>}
  {next&&!message&&<button className="k-btn" disabled={busy} onClick={()=>void loadPage(next)}>{t('More bookmarks','載入更多收藏')}</button>}
 </>}</div>
}
