'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {normalizePhoto,uploadPhoto} from '../../lib/media/uploads';
import type {TripCommand} from '../../lib/contracts/trips';

export function RecordCapture({tripId,save,enabled}:{tripId:string;save:(command:TripCommand)=>Promise<boolean>;enabled:boolean}) {
 const {t}=useApp();
 const [file,setFile]=useState<File|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[attaching,setAttaching]=useState(false);
 const intent=useRef<{file:File;blob:Blob;requestId:string}|null>(null),lock=useRef(false),active=useRef<AbortController|null>(null),canCancel=useRef(false);
 useEffect(()=>()=>{active.current?.abort();active.current=null;lock.current=false;intent.current=null},[tripId,enabled]);
 async function upload(){
  if(!file||lock.current||!enabled)return;
  const controller=new AbortController();active.current=controller;lock.current=true;canCancel.current=true;setBusy(true);setAttaching(false);
  const current=()=>active.current===controller&&!controller.signal.aborted;
  const stopped=()=>t('Upload stopped; your original is kept. An accepted upload may remain private; retry the same photo to attach it.','上載已停止，原檔保留。已接收的上載可能仍留在私人儲存，請重試同一相片以附加至行程。');
  try{
   setMessage(t('Uploading — not yet saved','上載中 — 尚未保存'));
   if(intent.current?.file!==file){
    const blob=await normalizePhoto(file);if(!current())return;
    intent.current={file,blob,requestId:crypto.randomUUID()};
   }
   const result=await uploadPhoto(tripId,intent.current.blob,intent.current.requestId,controller.signal);if(!current())return;
   if(!result.ok)throw new Error(t('Upload was not confirmed. Retry; your original is kept.','未確認上載，請重試，原檔保留。'));
   // Once the atomic attach starts it cannot be cancelled or rolled back in the browser.
   canCancel.current=false;setAttaching(true);
   setMessage(t('Photo verified; attaching to trip…','照片已核實，正在附加至行程…'));
   const attached=await save({type:'attachMedia',mediaId:result.data.id,stopId:null});if(!current())return;
   setMessage(attached?t('Photo saved to your account','相片已保存至你的帳戶'):t('Photo upload verified; attaching was not confirmed. Retry the same photo.','照片上載已核實，但未確認附加成功；請重試同一相片。'));
  }catch(error){
   if(active.current===controller)setMessage(controller.signal.aborted?stopped():error instanceof Error?error.message:t('Upload failed; original is kept.','上載失敗，原檔保留。'));
  }finally{
   if(active.current===controller){if(controller.signal.aborted)setMessage(stopped());active.current=null;canCancel.current=false;setBusy(false);setAttaching(false);lock.current=false}
  }
 }
 if(!enabled)return <p>{t('Private photo upload is currently unavailable. Keep your original files.','私人相片上載目前未接通，請保留原檔。')}</p>;
 return <section className="os-guide os-stop"><h2>{t('Keep a private photo','記錄私人相片')}</h2><p>{t('JPEG, PNG or WebP · up to 10 MiB. EXIF location is removed. HEIC needs conversion first.','JPEG、PNG 或 WebP · 最多 10 MiB。會移除 EXIF 位置，HEIC 請先轉換。')}</p>
  <label>{t('Photo','相片')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);intent.current=null;setMessage('')}}/></label>
  <button className="k-btn primary" disabled={busy||!file} onClick={()=>void upload()}>{t('Upload private photo','上載私人相片')}</button>
  {busy&&<button className="k-btn" disabled={attaching} onClick={()=>{if(canCancel.current)active.current?.abort()}}>{t('Cancel upload','取消上載')}</button>}
  <p role="status">{message}</p></section>;
}
