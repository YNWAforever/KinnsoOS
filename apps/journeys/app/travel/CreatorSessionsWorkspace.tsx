'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp} from './ui';

type SessionItem={id:string;slug:string;title:string;description:string;type:string;startsAt:string;durationMinutes:number;status:string;embedUrl:string|null;replayUrl:string|null;destinationTags:string[];createdAt:string;updatedAt:string};
type Draft={title:string;description:string;type:string;startsAt:string;durationMinutes:string;embedUrl:string;replayUrl:string;destinationTags:string};
const empty:Draft={title:'',description:'',type:'destination_briefing',startsAt:'',durationMinutes:'45',embedUrl:'',replayUrl:'',destinationTags:''};
const types=['destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function CreatorSessionsWorkspace({actorId,enabled,path}:{actorId:string|null;enabled:boolean;path:string}){
 const{locale,t,href}=useApp(),match=path.match(/^studio\/sessions\/([^/]+)\/edit$/),editId=match&&uuid.test(match[1])?match[1]:null;
 const creating=path==='studio/sessions/new',listMode=!creating&&!editId;
 const[valid,setValid]=useState(true),[items,setItems]=useState<SessionItem[]|null>(null),[current,setCurrent]=useState<SessionItem|null>(null),[draft,setDraft]=useState<Draft>(empty),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false);
 const generation=useRef(0),intent=useRef<{signature:string;requestId:string;body:string;url:string;method:string}|null>(null);
 const returnPath='/'+locale+'/studio/sessions';
 useEffect(()=>{setValid(true);const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){generation.current++;setValid(false);setItems(null);setCurrent(null);setDraft(empty);setMessage('');setError('');setBusy(false);setUnknown(false);intent.current=null;}});
  return()=>{generation.current++;unsubscribe();};
 },[actorId]);
 useEffect(()=>{const own=++generation.current;setError('');setMessage('');
  if(!actorId||!enabled)return;
  if(listMode){setItems(null);void fetch('/api/creator/sessions',{cache:'no-store'}).then(async response=>{const body=await response.json();if(own!==generation.current)return;if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');setItems(Array.isArray(body.data?.items)?body.data.items:[]);}).catch((next:unknown)=>{if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');});return;}
  if(editId){setCurrent(null);void fetch('/api/creator/sessions/'+editId,{cache:'no-store'}).then(async response=>{const body=await response.json();if(own!==generation.current)return;if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');const row=body.data as SessionItem;setCurrent(row);setDraft({title:row.title,description:row.description,type:row.type,startsAt:row.startsAt.slice(0,16),durationMinutes:String(row.durationMinutes),embedUrl:row.embedUrl??'',replayUrl:row.replayUrl??'',destinationTags:row.destinationTags.join(', ')});}).catch((next:unknown)=>{if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');});}
  return()=>{generation.current++;};
 },[actorId,enabled,listMode,editId]);
 if(!enabled)return <section className="k-page"><h1>{t('Creator sessions','創作者活動')}</h1><p role="status">{t('Session management is not connected yet.','活動管理尚未接通。')}</p></section>;
 if(!actorId||!valid)return <section className="k-page"><h1>{t('Creator sessions','創作者活動')}</h1><Link href={`/${locale}/sign-in?next=${encodeURIComponent(returnPath)}`}>{t('Sign in to continue','登入後繼續')}</Link></section>;
 if((!listMode&&!creating&&!editId))return <section className="k-page"><h1>{t('Session not found','找不到活動')}</h1><Link href={href('studio/sessions')}>{t('Back to sessions','返回活動')}</Link></section>;
 function field(key:keyof Draft,value:string){setDraft(previous=>({...previous,[key]:value}));setMessage('');setError('');}
 async function save(event:React.FormEvent){
  event.preventDefault();if(busy)return;
  const own=generation.current;
  const payload={...draft,durationMinutes:Number(draft.durationMinutes),startsAt:draft.startsAt&&!draft.startsAt.endsWith('Z')?draft.startsAt+':00.000Z':draft.startsAt,destinationTags:draft.destinationTags.split(',').map(tag=>tag.trim()).filter(Boolean)};
  const signature=JSON.stringify(payload);
  if(!intent.current){const requestId=crypto.randomUUID();intent.current={signature,requestId,body:JSON.stringify({requestId,input:payload}),url:editId?'/api/creator/sessions/'+editId:'/api/creator/sessions',method:editId?'PUT':'POST'};}
  if(intent.current.signature!==signature){setError('IDEMPOTENCY_CONFLICT');return;}
  setBusy(true);setError('');setUnknown(false);
  try{
   const response=await fetch(intent.current.url,{method:intent.current.method,headers:{'Content-Type':'application/json'},body:intent.current.body,cache:'no-store'});
   const body=await response.json();if(own!==generation.current)return;
   if(!response.ok||!body.ok){if(response.status>=400&&response.status<500&&!body.retryable){intent.current=null;setError(body.code??'INVALID');return;}throw Error(body.code??'UNAVAILABLE');}intent.current=null;setMessage(t('Session saved on the server.','活動已儲存至伺服器。'));if(!editId)setDraft(empty);else setCurrent(body.data??current);
  }catch(next){if(own!==generation.current)return;setError(next instanceof Error?next.message:'UNAVAILABLE');setUnknown(true);}
  finally{if(own===generation.current)setBusy(false);}
 }
 async function changeStatus(status:'live'|'ended'|'cancelled'){
  if(!current||busy||unknown)return;setBusy(true);setError('');try{const response=await fetch('/api/creator/sessions/'+current.id+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),status}),cache:'no-store'}),body=await response.json();if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');setCurrent({...current,status:body.data.status});setMessage(t('Session status updated.','活動狀態已更新。'));}catch(next){setError(next instanceof Error?next.message:'UNAVAILABLE');}finally{setBusy(false);}
 }
 const form=<form className="k-card k-form" onSubmit={save} aria-label={t('Creator session form','創作者活動表單')}>
  <label>{t('Session title','活動名稱')}<input required maxLength={160} value={draft.title} disabled={busy||unknown} onChange={event=>field('title',event.target.value)}/></label>
  <label>{t('Description','說明')}<textarea required maxLength={8000} value={draft.description} disabled={busy||unknown} onChange={event=>field('description',event.target.value)}/></label>
  <label>{t('Session type','活動類型')}<select value={draft.type} disabled={busy||unknown} onChange={event=>field('type',event.target.value)}>{types.map(type=><option value={type} key={type}>{type.replaceAll('_',' ')}</option>)}</select></label>
  <label>{t('Starts at (UTC)','開始時間（UTC）')}<input required type="datetime-local" value={draft.startsAt} disabled={busy||unknown} onChange={event=>field('startsAt',event.target.value)}/></label>
  <label>{t('Duration in minutes','時長（分鐘）')}<input required type="number" min={1} max={1440} value={draft.durationMinutes} disabled={busy||unknown} onChange={event=>field('durationMinutes',event.target.value)}/></label>
  <label>{t('Live YouTube URL (optional until going live)','YouTube 直播網址（上線前可留空）')}<input type="url" value={draft.embedUrl} disabled={busy||unknown} onChange={event=>field('embedUrl',event.target.value)}/></label>
  <label>{t('Replay YouTube URL (optional)','重播 YouTube 網址（可選）')}<input type="url" value={draft.replayUrl} disabled={busy||unknown} onChange={event=>field('replayUrl',event.target.value)}/></label>
  <label>{t('Destination tags, comma-separated','目的地標籤，以逗號分隔')}<input value={draft.destinationTags} disabled={busy||unknown} onChange={event=>field('destinationTags',event.target.value)}/></label>
  {unknown&&<p role="alert">{t('The result is unknown. Retry the same request before changing it.','結果未明，修改前請先重試相同請求。')}</p>}
  <button className="k-btn primary" disabled={busy||!draft.title.trim()||!draft.description.trim()||!draft.startsAt}>{unknown?t('Retry the same save','重試相同儲存'):t('Save session','儲存活動')}</button>
  <Link className="k-btn" href={href('studio/sessions')}>{t('Cancel','取消')}</Link>
 </form>;
 return <section className="k-page"><div className="k-page-heading"><div><p className="k-eyebrow">{t('YOUR STUDIO','你的工作室')}</p><h1>{creating?t('Create a session','建立活動'):editId?t('Edit session','編輯活動'):t('Sessions and events','活動及分享會')}</h1></div>{listMode&&<Link className="k-btn primary" href={href('studio/sessions/new')}>{t('New session','新活動')}</Link>}</div>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{t('Session request failed: ','活動請求失敗：')}{error}</p>}
  {listMode&&<>{items===null&&!error&&<p role="status">{t('Loading sessions…','正在載入活動…')}</p>}{items?.length===0&&<p>{t('No sessions yet.','暫未建立活動。')}</p>}<div className="k-card-list">{items?.map(item=><article className="k-card" key={item.id}><p className="k-eyebrow">{item.status}</p><h2>{item.title}</h2><p>{item.description}</p><p><time dateTime={item.startsAt}>{new Date(item.startsAt).toLocaleString(locale)}</time> · {item.durationMinutes} {t('minutes','分鐘')}</p><Link className="k-btn" href={href('studio/sessions/'+item.id+'/edit')}>{t('Edit session','編輯活動')}</Link></article>)}</div></>}
  {!listMode&&form}
  {editId&&current&&<div className="k-card"><h2>{t('Session state','活動狀態')}</h2><p>{current.status}</p><div className="k-actions">{current.status==='scheduled'&&<button className="k-btn" disabled={busy||!current.embedUrl} onClick={()=>void changeStatus('live')}>{t('Go live','開始直播')}</button>}{['scheduled','live'].includes(current.status)&&<button className="k-btn" disabled={busy} onClick={()=>void changeStatus('ended')}>{t('End session','結束活動')}</button>}{['scheduled','live'].includes(current.status)&&<button className="k-btn danger" disabled={busy} onClick={()=>void changeStatus('cancelled')}>{t('Cancel session','取消活動')}</button>}</div></div>}
 </section>;
}
