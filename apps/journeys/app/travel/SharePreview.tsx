'use client';
import {useEffect,useRef,useState} from 'react';
import {sharing,type ShareMetadata} from '../../lib/trips/sharing';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import type {TripSnapshot,PublicTripProjection} from '../../lib/contracts/trips';
import {useApp} from './ui';

type PendingShare={tripId:string;stopIds:string[];mediaIds:string[];expiresAt:string};
type Share={id:string;url:string;projection:PublicTripProjection};
type View={selected:string[];media:string[];share:Share|null;links:ShareMetadata[];read:'loading'|'ready'|'read-error';busy:boolean;held:boolean;pending:PendingShare|null;recoveryReady:boolean;message:string};
type Scope={tripId:string;enabled:boolean;active:boolean;invalidated:boolean;lifetime:number;reading:boolean;readVersion:number;revokeId:string|null;view:View};
const recoveryKey=(tripId:string)=>'kinnso:unconfirmed-share:v1:'+tripId;
function newScope(tripId:string,enabled:boolean):Scope {
 return {tripId,enabled,active:false,invalidated:false,lifetime:0,reading:false,readVersion:0,revokeId:null,
  view:{selected:[],media:[],share:null,links:[],read:'loading',busy:false,held:false,pending:null,recoveryReady:false,message:''}};
}
function pendingRecord(raw:string,tripId:string):PendingShare {
 const record=JSON.parse(raw);
 if(record.version!==1||record.tripId!==tripId||!Array.isArray(record.stopIds)||!record.stopIds.every((id:unknown)=>typeof id==='string')||
  !Array.isArray(record.mediaIds)||!record.mediaIds.every((id:unknown)=>typeof id==='string')||typeof record.expiresAt!=='string'||!Number.isFinite(Date.parse(record.expiresAt)))throw Error('Invalid share recovery');
 return {tripId,stopIds:record.stopIds,mediaIds:record.mediaIds,expiresAt:record.expiresAt};
}

