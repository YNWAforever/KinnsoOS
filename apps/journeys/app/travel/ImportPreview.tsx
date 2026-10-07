'use client';
import {useLayoutEffect,useRef,useState} from 'react';import Link from 'next/link';
import * as demo from './model';import {useApp} from './ui';
import {previewLocalImport,type ImportPreview as Preview} from '../../lib/trips/import';
import {request} from '../../lib/trips/repository';import type {TripSnapshot} from '../../lib/contracts/trips';
import {readGuestTrips,restorableDeviceDrafts,type GuestTrip} from '../../lib/trips/guest-drafts';
import {GuestPlanner} from './GuestPlanner';
export function ImportPreview({actorId}:{actorId:string|null}) {
 const {t,href}=useApp(),[guests,setGuests]=useState<GuestTrip[]>([]),[candidates,setCandidates]=useState<demo.Trip[]>([]),[owner,setOwner]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const intent=useRef<{key:string;requestId:string}|null>(null);
 const [selectedDevice,setSelectedDevice]=useState<GuestTrip|null>(null),[editing,setEditing]=useState<GuestTrip|null>(null),[reading,setReading]=useState(false);
 const [editorActor,setEditorActor]=useState<string|null>(actorId),epoch=useRef(0),currentActor=useRef(actorId);
 useLayoutEffect(()=>{epoch.current++;currentActor.current=actorId;intent.current=null;setBusy(false);setGuests([]);setCandidates([]);setOwner('');setPreview(null);setSelectedDevice(null);setMessage('');return()=>{epoch.current++}},[actorId]);
 const needsResume=editing!==null&&editorActor!==actorId;
 const readLock=useRef(false),blocked=busy||reading||editing!==null;
 async function loadDevice(){
  if(readLock.current||busy||editing)return;const generation=epoch.current;readLock.current=true;setReading(true);
  try{const rows=await readGuestTrips(),valid=restorableDeviceDrafts(rows);if(generation!==epoch.current)return;setGuests(valid);setPreview(null);setSelectedDevice(null);setMessage(rows.length===valid.length?'':t('Some device copies could not be previewed. Original data is kept.','部分裝置副本未能預覽，原資料已保留。'))}
  catch{if(generation===epoch.current)setMessage(t('Device draft storage is unavailable.','裝置草稿無法讀取。'))}
  finally{readLock.current=false;setReading(false)}
 }
 function repaired(copy:GuestTrip){
  if(currentActor.current!==actorId||editorActor!==actorId)return;
  setGuests(rows=>rows.map(row=>row.id===copy.id&&row.ownerId===copy.ownerId?copy:row));setSelectedDevice(copy);setPreview(previewLocalImport(copy,copy.ownerId));setEditing(null);
  setMessage(t('Device draft saved. Review it before confirming account import.','裝置草稿已保存，請先核對，再確認匯入帳戶。'));
 }
 function load(){try{const store=demo.read();if(!store.session){setMessage(t('Open and export your own demo account first.','請先開啟及匯出你的示範帳戶。'));return}setOwner(store.session.id);setCandidates(demo.tripsFor(store).filter(trip=>trip.purpose==='personal'));setMessage('')}catch{setMessage(t('Local data needs recovery; it has not been replaced.','本機資料需要復原，原資料並未取代。'))}}
 return <section className="os-guide os-stop"><h2>{t('Preview and import local trips','預覽及匯入本機行程')}</h2><p>{t('Your original data stays on this device. Creator credit and business records are excluded.','原資料會保留於此裝置。創作者授權標識及商業紀錄不會匯入。')}</p><p>{t('Device drafts can be read by anyone using this browser. Only preview your own copies on a shared device.','此瀏覽器的使用者均可讀取裝置草稿。共用裝置上請只預覽自己的副本。')}</p><button className="k-btn" disabled={blocked} onClick={load}>{t('Preview this device’s current demo account','預覽此裝置目前的示範帳戶')}</button>
 <button className="k-btn" disabled={blocked} onClick={loadDevice}>{t('Preview device-only drafts','預覽裝置草稿')}</button><ul>{guests.map(trip=><li key={trip.id}><button className="k-btn" disabled={blocked} onClick={()=>{setSelectedDevice(trip);setPreview(previewLocalImport(trip,trip.ownerId));setMessage('')}}>{trip.title}</button></li>)}</ul><ul>{candidates.map(trip=><li key={trip.id}><button className="k-btn" disabled={blocked} onClick={()=>{setSelectedDevice(null);setPreview(previewLocalImport(trip,owner));setMessage('')}}>{trip.title}</button></li>)}</ul>
 {editing?<>{needsResume&&<div><p>{t('Your account changed. Device edits are still in this tab; choose to continue your own copy. Unsaved edits are not stored yet.','帳戶已改變，裝置修改仍在此頁。請選擇繼續編輯自己的副本；未保存的修改尚未寫入裝置。')}</p><button className="k-btn" onClick={()=>setEditorActor(actorId)}>{t('Continue editing this device draft','繼續編輯此裝置草稿')}</button></div>}<div hidden={needsResume}><GuestPlanner key={editing.ownerId+':'+editing.id} initialDraft={editing} actorId={actorId} onSaved={repaired}/></div></>:<>
 {selectedDevice&&<button className="k-btn" disabled={blocked} onClick={()=>{setEditorActor(actorId);setEditing(selectedDevice);setMessage('')}}>{t('Edit this saved device draft','編輯此已保存的裝置草稿')}</button>}
 {preview?.ok&&<div><p>{t('Local identity','本機身份')}: {preview.localOwnerId} · {preview.payload.title}</p><p>{preview.payload.days.length} {t('days','日')} · {preview.payload.pendingPhotos.length} {t('photos pending separate upload','張照片待另行上載')}</p><p>{t('Source credits will be unverified. The signed-in server account becomes the owner.','來源標識將視為未驗證。擁有人由已登入 server 帳戶決定。')}</p>
 {actorId?<button className="k-btn primary" disabled={blocked} onClick={async()=>{if(blocked)return;const generation=epoch.current;setBusy(true);const key=JSON.stringify(preview.payload);if(intent.current?.key!==key)intent.current={key,requestId:crypto.randomUUID()};const result=await request<TripSnapshot&{pendingPhotos:unknown[]}>('/api/trips/import','POST',{requestId:intent.current.requestId,sourceId:preview.sourceId,payload:preview.payload});if(generation!==epoch.current)return;if(result.ok){setMessage(result.data.pendingPhotos.length?t('Trip imported; photos are still pending. Original files are kept.','行程已匯入；照片仍待處理，原檔保留。'):t('Trip imported to your account.','行程已匯入你的帳戶。'));intent.current=null}else setMessage(result.code==='CONFLICT'?t('This source changed. Keep the original and review before retrying.','來源內容已有變更，請保留原資料並核對後重試。'):t('Import was not confirmed. Original data is kept.','未確認匯入完成，原資料保留。'));setBusy(false)}}>{t('Confirm import to this account','確認匯入此帳戶')}</button>:<Link className="k-btn primary" href={href('sign-in')+'?next='+encodeURIComponent(href('trips'))}>{t('Sign in and return to preview','登入後返回預覽')}</Link>}</div>}
 {preview&&!preview.ok&&<p role="alert">{preview.reason==='too_large'?t('This draft exceeds the account import limit. Shorten the notes before importing; the original device copy is kept.','此草稿超出帳戶匯入上限。請先縮短筆記再匯入，原裝置副本已保留。'):t('This local trip needs editing before it can be imported safely. Original data is kept.','此本機行程須先修改，才可安全匯入，原資料已保留。')}</p>}</>}<p role="status" aria-label={t('Local import status','本機匯入狀態')}>{message}</p></section>
}
