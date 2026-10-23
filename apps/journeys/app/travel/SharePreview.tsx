'use client';
import {useEffect,useRef,useState} from 'react';
import {sharing,type ShareMetadata,type ShareIntent,type ShareReceipt,type ShareReceiptRow,type ShareReceiptCursor,type ShareReceiptPage} from '../../lib/trips/sharing';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import type {TripSnapshot,PublicTripProjection} from '../../lib/contracts/trips';
import {useApp} from './ui';

type PendingShare=({version:1}&Omit<ShareIntent,'requestId'>)|({version:2}&ShareIntent);
type Share={id:string;url:string;projection:PublicTripProjection};
type ReadState='loading'|'ready'|'read-error';
type View={selected:string[];media:string[];share:Share|null;receipt:ShareReceipt|null;links:ShareMetadata[];read:ReadState;rows:ShareReceiptRow[];rowsRead:ReadState;nextCursor:ShareReceiptCursor|null;receiptError:boolean;busy:boolean;held:boolean;pending:PendingShare|null;recoveryReady:boolean;message:string};
type Scope={tripId:string;enabled:boolean;recoveryEnabled:boolean;active:boolean;invalidated:boolean;lifetime:number;reading:boolean;readVersion:number;rowsReading:boolean;rowsVersion:number;rowsCursor:ShareReceiptCursor|undefined;receiptVersion:number;revokeId:string|null;view:View};
// Keep one slot per trip so old v1 holds cannot be bypassed by a new storage key.
// The record version distinguishes a manual hold from a replayable v2 intent.
const recoveryKey=(tripId:string)=>'kinnso:unconfirmed-share:v1:'+tripId.toLowerCase();
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const sameUuid=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
// SQL timestamptz can use offsets and microseconds. Preserve sub-millisecond
// differences while accepting equivalent spellings of the original JS instant.
const sameDate=(a:string,b:string)=>Date.parse(a)===Date.parse(b)&&
 (a.match(/\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/i)?.[1]??'').slice(3).replace(/0+$/,'')===(b.match(/\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/i)?.[1]??'').slice(3).replace(/0+$/,'');