export function SharePreview({trip,enabled}:{trip:TripSnapshot;enabled:boolean}) {
 const {t,href}=useApp();
 const live=useRef<Scope>(newScope(trip.id,enabled));
 // Retain an unresolved trip's intent even when this mounted surface changes trips.
 const held=useRef(new Map<string,PendingShare>());
 if(live.current.tripId!==trip.id||live.current.enabled!==enabled){
  live.current.active=false;
  live.current=newScope(trip.id,enabled);
 }
 const scope=live.current;
 const [rendered,setRendered]=useState({scope,value:scope.view});
 const view=rendered.scope===scope?rendered.value:scope.view;
 const lifetime=scope.lifetime;
 const owns=(generation=scope.lifetime)=>live.current===scope&&scope.active&&!scope.invalidated&&scope.enabled&&scope.lifetime===generation;
 function show(patch:Partial<View>){
  if(live.current!==scope||!scope.active)return;
  scope.view={...scope.view,...patch};setRendered({scope,value:scope.view});
 }
 function readRecovery(force=false){
  if(scope.view.recoveryReady&&!force)return;
  try{
   let pending=held.current.get(scope.tripId);
   if(!pending){const raw=window.sessionStorage.getItem(recoveryKey(scope.tripId));if(raw!==null)pending=pendingRecord(raw,scope.tripId);}
   if(pending){held.current.set(scope.tripId,pending);show({pending,held:true,selected:[...pending.stopIds],media:[...pending.mediaIds]});}
   show({recoveryReady:true,message:''});
  }catch{
   show({recoveryReady:false,message:t('Share recovery could not be read. Creation stays blocked. Refresh existing links and contact support for manual recovery.','未能讀取分享復原資料，建立功能繼續鎖定。請重新整理現有連結，並聯絡支援作手動復原。')});
  }
 }
 async function loadLinks(){
  if(!owns()||scope.reading||scope.view.busy)return;
  scope.reading=true;const version=++scope.readVersion;
  show({read:'loading'});readRecovery();
  try{
   const result=await sharing.list(scope.tripId);
   if(!owns()||version!==scope.readVersion)return;
   if(!result.ok||!Array.isArray(result.data)||result.data.some(row=>!row||typeof row.id!=='string'||typeof row.createdAt!=='string'||typeof row.expiresAt!=='string')){
    show({read:'read-error'});return;
   }
   show({links:result.data,read:'ready'});
  }catch{if(owns()&&version===scope.readVersion)show({read:'read-error'});}
  finally{if(owns()&&version===scope.readVersion)scope.reading=false;}
 }
 useEffect(()=>{
  scope.active=true;scope.lifetime++;show({busy:false});
  // The parent mounts this surface only with its authorized trip snapshot.
  // Invalidate synchronously on every account lifecycle event, before parent teardown.
  const unsubscribe=subscribeAccountInvalidation(()=>{
   if(live.current!==scope||!scope.active)return;
   scope.invalidated=true;scope.readVersion++;
   show({selected:[],media:[],share:null,links:[],pending:null,message:''});
  });
  if(enabled)void loadLinks();
  return()=>{scope.active=false;scope.readVersion++;scope.reading=false;unsubscribe();};
 },[scope]);
 const editable=()=>owns()&&scope.view.read==='ready'&&scope.view.recoveryReady&&!scope.view.busy&&!scope.view.held&&!scope.view.share&&!scope.revokeId;
 function choose(kind:'selected'|'media',id:string,checked:boolean){
  if(!owns(lifetime)||!editable())return;
  const values=scope.view[kind];
  const chosen=checked?Array.from(new Set([...values,id])):values.filter(value=>value!==id);
  show(kind==='selected'?{selected:chosen}:{media:chosen});
 }
 async function create(){
  const generation=lifetime;
  if(!owns(lifetime)||!editable())return;
  readRecovery(true);if(!editable())return;
  const pending:PendingShare={tripId:scope.tripId,stopIds:[...scope.view.selected],mediaIds:[...scope.view.media],expiresAt:new Date(Date.now()+7*86400000-10000).toISOString()};
  held.current.set(scope.tripId,pending);
  show({busy:true,held:true,pending,message:''});
  // This is only a local hold, never a client-invented replay/receipt field.
  // Persist before sending: an unreadable/unwritable hold cannot authorize a POST.
  try{window.sessionStorage.setItem(recoveryKey(scope.tripId),JSON.stringify({version:1,...pending}));}
  catch{
   show({busy:false,message:t('Recovery storage is unavailable. No new share request was sent. Creation stays blocked; contact support for manual recovery.','復原儲存空間無法使用，未送出新的分享請求。建立功能繼續鎖定，請聯絡支援作手動復原。')});
   return;
  }
  try{
   const result=await sharing.create(pending.tripId,pending.stopIds,pending.mediaIds,pending.expiresAt);
   if(!owns(generation))return;
   if(result.ok&&result.data&&typeof result.data.id==='string'&&result.data.id&&typeof result.data.url==='string'&&result.data.url&&result.data.projection&&Array.isArray(result.data.projection.days)&&Array.isArray(result.data.projection.approvedMediaIds)){
    let cleared=false;
    try{window.sessionStorage.removeItem(recoveryKey(scope.tripId));held.current.delete(scope.tripId);cleared=true;}catch{}
    show({share:result.data,held:!cleared,pending:cleared?null:pending,message:cleared?t('Read-only link created','已建立唯讀連結'):t('Link created, but the recovery hold could not be cleared. Keep this link and contact support before creating another.','連結已建立，但未能清除復原鎖定。請保留此連結，並在建立其他連結前聯絡支援。')});
   }else show({message:t('Share creation is unconfirmed. Do not send another creation request.','建立分享的結果未確認，請勿再次送出建立請求。')});
  }catch{if(owns(generation))show({message:t('Share creation is unconfirmed. Do not send another creation request.','建立分享的結果未確認，請勿再次送出建立請求。')});}
  finally{
   if(owns(generation)){show({busy:false});if(scope.view.held)void loadLinks();}
  }
 }
 async function revoke(id:string){
  const generation=lifetime;
  const current=scope.view;
  if(!owns(generation)||current.read!=='ready'||current.busy||(scope.revokeId&&scope.revokeId!==id)||
   !(current.share?.id===id||current.links.some(row=>row.id===id)||scope.revokeId===id))return;
  scope.revokeId=id;show({busy:true});
  try{
   const result=await sharing.revoke(id);
   if(!owns(generation))return;
   if(result.ok){
    scope.revokeId=null;
    show({share:scope.view.share?.id===id?null:scope.view.share,links:scope.view.links.filter(row=>row.id!==id),message:t('Share revoked','已撤銷分享')});
   }else show({message:t('Revocation is unconfirmed. Refresh owned links and retry this same revocation.','撤銷結果未確認，請重新整理所屬連結，並重試撤銷同一連結。')});
  }catch{if(owns(generation))show({message:t('Revocation is unconfirmed. Refresh owned links and retry this same revocation.','撤銷結果未確認，請重新整理所屬連結，並重試撤銷同一連結。')});}
  finally{if(owns(generation)){show({busy:false});void loadLinks();}}
 }
 async function copy(share:Share){
  const generation=lifetime;
  if(!owns(generation)||scope.view.busy||scope.view.share!==share)return;
  try{await navigator.clipboard.writeText(share.url);if(owns(generation)&&scope.view.share===share)show({message:t('Copied link','已複製連結')});}
  catch{if(owns(generation)&&scope.view.share===share)show({message:t('Select and copy the link above.','請選取並複製上方連結。')});}
 }
 if(!enabled)return <p>{t('Read-only sharing is currently unavailable.','唯讀分享目前尚未接通。')}</p>;
 if(scope.invalidated)return <p role="status">{t('Account changed. Reload your authorized trip before sharing.','帳戶已改變，請重新載入獲授權行程後再分享。')}</p>;
 const retryRevokeId=scope.revokeId;
 const canEdit=editable(),canRevoke=(id:string)=>owns()&&view.read==='ready'&&!view.busy&&(!scope.revokeId||scope.revokeId===id);
 return <section className="os-guide os-stop">
  <h2>{t('Read-only share preview','唯讀分享預覽')}</h2>
  <p>{t('Choose titles and photos. Private notes, receipts and account information are excluded. Links expire in 7 days; downloaded copies cannot be recalled.','選擇站點名稱及照片。私人筆記、收據及帳戶資料不會分享。連結 7 日後到期；已下載的副本無法收回。')}</p>
  {trip.days.flatMap(day=>day.stops).map(stop=><label key={stop.id}><input type="checkbox" disabled={!canEdit} checked={view.selected.includes(stop.id)} onChange={event=>choose('selected',stop.id,event.target.checked)}/>{stop.title}</label>)}
  {trip.media.filter(item=>item.state==='ready').map(item=><label key={item.id}><input type="checkbox" disabled={!canEdit} checked={view.media.includes(item.id)} onChange={event=>choose('media',item.id,event.target.checked)}/>{t('Private photo','私人相片')} {item.id.slice(0,8)}</label>)}
  {!view.share?<button className="k-btn" disabled={!canEdit} onClick={create}>{t('Create read-only link','建立唯讀連結')}</button>:<>
   <label>{t('Share link','分享連結')}<input readOnly value={view.share.url}/></label>
   <button className="k-btn" disabled={view.busy} onClick={()=>copy(view.share!)}>{t('Copy link','複製連結')}</button>
   <button className="k-btn" disabled={!canRevoke(view.share.id)} onClick={()=>revoke(view.share!.id)}>{t('Revoke link','撤銷連結')}</button>
   <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(view.share.projection,null,2)}</pre>
  </>}
  {view.held&&<div role="status">
   <p>{t('An earlier share request is held because its outcome or recovery is unknown. Its original selection and expiry are kept. A missing link does not prove creation failed; refreshing or revoking a listed link will not release this request.','較早的分享請求因結果或復原狀態未知而繼續鎖定，原來選項及到期時間已保留。找不到連結不代表建立失敗；重新整理或撤銷已列出的連結不會解除此請求。')}</p>
   {view.pending&&<p>{t('Original request expiry','原請求到期時間')}: <time dateTime={view.pending.expiresAt}>{view.pending.expiresAt}</time></p>}
   <p>{t('Refresh existing owned links below and revoke links you no longer want. Tokens are shown only once and cannot be recovered here. Do not create again in another tab. Contact support for manual recovery before creating another link.','請在下方重新整理現有所屬連結，並撤銷不再需要的連結。token 只顯示一次，此處無法取回。請勿在其他分頁再次建立；建立其他連結前請聯絡支援作手動復原。')} <a href={href('support')}>{t('Contact support','聯絡支援')}</a></p>
  </div>}
  {scope.revokeId&&<div role="status">
   <p>{t('The earlier revocation remains unconfirmed. A refresh does not confirm its result. Retry only this same owned link, or contact support for manual recovery.','較早的撤銷結果仍未確認，重新整理不代表已確認結果。請只重試撤銷同一所屬連結，或聯絡支援作手動復原。')}</p>
   <button className="k-btn" disabled={!canRevoke(scope.revokeId)} onClick={()=>{if(retryRevokeId)void revoke(retryRevokeId);}}>{t('Retry revoking same link','重試撤銷同一連結')}</button>
  </div>}
  <h3>{t('Existing active links','現有有效連結')}</h3>
  <p>{t('Link tokens are shown once. Reloading retains revocation controls.','連結 token 只顯示一次；重新載入後仍可撤銷。')}</p>
  <p role="status">{view.read==='loading'?t('Loading existing links…','正在載入現有連結…'):view.read==='read-error'?t('Could not load existing links. Their current state is unknown; creation and revocation stay blocked until a successful read.','未能載入現有連結。目前狀態未知，成功讀取前建立及撤銷功能繼續鎖定。'):t('Existing links loaded.','已載入現有連結。')}</p>
  <button className="k-btn" disabled={view.busy||view.read==='loading'} onClick={loadLinks}>{view.read==='read-error'?t('Retry loading links','重試載入連結'):t('Refresh existing links','重新整理現有連結')}</button>
  {view.read==='ready'&&view.links.length===0&&<p>{t('No active links were returned by this read.','此次讀取沒有傳回有效連結。')}</p>}
  <ul>{view.links.filter(row=>row.id!==view.share?.id).map(row=><li key={row.id}>{t('Expires','到期')} <time dateTime={row.expiresAt}>{row.expiresAt}</time> <button className="k-btn" disabled={!canRevoke(row.id)} onClick={()=>revoke(row.id)}>{t('Revoke existing link','撤銷現有連結')}</button></li>)}</ul>
  <p role="status">{view.message}</p>
 </section>;
}
