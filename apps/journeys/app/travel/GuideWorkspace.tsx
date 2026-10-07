'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {guides} from '../../lib/guides/repository';
import {adoptionPreview} from '../../lib/guides/adoption-preview';
import {bookmarks,type BookmarkCursor,type BookmarkRow} from '../../lib/bookmarks/repository';
import {trips} from '../../lib/trips/repository';
import {invalidateAccountViews,subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import type {PublicGuide} from '../../lib/seo/public-guide';
import {useApp} from './ui';
import {GuestPlanner} from './GuestPlanner';
import {PublicGuideContent} from '../../lib/seo/PublicGuideContent';
import {useDraftNavigation} from './UnsavedDraftGuard';
export function GuideWorkspace({id,actorId,initialGuide=null}:{id:string;actorId:string|null;initialGuide?:PublicGuide|null}) {
 const requestNavigation=useDraftNavigation();
 const {t,href}=useApp(),router=useRouter(),query=useSearchParams(),[guide,setGuide]=useState<PublicGuide|null>(initialGuide),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[list,setList]=useState<{id:string;title:string;revision:number}[]>([]),[selected,setSelected]=useState('');
 const [preview,setPreview]=useState<ReturnType<typeof adoptionPreview>>(null),[accountValid,setAccountValid]=useState(!!actorId),[next,setNext]=useState<string|null>(null);
 const [bookmarkStatus,setBookmarkStatus]=useState<'loading'|'ready'|'error'>('loading'),bookmarkRead=useRef({ticket:0,loading:false});
 const adoption=useRef<{key:string;id:string;revision:number}|null>(null);
 const lock=useRef(false),intent=useRef<{desired:boolean;id:string}|null>(null),epoch=useRef(0),resumeCancelled=useRef(false);
 useEffect(()=>{
  epoch.current++;bookmarkRead.current.ticket++;bookmarkRead.current.loading=false;setBookmarkStatus('loading');setAccountValid(!!actorId);setList([]);setNext(null);setSaved(false);setSelected('');setPreview(null);adoption.current=null;intent.current=null;lock.current=false;setBusy(false);setMessage('');
  const invalidate=(nextOwner:string|null)=>{
   if(nextOwner===actorId)return;
   epoch.current++;bookmarkRead.current.ticket++;bookmarkRead.current.loading=false;setBookmarkStatus('loading');resumeCancelled.current=true;setAccountValid(false);setList([]);setNext(null);setSaved(false);setSelected('');setPreview(null);adoption.current=null;intent.current=null;lock.current=false;setBusy(false);
   setMessage(t('Account changed. Sign in or reload to continue.','帳戶已變更，請登入或重新載入以繼續。'));
   if(query.get('bookmark')==='1')router.replace(href('g/'+id));
   router.refresh();
  };
  const unsubscribe=subscribeAccountInvalidation(invalidate);
  const check=async()=>{if(document.visibilityState!=='visible'||!navigator.onLine)return;const generation=epoch.current;try{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(generation===epoch.current&&body.data?.id!==actorId)invalidate(body.data?.id??null)}catch{}};
  document.addEventListener('visibilitychange',check);
  return()=>{epoch.current++;unsubscribe();document.removeEventListener('visibilitychange',check)};
 },[id,actorId,router]);
 useEffect(()=>{let active=true;setGuide(initialGuide);void guides.get(id).then(r=>{if(active){if(r.ok)setGuide(r.data);else {setGuide(null);setMessage(r.code==='NOT_FOUND'?t('Guide not found.','找不到攻略。'):t('Guide could not be loaded.','未能載入攻略。'))}}});return()=>{active=false}},[id,initialGuide]);
 useEffect(()=>{if(!actorId)return;let active=true;const generation=epoch.current;
  void loadBookmarkStatus(true);
  void trips.list().then(r=>{if(active&&generation===epoch.current){if(r.ok){setList(r.data.items);setNext(r.data.nextCursor)}else setMessage(t('Your trips could not be loaded. Reload to retry.','未能載入你的行程，請重新載入以重試。'))}});
  return()=>{active=false};
 },[id,actorId]);
 async function loadBookmarkStatus(initial=false){
  if(!actorId||(!initial&&!accountValid)||intent.current||lock.current||bookmarkRead.current.loading)return;
  const generation=epoch.current,ticket=++bookmarkRead.current.ticket;bookmarkRead.current.loading=true;setBookmarkStatus('loading');
  const result=await bookmarks.list(undefined,id);if(generation!==epoch.current||ticket!==bookmarkRead.current.ticket)return;
  bookmarkRead.current.loading=false;
  if(result.ok){setSaved(result.data.items.some(row=>row.guide_id===id));setBookmarkStatus('ready')}
  else if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null);
  else setBookmarkStatus('error');
 }
 async function loadMore(){
  if(!actorId||!accountValid||!next||lock.current||adoption.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);
  const result=await trips.list(next);if(generation!==epoch.current)return;
  if(result.ok){setList(previous=>[...previous,...result.data.items]);setNext(result.data.nextCursor);setMessage('')}
  else{setMessage(t('More trips could not be loaded. Retry.','未能載入更多行程，請重試。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null)}
  setBusy(false);lock.current=false;
 }
 async function toggle(desired:boolean,requestId?:string) {
  if(lock.current)return;
  if(!actorId||!accountValid){const next=href('g/'+id)+'?bookmark=1&requestId='+crypto.randomUUID();requestNavigation(href('sign-in')+'?next='+encodeURIComponent(next));return}
  const generation=epoch.current;bookmarkRead.current.ticket++;bookmarkRead.current.loading=false;lock.current=true;setBusy(true);if(intent.current?.desired!==desired)intent.current={desired,id:requestId??crypto.randomUUID()};
  const result=await bookmarks.toggle(id,desired,intent.current.id);if(generation!==epoch.current)return;
  if(result.ok){setSaved(result.data.saved);setBookmarkStatus('ready');intent.current=null;setMessage(t('Bookmark saved to your account','收藏已保存至你的帳戶'));router.replace(href('g/'+id))}
  else{setMessage(t('Bookmark was not confirmed. Retry.','未確認收藏結果，請重試。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null)}
  setBusy(false);lock.current=false;
 }
 useEffect(()=>{if(actorId&&!resumeCancelled.current&&query.get('bookmark')==='1')void toggle(true,query.get('requestId')??undefined)},[actorId]);
 async function reviewAdoption(){
  if(!guide||guide.kind!=='itinerary'||!actorId||!accountValid||!selected||lock.current||adoption.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);setPreview(null);
  const result=await trips.get(selected);if(generation!==epoch.current)return;
  if(result.ok){setPreview(adoptionPreview(guide,result.data));setMessage('')}
  else{setMessage(t('Current trip could not be loaded. No changes were applied.','未能載入目前行程，尚未套用任何更改。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null)}
  setBusy(false);lock.current=false;
 }
 async function confirmAdoption(){
  if(!preview||!actorId||!accountValid||lock.current)return;
  const generation=epoch.current,key=id+':'+preview.guideVersion+':'+preview.tripId;lock.current=true;setBusy(true);
  if(adoption.current?.key!==key)adoption.current={key,id:crypto.randomUUID(),revision:preview.revision};
  const result=await trips.adopt(id,preview.guideVersion,preview.tripId,adoption.current.revision,adoption.current.id);if(generation!==epoch.current)return;
  if(result.ok)requestNavigation(href('trips/'+result.data.id));
  else if(result.code==='CONFLICT'){adoption.current=null;setPreview(null);setMessage(t('Trip changed. Review the current version before applying.','行程已有變更，請核對目前版本後再套用。'))}
  else{setMessage(t('Application was not confirmed. Retry the same action or check your trip.','未確認套用結果；請重試同一操作或檢查行程。'));if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null)}
  setBusy(false);lock.current=false;
 }
 if(!guide)return <div className="k-page"><h1>{t('Published guide','已發布攻略')}</h1><p role="status">{message||t('Loading…','載入中…')}</p></div>;
 return <div className="k-page"><Link href={href('explore')}>{t('Explore','探索')}</Link><PublicGuideContent guide={guide}/>
 <p className="k-muted">{t('Guide text is shown as published by its author.','攻略原文依作者發布內容顯示。')}</p>
 <p className="k-muted">{t('Last updated: not provided.','最後更新：來源未提供。')}</p>
 <p className="k-muted">{t('Opening hours: not provided. Confirm before travelling.','營業時間：來源未提供，出發前請核實。')}</p>
 <p role="status" aria-label={t('Guide action status','攻略操作狀態')}>{message}</p>
 {actorId&&accountValid&&bookmarkStatus!=='ready'&&!intent.current?<>
  <p role={bookmarkStatus==='error'?'alert':'status'}>{bookmarkStatus==='error'?t('Bookmark status could not be loaded. Retry.','未能載入收藏狀態，請重試。'):t('Checking bookmark status…','正在核對收藏狀態…')}</p>
  {bookmarkStatus==='error'&&<button className="k-btn" disabled={busy} onClick={()=>void loadBookmarkStatus()}>{t('Retry bookmark status','重試載入收藏狀態')}</button>}
 </>:<button className="k-btn" disabled={busy} onClick={()=>void toggle(intent.current?.desired??!saved)}>{intent.current?(busy?t('Updating bookmark…','正在更新收藏…'):t('Retry bookmark change','重試收藏變更')):saved?t('Remove bookmark','取消收藏'):t('Bookmark guide','收藏攻略')}</button>}
 {guide.kind==='summary'?<><p>{t('This is a summary guide. It has no structured itinerary to apply.','這是摘要攻略，未提供可套用的結構化行程。')}</p></>:<><p>v{guide.version}</p>
 {actorId&&accountValid?<>
  <label htmlFor={'guide-trip-'+id}>{t('Apply to a trip','套用至行程')}</label><select id={'guide-trip-'+id} value={selected} disabled={busy||!!adoption.current} onChange={e=>{setSelected(e.target.value);setPreview(null)}}><option value="">{t('Choose an existing trip','選擇現有行程')}</option>{list.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select>
  {next&&<button className="k-btn" disabled={busy||!!adoption.current} onClick={()=>void loadMore()}>{t('More trips','載入更多行程')}</button>}
  <Link href={href('trips')}>{t('Create a trip first','先建立行程')}</Link><button className="k-btn primary" disabled={busy||!selected||!!adoption.current} onClick={()=>void reviewAdoption()}>{t('Apply published itinerary','套用已發布行程')}</button>
  {preview&&<section data-testid="adoption-preview" aria-label={t('Review itinerary changes','核對行程更改')}><h2>{t('Review before applying','套用前核對')} · {preview.tripTitle}</h2>
   <p>{t('Existing source versions','現有來源版本')}: {preview.existingVersions.length?preview.existingVersions.map(v=>'v'+v).join(', '):t('None','無')}</p><p>{t('Published version','已發布版本')}: v{preview.guideVersion}</p>
   <p>{t('Days','日數')}: {preview.daysBefore} → {preview.daysAfter}</p><p>{t('Stops added','新增站點')}: {preview.stopsAdded}</p><p>{t('Private notes retained','保留私人筆記')}: {preview.privateNotesKept}</p>
   <p>{t('This appends a separate authored copy. Existing days, source copies and your private notes stay in the trip.','此操作會加入獨立的作者行程副本，現有日程、來源副本及私人筆記會保留。')}</p>
   <button className="k-btn primary" disabled={busy} onClick={()=>void confirmAdoption()}>{t('Confirm apply to this trip','確認套用至此行程')}</button>
  </section>}
 </>:null}{(!actorId||accountValid)&&<GuestPlanner key={guide.id+':'+(actorId??'guest')} guide={guide} actorId={actorId}/>}</>}
 </div>
}
export function BookmarkWorkspace({actorId}:{actorId:string|null}) {
 const {t,href}=useApp(),router=useRouter(),[rows,setRows]=useState<BookmarkRow[]|null>(null),[next,setNext]=useState<BookmarkCursor|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[accountValid,setAccountValid]=useState(!!actorId),epoch=useRef(0),lock=useRef(false);
 useEffect(()=>{epoch.current++;setAccountValid(!!actorId);setRows(null);setNext(null);setMessage('');setBusy(false);lock.current=false;
  const invalidate=(nextOwner:string|null)=>{if(nextOwner===actorId)return;epoch.current++;setAccountValid(false);setRows(null);setNext(null);setMessage('');setBusy(false);lock.current=false;router.refresh()};
  const unsubscribe=subscribeAccountInvalidation(invalidate);
  const check=async()=>{if(document.visibilityState!=='visible'||!navigator.onLine)return;const generation=epoch.current;try{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)return;const body=await response.json();if(generation===epoch.current&&body.data?.id!==actorId)invalidate(body.data?.id??null)}catch{}};
  document.addEventListener('visibilitychange',check);return()=>{epoch.current++;unsubscribe();document.removeEventListener('visibilitychange',check)};
 },[actorId,router]);
 async function loadPage(cursor:BookmarkCursor|null,initial=false){
  if(!actorId||(!initial&&!accountValid)||lock.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);
  const result=await bookmarks.list(cursor??undefined);if(generation!==epoch.current)return;
  if(result.ok){setRows(previous=>cursor?[...(previous??[]),...result.data.items]:result.data.items);setNext(result.data.nextCursor);setMessage('')}
  else if(result.code==='AUTH_REQUIRED')invalidateAccountViews(null);
  else setMessage(t('Bookmarks could not be loaded. Retry to continue.','未能載入收藏，請重試以繼續。'));
  lock.current=false;setBusy(false);
 }
 useEffect(()=>{if(actorId)void loadPage(null,true)},[actorId]);
 return <div className="k-page"><h1>{t('Your bookmarks','我的收藏')}</h1>{!actorId||!accountValid?<Link className="k-btn primary" href={href('sign-in')+'?next='+encodeURIComponent(href('saved'))}>{t('Sign in','登入')}</Link>:<>
  {message&&<><p role="alert">{message}</p><button className="k-btn" disabled={busy} onClick={()=>void loadPage(rows===null?null:next)}>{t('Retry bookmarks','重試載入收藏')}</button></>}
  {rows?<ul>{rows.map(row=><li key={row.guide_id}>{row.guides?<Link href={href('g/'+row.guide_id)}>{row.guides.title}</Link>:t('Source unavailable','來源未能提供')}</li>)}{!rows.length&&<li>{t('No bookmarks yet.','暫未有收藏。')}</li>}</ul>:!message&&<p role="status">{t('Loading…','載入中…')}</p>}
  {next&&!message&&<button className="k-btn" disabled={busy} onClick={()=>void loadPage(next)}>{t('More bookmarks','載入更多收藏')}</button>}
 </>}</div>
}