const ids=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(uuid)&&new Set(value.map(id=>id.toLowerCase())).size===value.length;
const sameIds=(a:string[],b:string[])=>a.length===b.length&&a.every((id,i)=>sameUuid(id,b[i]));
const sameIntent=(a:ShareIntent,b:ShareIntent)=>sameUuid(a.requestId,b.requestId)&&sameUuid(a.tripId,b.tripId)&&sameDate(a.expiresAt,b.expiresAt)&&sameIds(a.stopIds,b.stopIds)&&sameIds(a.mediaIds,b.mediaIds);
const intentOf=(pending:PendingShare):ShareIntent=>{
 if(pending.version!==2)throw Error('Manual share recovery');
 return {requestId:pending.requestId,tripId:pending.tripId,stopIds:[...pending.stopIds],mediaIds:[...pending.mediaIds],expiresAt:pending.expiresAt};
};
function validIntent(value:unknown):value is ShareIntent {
 return record(value)&&uuid(value.requestId)&&uuid(value.tripId)&&ids(value.stopIds)&&ids(value.mediaIds)&&date(value.expiresAt);
}
function validRow(value:unknown):value is ShareReceiptRow&Record<string,unknown> {
 return record(value)&&uuid(value.requestId)&&uuid(value.id)&&date(value.createdAt)&&date(value.expiresAt)&&typeof value.state==='string'&&['active','revoked','expired'].includes(value.state);
}
function validPage(value:unknown):value is ShareReceiptPage {
 if(!record(value)||!Array.isArray(value.items)||value.items.length>20||!value.items.every(validRow)||new Set(value.items.map(row=>row.requestId.toLowerCase())).size!==value.items.length)return false;
 if(value.nextCursor===null)return true;
 const cursor=value.nextCursor,last=value.items.at(-1);
 return value.items.length===20&&record(cursor)&&date(cursor.createdAt)&&uuid(cursor.requestId)&&!!last&&last.createdAt===cursor.createdAt&&last.requestId===cursor.requestId;
}
function publicProjection(value:unknown,intent:ShareIntent):PublicTripProjection|null {
 if(!record(value)||typeof value.title!=='string'||!Array.isArray(value.days)||!ids(value.approvedMediaIds)||value.approvedMediaIds.some(id=>!intent.mediaIds.some(selected=>sameUuid(selected,id))))return null;
 const days:PublicTripProjection['days']=[];
 for(const day of value.days){
  if(!record(day)||!uuid(day.id)||!Number.isInteger(day.offset)||typeof day.title!=='string'||!Array.isArray(day.stops))return null;
  const stops:PublicTripProjection['days'][number]['stops']=[];
  for(const stop of day.stops){
   if(!record(stop)||!uuid(stop.id)||!intent.stopIds.some(selected=>sameUuid(selected,stop.id as string))||(stop.placeId!==null&&!uuid(stop.placeId))||typeof stop.title!=='string'||typeof stop.description!=='string'||!Number.isInteger(stop.position)||
    !(stop.startMinuteOfDay===null||Number.isInteger(stop.startMinuteOfDay))||!(stop.durationMinutes===null||Number.isInteger(stop.durationMinutes)))return null;
   let source:PublicTripProjection['days'][number]['stops'][number]['source']=null;
   if(stop.source!==null){
    const credit=stop.source;
    if(!record(credit)||!uuid(credit.guideId)||!Number.isInteger(credit.guideVersion)||(credit.creatorId!==null&&!uuid(credit.creatorId))||typeof credit.creatorName!=='string'||!(credit.canonicalUrl===null||typeof credit.canonicalUrl==='string')||typeof credit.withdrawn!=='boolean')return null;
    source={guideId:credit.guideId,guideVersion:credit.guideVersion as number,creatorId:credit.creatorId,creatorName:credit.creatorName,canonicalUrl:credit.canonicalUrl,withdrawn:credit.withdrawn};
   }
   stops.push({id:stop.id,placeId:stop.placeId,title:stop.title,position:stop.position as number,startMinuteOfDay:stop.startMinuteOfDay as number|null,durationMinutes:stop.durationMinutes as number|null,description:stop.description,source});
  }
  days.push({id:day.id,offset:day.offset as number,title:day.title,stops});
 }
 // Explicit public fields also keep unexpected private extras out of the preview.
 return {title:value.title,days,approvedMediaIds:[...value.approvedMediaIds]};
}
function matchingReceipt(value:unknown,tripId:string,requestId:string,pending:PendingShare|null,row?:ShareReceiptRow):ShareReceipt|null {
 if(!validRow(value)||!record(value)||!validIntent(value.intent)||!sameUuid(value.requestId,requestId)||!sameUuid(value.intent.requestId,requestId)||!sameUuid(value.intent.tripId,tripId)||!sameDate(value.expiresAt,value.intent.expiresAt))return null;
 if(pending?.version===2&&!sameIntent(value.intent,pending))return null;
 if(row&&(!sameUuid(value.id,row.id)||!sameDate(value.createdAt,row.createdAt)||!sameDate(value.expiresAt,row.expiresAt)))return null;
 if(value.state==='active'){
  if(typeof value.url!=='string'||!value.url||Date.parse(value.expiresAt)<=Date.now())return null;
  try{const url=new URL(value.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;}catch{return null;}
 }else if(value.url!==null)return null;
 const projection=publicProjection(value.projection,value.intent);if(!projection)return null;
 return {requestId:value.requestId,id:value.id,createdAt:value.createdAt,expiresAt:value.expiresAt,state:value.state,intent:{requestId:value.intent.requestId,tripId:value.intent.tripId,stopIds:[...value.intent.stopIds],mediaIds:[...value.intent.mediaIds],expiresAt:value.intent.expiresAt},projection,url:value.url as string|null};
}
function newScope(tripId:string,enabled:boolean,recoveryEnabled:boolean):Scope {
 return {tripId,enabled,recoveryEnabled,active:false,invalidated:false,lifetime:0,reading:false,readVersion:0,rowsReading:false,rowsVersion:0,rowsCursor:undefined,receiptVersion:0,revokeId:null,
  view:{selected:[],media:[],share:null,receipt:null,links:[],read:'loading',rows:[],rowsRead:'loading',nextCursor:null,receiptError:false,busy:false,held:false,pending:null,recoveryReady:false,message:''}};
}
function pendingRecord(raw:string,tripId:string):PendingShare {
 const value:unknown=JSON.parse(raw);
 if(!record(value)||![1,2].includes(value.version as number)||(typeof value.tripId!=='string'||!sameUuid(value.tripId,tripId))||!Array.isArray(value.stopIds)||!value.stopIds.every(id=>typeof id==='string')||!Array.isArray(value.mediaIds)||!value.mediaIds.every(id=>typeof id==='string')||!date(value.expiresAt))throw Error('Invalid share recovery');
 if(value.version===2){if(!validIntent(value))throw Error('Invalid share intent');return {version:2,requestId:value.requestId,tripId:value.tripId,stopIds:[...value.stopIds],mediaIds:[...value.mediaIds],expiresAt:value.expiresAt};}
 return {version:1,tripId:value.tripId,stopIds:[...value.stopIds] as string[],mediaIds:[...value.mediaIds] as string[],expiresAt:value.expiresAt};
}
const samePending=(a:PendingShare,b:PendingShare)=>a.version===2&&b.version===2?sameIntent(a,b):a.version===b.version&&sameUuid(a.tripId,b.tripId)&&sameDate(a.expiresAt,b.expiresAt)&&sameIds(a.stopIds,b.stopIds)&&sameIds(a.mediaIds,b.mediaIds);

export function SharePreview({trip,enabled,recoveryEnabled=false}:{trip:TripSnapshot;enabled:boolean;recoveryEnabled?:boolean}) {
 const {t,href}=useApp();
 const live=useRef<Scope>(newScope(trip.id,enabled,recoveryEnabled));
 const held=useRef(new Map<string,PendingShare>());
 if(live.current.tripId!==trip.id||live.current.enabled!==enabled||live.current.recoveryEnabled!==recoveryEnabled){
  const previous=live.current;previous.active=false;
  live.current=newScope(trip.id,enabled,recoveryEnabled);
  if(sameUuid(previous.tripId,trip.id)&&!previous.invalidated)live.current.revokeId=previous.revokeId;
 }
 const scope=live.current;
 const [rendered,setRendered]=useState({scope,value:scope.view});
 const view=rendered.scope===scope?rendered.value:scope.view;
 const lifetime=scope.lifetime;
 const owns=(generation=scope.lifetime)=>live.current===scope&&scope.active&&!scope.invalidated&&scope.enabled&&scope.lifetime===generation;
 const ownsRecovery=(generation=scope.lifetime)=>owns(generation)&&scope.recoveryEnabled;
 function show(patch:Partial<View>){
  if(live.current!==scope||!scope.active)return;
  scope.view={...scope.view,...patch};setRendered({scope,value:scope.view});
 }
 function readRecovery(force=false){
  if(scope.view.recoveryReady&&!force)return;
  try{
   const remembered=held.current.get(recoveryKey(scope.tripId)),raw=window.sessionStorage.getItem(recoveryKey(scope.tripId));
   const stored=raw===null?undefined:pendingRecord(raw,scope.tripId);
   if(remembered&&stored&&!samePending(remembered,stored))throw Error('Changed share hold');
   const pending=remembered??stored;
   if(pending){held.current.set(recoveryKey(scope.tripId),pending);show({pending,held:true,selected:[...pending.stopIds],media:[...pending.mediaIds]});}
   show({recoveryReady:true,message:''});
  }catch{show({recoveryReady:false,message:t('Share recovery could not be read. Creation stays blocked. Refresh existing links and contact support for manual recovery.','未能讀取分享復原資料，建立功能繼續鎖定。請重新整理現有連結，並聯絡支援作手動復原。')});}
 }
 async function loadLinks(){
  const generation=scope.lifetime;
  if(!owns(generation)||scope.reading||scope.view.busy)return;
  scope.reading=true;const version=++scope.readVersion;
  show({read:'loading'});readRecovery();
  try{
   const result=await sharing.list(scope.tripId);
   if(!owns(generation)||version!==scope.readVersion)return;
   if(!result.ok||!Array.isArray(result.data)||result.data.some(row=>!row||typeof row.id!=='string'||!date(row.createdAt)||!date(row.expiresAt))){show({read:'read-error'});return;}
   show({links:result.data,read:'ready'});
  }catch{if(owns(generation)&&version===scope.readVersion)show({read:'read-error'});}
  finally{if(owns(generation)&&version===scope.readVersion)scope.reading=false;}
 }
 async function loadReceipts(cursor?:ShareReceiptCursor,expectedVersion=scope.rowsVersion){
  const generation=scope.lifetime;
  if(!ownsRecovery(generation)||expectedVersion!==scope.rowsVersion||scope.rowsReading||scope.view.busy)return;
  scope.rowsReading=true;scope.rowsCursor=cursor;const version=++scope.rowsVersion;
  show({rowsRead:'loading'});
  try{
   const result=await sharing.receipts(scope.tripId,cursor);
   if(!ownsRecovery(generation)||version!==scope.rowsVersion)return;
   if(!result.ok||!validPage(result.data)||cursor&&result.data.items.some(row=>scope.view.rows.some(old=>sameUuid(old.requestId,row.requestId)))){show({rowsRead:'read-error'});return;}
   // Copy only metadata. A list response never authorizes a URL or settles a hold.
   const rows=result.data.items.map(row=>({requestId:row.requestId,id:row.id,createdAt:row.createdAt,expiresAt:row.expiresAt,state:row.state}));
   show({rows:cursor?[...scope.view.rows,...rows]:rows,nextCursor:result.data.nextCursor,rowsRead:'ready'});
  }catch{if(ownsRecovery(generation)&&version===scope.rowsVersion)show({rowsRead:'read-error'});}
  finally{if(ownsRecovery(generation)&&version===scope.rowsVersion)scope.rowsReading=false;}
 }
 useEffect(()=>{
  scope.active=true;scope.lifetime++;show({busy:false});
  const unsubscribe=subscribeAccountInvalidation(()=>{
   if(live.current!==scope||!scope.active)return;
   scope.invalidated=true;scope.readVersion++;scope.rowsVersion++;scope.receiptVersion++;
   show({selected:[],media:[],share:null,receipt:null,links:[],rows:[],pending:null,message:''});
  });
  if(enabled){void loadLinks();if(recoveryEnabled)void loadReceipts();}
  return()=>{scope.active=false;scope.readVersion++;scope.rowsVersion++;scope.receiptVersion++;scope.reading=false;scope.rowsReading=false;unsubscribe();};
 },[scope]);
 const sourcesReady=()=>scope.view.read==='ready'&&scope.view.rowsRead==='ready'&&scope.view.recoveryReady;
 const editable=()=>ownsRecovery()&&sourcesReady()&&!scope.view.receiptError&&!scope.view.busy&&!scope.view.held&&!scope.view.share&&!scope.revokeId;
 function choose(kind:'selected'|'media',id:string,checked:boolean){
  if(!ownsRecovery(lifetime)||!editable())return;
  const values=scope.view[kind],chosen=checked?Array.from(new Set([...values,id])):values.filter(value=>value!==id);
  show(kind==='selected'?{selected:chosen}:{media:chosen});
 }
 function settleReceipt(receipt:ShareReceipt){
  const pending=scope.view.pending;let cleared=!scope.view.held;
  if(pending?.version===2&&sameIntent(receipt.intent,pending)){
   try{
    const raw=window.sessionStorage.getItem(recoveryKey(scope.tripId));
    if(raw!==null&&!samePending(pending,pendingRecord(raw,scope.tripId)))throw Error('Changed share hold');
    window.sessionStorage.removeItem(recoveryKey(scope.tripId));held.current.delete(recoveryKey(scope.tripId));cleared=true;
   }catch{}
  }
  show({receipt,share:receipt.state==='active'?{id:receipt.id,url:receipt.url!,projection:receipt.projection}:null,held:!cleared,pending:cleared?null:pending,receiptError:false,
   ...!pending?{selected:[...receipt.intent.stopIds],media:[...receipt.intent.mediaIds]}:{},
   message:!cleared?t('Receipt read, but the recovery hold remains. Contact support before creating another link.','已讀取分享記錄，但復原鎖定仍然保留。建立其他連結前請聯絡支援。'):receipt.state==='active'?t('Read-only link recovered','已取回唯讀連結'):receipt.state==='revoked'?t('This share is revoked. Its link cannot be recovered.','此分享已撤銷，無法取回連結。'):t('This share is expired. Its link cannot be recovered.','此分享已到期，無法取回連結。')});
 }
 async function dispatch(pending:PendingShare,generation:number){
  if(pending.version!==2||!ownsRecovery(generation))return;
  show({busy:true,held:true,pending,message:''});
  // Retry persists and sends exactly this intent, including its original expiry.
  try{
   const raw=window.sessionStorage.getItem(recoveryKey(scope.tripId));
   if(raw!==null&&!samePending(pending,pendingRecord(raw,scope.tripId)))throw Error('Changed share hold');
   window.sessionStorage.setItem(recoveryKey(scope.tripId),JSON.stringify(pending));
  }catch{show({busy:false,message:t('Recovery storage is unavailable. No new share request was sent. Creation stays blocked; contact support for manual recovery.','復原儲存空間無法使用，未送出新的分享請求。建立功能繼續鎖定，請聯絡支援作手動復原。')});return;}
  try{
   const result=await sharing.create(intentOf(pending));
   if(!ownsRecovery(generation))return;
   const receipt=result.ok?matchingReceipt(result.data,scope.tripId,pending.requestId,pending):null;
   if(receipt)settleReceipt(receipt);
   else show({message:t('Share creation is unconfirmed. Read its receipt or retry only the same request.','建立分享的結果未確認。請讀取分享記錄，或只重試同一請求。')});
  }catch{if(ownsRecovery(generation))show({message:t('Share creation is unconfirmed. Read its receipt or retry only the same request.','建立分享的結果未確認。請讀取分享記錄，或只重試同一請求。')});}
  finally{if(ownsRecovery(generation)){show({busy:false});if(scope.view.held)void loadLinks();}}
 }
 async function create(){
  if(!ownsRecovery(lifetime)||!editable())return;
  readRecovery(true);if(!editable())return;
  let pending:PendingShare;
  try{pending={version:2,requestId:crypto.randomUUID(),tripId:scope.tripId,stopIds:[...scope.view.selected],mediaIds:[...scope.view.media],expiresAt:new Date(Date.now()+7*86400000-10000).toISOString()};}
  catch{show({recoveryReady:false,message:t('Share recovery is unavailable. Creation stays blocked; contact support.','分享復原無法使用，建立功能繼續鎖定，請聯絡支援。')});return;}
  held.current.set(recoveryKey(scope.tripId),pending);await dispatch(pending,lifetime);
 }
 const canRetry=(pending:PendingShare|null)=>ownsRecovery()&&sourcesReady()&&!scope.view.busy&&!scope.view.share&&!scope.revokeId&&pending?.version===2&&scope.view.pending===pending;
 async function retrySame(pending:PendingShare){
  if(!ownsRecovery(lifetime)||!canRetry(pending))return;
  await dispatch(pending,lifetime);
 }
 const canReadReceipt=()=>ownsRecovery()&&scope.view.recoveryReady&&!scope.view.busy&&!scope.revokeId;
 async function readReceipt(pending:PendingShare|null,row?:ShareReceiptRow,version=scope.rowsVersion){
  const generation=lifetime;
  if(!ownsRecovery(generation)||!canReadReceipt()||pending&&scope.view.pending!==pending)return;
  if(row&&(scope.view.rowsRead!=='ready'||version!==scope.rowsVersion||!scope.view.rows.includes(row)||scope.view.pending?.version===2&&!sameUuid(scope.view.pending.requestId,row.requestId)))return;
  const requestId=row?.requestId??(pending?.version===2?pending.requestId:null);if(!requestId)return;
  const requestVersion=++scope.receiptVersion;show({busy:true,message:''});
  try{
   const result=await sharing.receipt(scope.tripId,requestId);
   if(!ownsRecovery(generation)||requestVersion!==scope.receiptVersion||row&&version!==scope.rowsVersion)return;
   const receipt=result.ok?matchingReceipt(result.data,scope.tripId,requestId,scope.view.pending,row):null;
   if(receipt)settleReceipt(receipt);
   else show({receiptError:true,message:t('Receipt could not be confirmed. The outcome stays unknown and creation stays blocked. Read again or retry only the held request.','未能確認分享記錄，結果仍未知，建立功能繼續鎖定。請再次讀取，或只重試已鎖定的同一請求。')});
  }catch{if(ownsRecovery(generation)&&requestVersion===scope.receiptVersion)show({receiptError:true,message:t('Receipt could not be read. Creation stays blocked; the original request is retained.','未能讀取分享記錄，建立功能繼續鎖定，原來請求仍然保留。')});}
  finally{if(ownsRecovery(generation)&&requestVersion===scope.receiptVersion)show({busy:false});}
 }
 async function revoke(id:string){
  const generation=lifetime,current=scope.view;
  if(!owns(generation)||current.read!=='ready'||current.busy||(scope.revokeId&&!sameUuid(scope.revokeId,id))||!(!!current.share&&sameUuid(current.share.id,id)||current.links.some(row=>sameUuid(row.id,id))||!!scope.revokeId&&sameUuid(scope.revokeId,id)))return;
  scope.revokeId=id;show({busy:true});
  try{
   const result=await sharing.revoke(id);if(!owns(generation))return;
   if(result.ok){
    scope.revokeId=null;
    show({share:!!scope.view.share&&sameUuid(scope.view.share.id,id)?null:scope.view.share,receipt:!!scope.view.receipt&&sameUuid(scope.view.receipt.id,id)?{...scope.view.receipt,state:'revoked',url:null}:scope.view.receipt,links:scope.view.links.filter(row=>!sameUuid(row.id,id)),rows:scope.view.rows.map(row=>sameUuid(row.id,id)?{...row,state:'revoked'}:row),message:t('Share revoked','已撤銷分享')});
   }else show({message:t('Revocation is unconfirmed. Refresh owned links and retry this same revocation.','撤銷結果未確認，請重新整理所屬連結，並重試撤銷同一連結。')});
  }catch{if(owns(generation))show({message:t('Revocation is unconfirmed. Refresh owned links and retry this same revocation.','撤銷結果未確認，請重新整理所屬連結，並重試撤銷同一連結。')});}
  finally{if(owns(generation)){show({busy:false});void loadLinks();}}
 }
 async function copy(share:Share){
  const generation=lifetime;if(!ownsRecovery(generation)||scope.view.busy||scope.view.share!==share)return;
  try{await navigator.clipboard.writeText(share.url);if(ownsRecovery(generation)&&scope.view.share===share)show({message:t('Copied link','已複製連結')});}
  catch{if(ownsRecovery(generation)&&scope.view.share===share)show({message:t('Select and copy the link above.','請選取並複製上方連結。')});}
 }
 if(!enabled)return <p>{t('Read-only sharing is currently unavailable.','唯讀分享目前尚未接通。')}</p>;
 if(scope.invalidated)return <p role="status">{t('Account changed. Reload your authorized trip before sharing.','帳戶已改變，請重新載入獲授權行程後再分享。')}</p>;
 const retryRevokeId=scope.revokeId,pending=view.pending,rowsVersion=scope.rowsVersion;
 const canEdit=editable(),canRevoke=(id:string)=>owns()&&view.read==='ready'&&!view.busy&&(!scope.revokeId||sameUuid(scope.revokeId,id));
 return <section className="os-guide os-stop">
  <h2>{t('Read-only share preview','唯讀分享預覽')}</h2>
  <p>{t('Choose titles and photos. Private notes, receipts and account information are excluded. Links expire in 7 days; downloaded copies cannot be recalled.','選擇站點名稱及照片。私人筆記、收據及帳戶資料不會分享。連結 7 日後到期；已下載的副本無法收回。')}</p>
  {!recoveryEnabled&&<p role="status">{t('Share recovery is currently unavailable. Creating links and reading receipts are blocked. Existing links can still be refreshed and revoked.','分享復原目前無法使用，建立連結及讀取分享記錄功能繼續鎖定。你仍可重新整理及撤銷現有連結。')}</p>}
  {trip.days.flatMap(day=>day.stops).map(stop=><label key={stop.id}><input type="checkbox" disabled={!canEdit} checked={view.selected.some(id=>sameUuid(id,stop.id))} onChange={event=>choose('selected',stop.id,event.target.checked)}/>{stop.title}</label>)}
  {trip.media.filter(item=>item.state==='ready').map(item=><label key={item.id}><input type="checkbox" disabled={!canEdit} checked={view.media.some(id=>sameUuid(id,item.id))} onChange={event=>choose('media',item.id,event.target.checked)}/>{t('Private photo','私人相片')} {item.id.slice(0,8)}</label>)}
  {!view.share?<button className="k-btn" disabled={!canEdit} onClick={create}>{t('Create read-only link','建立唯讀連結')}</button>:<>
   <label>{t('Share link','分享連結')}<input readOnly value={view.share.url}/></label>
   <button className="k-btn" disabled={view.busy} onClick={()=>copy(view.share!)}>{t('Copy link','複製連結')}</button>
   <button className="k-btn" disabled={!canRevoke(view.share.id)} onClick={()=>revoke(view.share!.id)}>{t('Revoke link','撤銷連結')}</button>
   <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(view.share.projection,null,2)}</pre>
  </>}
  {view.receipt&&view.receipt.state!=='active'&&<p role="status">{view.receipt.state==='revoked'?t('Share receipt: revoked. No link is available.','分享記錄：已撤銷，沒有可用連結。'):t('Share receipt: expired. No link is available.','分享記錄：已到期，沒有可用連結。')}</p>}
  {view.held&&<div role="status">
   <p>{t('An earlier share request is held because its outcome or recovery is unknown. Its original selection and expiry are kept. A missing link does not prove creation failed; refreshing or revoking a listed link will not release this request.','較早的分享請求因結果或復原狀態未知而繼續鎖定，原來選項及到期時間已保留。找不到連結不代表建立失敗；重新整理或撤銷已列出的連結不會解除此請求。')}</p>
   {pending&&<p>{t('Original request expiry','原請求到期時間')}: <time dateTime={pending.expiresAt}>{pending.expiresAt}</time></p>}
   {pending?.version===2&&recoveryEnabled?<>
    <p>{t('Read the original receipt, or retry this exact request with the same selection and expiry. A missing receipt never releases the request.','請讀取原分享記錄，或使用完全相同的選項及到期時間重試同一請求。找不到記錄不會解除鎖定。')}</p>
    <button className="k-btn" disabled={!canReadReceipt()} onClick={()=>readReceipt(pending)}>{t('Read request receipt','讀取原請求記錄')}</button>
    <button className="k-btn" disabled={!canRetry(pending)} onClick={()=>retrySame(pending)}>{t('Retry original request','重試原來請求')}</button>
   </>:<p>{t('This request requires manual recovery. Refresh owned links and revoke links you no longer want. Contact support before creating another link.','此請求需要手動復原。請重新整理所屬連結，並撤銷不再需要的連結。建立其他連結前請聯絡支援。')}</p>}
   <a href={href('support')}>{t('Contact support','聯絡支援')}</a>
  </div>}
  {scope.revokeId&&<div role="status">
   <p>{t('The earlier revocation remains unconfirmed. A refresh does not confirm its result. Retry only this same owned link, or contact support for manual recovery.','較早的撤銷結果仍未確認，重新整理不代表已確認結果。請只重試撤銷同一所屬連結，或聯絡支援作手動復原。')}</p>
   <button className="k-btn" disabled={!canRevoke(scope.revokeId)} onClick={()=>{if(retryRevokeId)void revoke(retryRevokeId);}}>{t('Retry revoking same link','重試撤銷同一連結')}</button>
  </div>}
  <h3>{t('Existing active links','現有有效連結')}</h3>
  <p>{t('Legacy links retain revocation controls. Recoverable receipt links are listed separately below.','舊連結仍可撤銷；可復原分享記錄的連結另列於下方。')}</p>
  <p role="status">{view.read==='loading'?t('Loading existing links…','正在載入現有連結…'):view.read==='read-error'?t('Could not load existing links. Their current state is unknown; creation and revocation stay blocked until a successful read.','未能載入現有連結。目前狀態未知，成功讀取前建立及撤銷功能繼續鎖定。'):t('Existing links loaded.','已載入現有連結。')}</p>
  <button className="k-btn" disabled={view.busy||view.read==='loading'} onClick={loadLinks}>{view.read==='read-error'?t('Retry loading links','重試載入連結'):t('Refresh existing links','重新整理現有連結')}</button>
  {view.read==='ready'&&view.links.length===0&&<p>{t('No active links were returned by this read.','此次讀取沒有傳回有效連結。')}</p>}
  <ul>{view.links.filter(row=>row.id!==view.share?.id).map(row=><li key={row.id}>{t('Expires','到期')} <time dateTime={row.expiresAt}>{row.expiresAt}</time> <button className="k-btn" disabled={!canRevoke(row.id)} onClick={()=>revoke(row.id)}>{t('Revoke existing link','撤銷現有連結')}</button></li>)}</ul>
  {recoveryEnabled&&<>
   <h3>{t('Recent share receipts','最近的分享記錄')}</h3>
   <p>{t('This list shows metadata only, 20 recent receipts per page. Recover a selected active link or view its terminal receipt. Load older receipts explicitly.','此清單只顯示資料摘要，每頁最多 20 筆最近記錄。請選擇取回有效連結或檢視已結束的分享記錄，並按需要載入較舊記錄。')}</p>
   <p role="status">{view.rowsRead==='loading'?t('Loading receipts…','正在載入分享記錄…'):view.rowsRead==='read-error'?t('Could not load receipts. Their state is unknown; creation stays blocked.','未能載入分享記錄。目前狀態未知，建立功能繼續鎖定。'):t('Receipt metadata loaded.','已載入分享記錄摘要。')}</p>
   <button className="k-btn" disabled={view.busy||view.rowsRead==='loading'} onClick={()=>loadReceipts(view.rowsRead==='read-error'?scope.rowsCursor:undefined,rowsVersion)}>{view.rowsRead==='read-error'?t('Retry loading receipts','重試載入分享記錄'):t('Refresh receipts','重新整理分享記錄')}</button>
   <ul>{view.rows.map(row=><li key={row.requestId}>
    <span style={{overflowWrap:'anywhere'}}>{t('Request','請求')} {row.requestId}</span>{' '}<time dateTime={row.createdAt}>{row.createdAt}</time> — {row.state==='active'?t('Active','有效'):row.state==='revoked'?t('Revoked','已撤銷'):t('Expired','已到期')}; {t('Expires','到期')} <time dateTime={row.expiresAt}>{row.expiresAt}</time>{' '}
    <button className="k-btn" disabled={!canReadReceipt()||view.rowsRead!=='ready'||pending?.version===2&&!sameUuid(pending.requestId,row.requestId)} onClick={()=>readReceipt(null,row,rowsVersion)}>{row.state==='active'?t('Recover link','取回連結'):t('View receipt','檢視分享記錄')}</button>
   </li>)}</ul>
   {view.nextCursor&&<button className="k-btn" disabled={view.busy||view.rowsRead!=='ready'} onClick={()=>loadReceipts(view.nextCursor!,rowsVersion)}>{t('Load older receipts','載入較舊分享記錄')}</button>}
  </>}
  <p role="status">{view.message}</p>
 </section>;
}
