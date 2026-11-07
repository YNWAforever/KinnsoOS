'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp} from './ui';

type SessionItem={id:string;slug:string;title:string;description:string;type:string;startsAt:string;durationMinutes:number;status:string;embedUrl:string|null;replayUrl:string|null;destinationTags:string[];createdAt:string;updatedAt:string;revision:number;editToken:string};
type Draft={title:string;description:string;type:string;startsAt:string;durationMinutes:string;embedUrl:string;replayUrl:string;destinationTags:string};
const empty:Draft={title:'',description:'',type:'destination_briefing',startsAt:'',durationMinutes:'45',embedUrl:'',replayUrl:'',destinationTags:''};
function sessionDraft(row:SessionItem):Draft {
 return {title:row.title,description:row.description,type:row.type,startsAt:row.startsAt.slice(0,16),durationMinutes:String(row.durationMinutes),embedUrl:row.embedUrl??'',replayUrl:row.replayUrl??'',destinationTags:row.destinationTags.join(', ')};
}
const types=['destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function CreatorSessionsWorkspace({actorId,enabled,path}:{actorId:string|null;enabled:boolean;path:string}){
 const{locale,t,href}=useApp(),match=path.match(/^studio\/sessions\/([^/]+)\/edit$/),editId=match&&uuid.test(match[1])?match[1]:null;
 const creating=path==='studio/sessions/new',listMode=!creating&&!editId;
 const[valid,setValid]=useState(true),[items,setItems]=useState<SessionItem[]|null>(null),[current,setCurrent]=useState<SessionItem|null>(null),[draft,setDraft]=useState<Draft>(empty),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false);
 const [refresh,setRefresh]=useState(0),[stale,setStale]=useState(false);
 const [nextCursor,setNextCursor]=useState<string|null>(null),[pageLoading,setPageLoading]=useState(false);
 const generation=useRef(0),intent=useRef<{signature:string;requestId:string;body:string;url:string;method:string}|null>(null);
 const returnPath='/'+locale+'/studio/sessions';
 useEffect(()=>{setValid(true);const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){generation.current++;setValid(false);setItems(null);setNextCursor(null);setPageLoading(false);setCurrent(null);setDraft(empty);setMessage('');setError('');setBusy(false);setUnknown(false);intent.current=null;}});
  return()=>{generation.current++;unsubscribe();};
 },[actorId]);
 async function loadPage(own:number,cursor:string|null){
  setPageLoading(true);setError('');
  try{
   const response=await fetch('/api/creator/sessions'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{cache:'no-store'}),body=await response.json();
   if(own!==generation.current)return;
   if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');
   const rows:SessionItem[]=Array.isArray(body.data?.items)?body.data.items:[];
   setItems(previous=>{
    const byId=new Map((cursor?previous??[]:[]).map(row=>[row.id,row]));
    for(const row of rows)if(!byId.has(row.id))byId.set(row.id,row);
    return [...byId.values()];
   });
   setNextCursor(typeof body.data?.nextCursor==='string'?body.data.nextCursor:null);
  }catch(next){if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');}
  finally{if(own===generation.current)setPageLoading(false);}
 }
 useEffect(()=>{const own=++generation.current;intent.current=null;setUnknown(false);setBusy(false);setError('');setMessage('');setNextCursor(null);setPageLoading(false);
  if(!actorId||!enabled)return;
  if(listMode){setItems(null);void loadPage(own,null);}
  if(editId){setCurrent(null);void fetch('/api/creator/sessions/'+editId,{cache:'no-store'}).then(async response=>{const body=await response.json();if(own!==generation.current)return;if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');const row=body.data as SessionItem;setCurrent(row);setDraft(sessionDraft(row));setStale(false);}).catch((next:unknown)=>{if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');});}
  return()=>{generation.current++;};
 },[actorId,enabled,listMode,editId,refresh]);
 if(!enabled)return <section className="k-page"><h1>{t('Creator sessions','創作者活動')}</h1><p role="status">{t('Session management is not connected yet.','活動管理尚未接通。')}</p></section>;
 if(!actorId||!valid)return <section className="k-page"><h1>{t('Creator sessions','創作者活動')}</h1><Link href={`/${locale}/sign-in?next=${encodeURIComponent(returnPath)}`}>{t('Sign in to continue','登入後繼續')}</Link></section>;
 if((!listMode&&!creating&&!editId))return <section className="k-page"><h1>{t('Session not found','找不到活動')}</h1><Link href={href('studio/sessions')}>{t('Back to sessions','返回活動')}</Link></section>;
 function field(key:keyof Draft,value:string){setDraft(previous=>({...previous,[key]:value}));setMessage('');setError('');}
 async function save(event:React.FormEvent){
  event.preventDefault();if(busy||stale||(editId&&!current))return;
  const own=generation.current;
  const payload={...draft,durationMinutes:Number(draft.durationMinutes),startsAt:draft.startsAt&&!draft.startsAt.endsWith('Z')?draft.startsAt+':00.000Z':draft.startsAt,destinationTags:draft.destinationTags.split(',').map(tag=>tag.trim()).filter(Boolean)};
  const signature=JSON.stringify(payload);
  if(!intent.current){const requestId=crypto.randomUUID();intent.current={signature,requestId,body:JSON.stringify({requestId,...(editId?{expectedToken:current!.editToken,expectedRevision:current!.revision}:{}),input:payload}),url:editId?'/api/creator/sessions/'+editId:'/api/creator/sessions',method:editId?'PUT':'POST'};}
  if(intent.current.signature!==signature){setError('IDEMPOTENCY_CONFLICT');return;}
  setBusy(true);setError('');setUnknown(false);
  try{
   const response=await fetch(intent.current.url,{method:intent.current.method,headers:{'Content-Type':'application/json'},body:intent.current.body,cache:'no-store'});
   const body=await response.json();if(own!==generation.current)return;
   if(!response.ok||!body.ok){if(response.status>=400&&response.status<500&&!body.retryable){intent.current=null;if(editId&&response.status===409)setStale(true);setError(body.code??'INVALID');return;}throw Error(body.code??'UNAVAILABLE');}
   if(editId){
    // The receipt is the original result. Re-read the current row before
    // showing or editing it, since another tab may already have saved again.
    const latest=await fetch('/api/creator/sessions/'+editId,{cache:'no-store'});
    const detail=await latest.json();if(own!==generation.current)return;
    if(!latest.ok||!detail.ok)throw Error(detail.code??'UNAVAILABLE');
    setCurrent(detail.data);setDraft(sessionDraft(detail.data));
   }else setDraft(empty);
   intent.current=null;setMessage(t('Session saved on the server.','活動已儲存至伺服器。'));
  }catch(next){if(own!==generation.current)return;setError(next instanceof Error?next.message:'UNAVAILABLE');setUnknown(true);}
  finally{if(own===generation.current)setBusy(false);}
 }
 async function changeStatus(status:'live'|'ended'|'cancelled'){
  if(!current||busy||unknown||stale)return;const own=generation.current;setBusy(true);setError('');try{const response=await fetch('/api/creator/sessions/'+current.id+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),status}),cache:'no-store'}),body=await response.json();if(own!==generation.current)return;if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');const nextRevision=body.data.edit_revision;
   const sameVersionChain=body.data.edit_token===current.editToken&&nextRevision===current.revision+1;
   if(!sameVersionChain)setStale(true);
   setCurrent({...current,status:body.data.status,revision:sameVersionChain?nextRevision:current.revision});setMessage(t('Session status updated.','活動狀態已更新。'));}catch(next){if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');}finally{if(own===generation.current)setBusy(false);}
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
  <button className="k-btn primary" disabled={busy||stale||(!!editId&&!current)||!draft.title.trim()||!draft.description.trim()||!draft.startsAt}>{unknown?t('Retry the same save','重試相同儲存'):t('Save session','儲存活動')}</button>
  {stale&&<button type="button" className="k-btn" onClick={()=>setRefresh(value=>value+1)}>{t('Load latest session','載入最新活動')}</button>}
  <Link className="k-btn" href={href('studio/sessions')}>{t('Cancel','取消')}</Link>
 </form>;
 return <section className="k-page"><div className="k-page-heading"><div><p className="k-eyebrow">{t('YOUR STUDIO','你的工作室')}</p><h1>{creating?t('Create a session','建立活動'):editId?t('Edit session','編輯活動'):t('Sessions and events','活動及分享會')}</h1></div>{listMode&&<Link className="k-btn primary" href={href('studio/sessions/new')}>{t('New session','新活動')}</Link>}</div>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{t('Session request failed: ','活動請求失敗：')}{error}</p>}
  {listMode&&<>{items===null&&!error&&<p role="status">{t('Loading sessions…','正在載入活動…')}</p>}{items?.length===0&&<p>{t('No sessions yet.','暫未建立活動。')}</p>}<div className="k-card-list">{items?.map(item=><article className="k-card" key={item.id}><p className="k-eyebrow">{item.status}</p><h2>{item.title}</h2><p>{item.description}</p><p><time dateTime={item.startsAt}>{new Date(item.startsAt).toLocaleString(locale)}</time> · {item.durationMinutes} {t('minutes','分鐘')}</p><Link className="k-btn" href={href('studio/sessions/'+item.id+'/edit')}>{t('Edit session','編輯活動')}</Link></article>)}</div>{nextCursor&&(error==='INVALID'
   ?<button className="k-btn" onClick={()=>setRefresh(value=>value+1)}>{t('Reload sessions','重新載入活動')}</button>
   :<button className="k-btn" disabled={pageLoading} onClick={()=>void loadPage(generation.current,nextCursor)}>{pageLoading?t('Loading sessions…','正在載入活動…'):t('Load more sessions','載入更多活動')}</button>)}</>}
  {!listMode&&form}
  {editId&&current&&<div className="k-card"><h2>{t('Session state','活動狀態')}</h2><p>{current.status}</p><div className="k-actions">{current.status==='scheduled'&&<button className="k-btn" disabled={busy||unknown||stale||!current.embedUrl} onClick={()=>void changeStatus('live')}>{t('Go live','開始直播')}</button>}{['scheduled','live'].includes(current.status)&&<button className="k-btn" disabled={busy||unknown||stale} onClick={()=>void changeStatus('ended')}>{t('End session','結束活動')}</button>}{['scheduled','live'].includes(current.status)&&<button className="k-btn danger" disabled={busy||unknown||stale} onClick={()=>void changeStatus('cancelled')}>{t('Cancel session','取消活動')}</button>}</div></div>}
 </section>;
}
