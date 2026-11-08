'use client';
import {useEffect,useRef,useState} from 'react';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp} from './ui';

type View='sessions'|'perks'|'testimonials'|'enquiries';
function useAdminPost(actorId:string,onChanged:()=>void){
 const{t}=useApp(),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[valid,setValid]=useState(true);
 const pending=useRef<string|null>(null),scope=useRef<{active:boolean;inFlight:boolean}|null>(null);
 useEffect(()=>{
  const own={active:true,inFlight:false};scope.current=own;pending.current=null;
  setValid(true);setBusy(false);setUnknown(false);setError('');setMessage('');
  const unsubscribe=subscribeAccountInvalidation(next=>{
   if(next===actorId)return;
   own.active=false;pending.current=null;setValid(false);setBusy(false);setUnknown(false);setError('');setMessage('');
  });
  return()=>{own.active=false;unsubscribe();};
 },[actorId]);
 async function send(wire:string|null,isRetry:boolean){
  const own=scope.current;
  if(!own?.active||own.inFlight||!wire)return;
  if(!isRetry&&pending.current){setError('IDEMPOTENCY_CONFLICT');return;}
  pending.current=wire;own.inFlight=true;setBusy(true);setError('');setMessage('');setUnknown(false);
  let confirmed=false;
  try{
   const response=await fetch('/api/ops/content',{method:'POST',headers:{'Content-Type':'application/json'},body:wire,cache:'no-store'}),payload=await response.json();
   if(!own.active)return;
   if(!response.ok||payload?.ok!==true){
    if(response.status>=400&&response.status<500&&payload?.ok===false&&payload.retryable===false){
     pending.current=null;setError(payload.code??'INVALID');return;
    }
    throw Error(payload?.code??'UNAVAILABLE');
   }
   pending.current=null;setMessage(t('Operations content updated.','營運內容已更新。'));confirmed=true;
  }catch(next){if(own.active){setError(next instanceof Error?next.message:'UNAVAILABLE');setUnknown(true);}}
  finally{if(own.active){own.inFlight=false;setBusy(false);}}
  if(confirmed&&own.active)onChanged();
 }
 return{busy,locked:busy||unknown||!valid,unknown,error,message,post:(body:Record<string,unknown>)=>send(JSON.stringify(body),false),retry:()=>send(pending.current,true)};
}
function Feedback({state}:{state:ReturnType<typeof useAdminPost>}){
 const{t}=useApp();
 return <>{state.message&&<p role="status">{state.message}</p>}{state.error&&<p role="alert">{t('Operations content request failed: ','營運內容請求失敗：')}{state.error}</p>}{state.unknown&&<button type="button" className="k-btn" disabled={state.busy} onClick={()=>void state.retry()}>{t('Retry the same request','重試相同請求')}</button>}</>;
}

function SessionAdmin({actorId,items,onChanged}:{actorId:string;items:Record<string,unknown>[];onChanged:()=>void}){
 const{locale,t}=useApp(),state=useAdminPost(actorId,onChanged),[host,setHost]=useState(''),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[type,setType]=useState('destination_briefing'),[startsAt,setStartsAt]=useState(''),[duration,setDuration]=useState('60'),[embed,setEmbed]=useState(''),[replay,setReplay]=useState(''),[tags,setTags]=useState('');
 function create(event:React.FormEvent){
  event.preventDefault();void state.post({action:'createSession',locale,requestId:crypto.randomUUID(),hostCreatorId:host,title,description,type,startsAt:new Date(startsAt).toISOString(),durationMinutes:Number(duration),embedUrl:embed,replayUrl:replay,destinationTags:tags.split(',').map(value=>value.trim()).filter(Boolean)});
 }
 return <section className="k-card"><h2>{t('Create a community session','建立社群活動')}</h2><form className="k-form" onSubmit={create}>
  <label>{t('Host creator ID','主持創作者 ID')}<input required value={host} onChange={event=>setHost(event.target.value)}/></label>
  <label>{t('Session title','活動名稱')}<input required maxLength={160} value={title} onChange={event=>setTitle(event.target.value)}/></label>
  <label>{t('Description','說明')}<textarea required maxLength={4000} value={description} onChange={event=>setDescription(event.target.value)}/></label>
  <label>{t('Session type','活動類型')}<select value={type} onChange={event=>setType(event.target.value)}>{['destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro'].map(value=><option key={value}>{value}</option>)}</select></label>
  <label>{t('Starts at','開始時間')}<input required type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)}/></label>
  <label>{t('Duration in minutes','時長（分鐘）')}<input required type="number" min="1" max="1440" value={duration} onChange={event=>setDuration(event.target.value)}/></label>
  <label>{t('Live YouTube URL','直播 YouTube 網址')}<input type="url" value={embed} onChange={event=>setEmbed(event.target.value)}/></label>
  <label>{t('Replay YouTube URL','重播 YouTube 網址')}<input type="url" value={replay} onChange={event=>setReplay(event.target.value)}/></label>
  <label>{t('Destination tags','目的地標籤')}<input value={tags} onChange={event=>setTags(event.target.value)}/></label>
  <Feedback state={state}/><button className="k-btn primary" disabled={state.locked}>{t('Create session','建立活動')}</button>
 </form><h2>{t('Session status controls','活動狀態控制')}</h2>{items.map(item=>{const itemId=String(item.id??''),status=String(item.status??'');return <article key={itemId}><h3>{String(item.title??itemId)}</h3><p>{status}</p><div className="k-actions">{status!=='live'&&<button className="k-btn" disabled={state.locked} onClick={()=>void state.post({action:'setSessionStatus',locale,id:itemId,status:'live'})}>{t('Go live','開始直播')}</button>}{status==='live'&&<button className="k-btn" disabled={state.locked} onClick={()=>void state.post({action:'setSessionStatus',locale,id:itemId,status:'ended'})}>{t('End session','結束活動')}</button>}{status!=='cancelled'&&<button className="k-btn danger" disabled={state.locked} onClick={()=>void state.post({action:'setSessionStatus',locale,id:itemId,status:'cancelled'})}>{t('Cancel session','取消活動')}</button>}</div></article>;})}</section>;
}

function PerkAdmin({actorId,items,onChanged}:{actorId:string;items:Record<string,unknown>[];onChanged:()=>void}){
 const{locale,t}=useApp(),state=useAdminPost(actorId,onChanged),[partner,setPartner]=useState(''),[title,setTitle]=useState(''),[summary,setSummary]=useState(''),[category,setCategory]=useState(''),[discount,setDiscount]=useState(''),[minTier,setMinTier]=useState('rising'),[redemptionType,setRedemptionType]=useState('code'),[redemptionValue,setRedemptionValue]=useState(''),[sortOrder,setSortOrder]=useState('0');
 function create(event:React.FormEvent){event.preventDefault();void state.post({action:'createPerk',locale,requestId:crypto.randomUUID(),partnerName:partner,title,summary,category,discountLabel:discount,minTier,redemptionType,redemptionValue,sortOrder:Number(sortOrder),active:false});}
 return <section className="k-card"><h2>{t('Create a partner perk','建立夥伴禮遇')}</h2><form className="k-form" onSubmit={create}>
  <label>{t('Partner name','夥伴名稱')}<input required value={partner} onChange={event=>setPartner(event.target.value)}/></label><label>{t('Perk title','禮遇名稱')}<input required value={title} onChange={event=>setTitle(event.target.value)}/></label><label>{t('Summary','摘要')}<textarea required value={summary} onChange={event=>setSummary(event.target.value)}/></label><label>{t('Category','類別')}<input required value={category} onChange={event=>setCategory(event.target.value)}/></label><label>{t('Discount label','優惠標籤')}<input required value={discount} onChange={event=>setDiscount(event.target.value)}/></label>
  <label>{t('Minimum tier','最低級別')}<select value={minTier} onChange={event=>setMinTier(event.target.value)}><option value="rising">rising</option><option value="pro">pro</option><option value="elite">elite</option></select></label><label>{t('Redemption type','兌換類型')}<select value={redemptionType} onChange={event=>setRedemptionType(event.target.value)}><option value="code">code</option><option value="link">link</option></select></label><label>{t('Redemption value','兌換值')}<input required value={redemptionValue} onChange={event=>setRedemptionValue(event.target.value)}/></label><label>{t('Sort order','排序')}<input type="number" value={sortOrder} onChange={event=>setSortOrder(event.target.value)}/></label>
  <Feedback state={state}/><button className="k-btn primary" disabled={state.locked}>{t('Create perk','建立禮遇')}</button>
 </form><h2>{t('Perk publication controls','禮遇發布控制')}</h2>{items.map(item=>{const itemId=String(item.id??''),active=item.active===true;return <article key={itemId}><h3>{String(item.title??itemId)}</h3><p>{active?'active':'inactive'}</p><button className="k-btn" disabled={state.locked} onClick={()=>void state.post({action:'setPerkActive',locale,id:itemId,active:!active})}>{active?t('Deactivate perk','停用禮遇'):t('Activate perk','啟用禮遇')}</button></article>;})}</section>;
}

function TestimonialAdmin({actorId,items,onChanged}:{actorId:string;items:Record<string,unknown>[];onChanged:()=>void}){
 const{locale,t}=useApp(),state=useAdminPost(actorId,onChanged),[quote,setQuote]=useState(''),[author,setAuthor]=useState(''),[role,setRole]=useState('creator'),[contentLocale,setContentLocale]=useState('en'),[sortOrder,setSortOrder]=useState('0');
 function create(event:React.FormEvent){event.preventDefault();void state.post({action:'createTestimonial',locale,requestId:crypto.randomUUID(),quote,authorName:author,authorRole:role,contentLocale,sortOrder:Number(sortOrder)});}
  return <section className="k-card"><h2>{t('Create a testimonial','建立見證')}</h2><form className="k-form" onSubmit={create}><label>{t('Quote','引述')}<textarea required value={quote} onChange={event=>setQuote(event.target.value)}/></label><label>{t('Author name','作者名稱')}<input required value={author} onChange={event=>setAuthor(event.target.value)}/></label><label>{t('Author role','作者角色')}<select value={role} onChange={event=>setRole(event.target.value)}><option value="creator">creator</option><option value="traveller">traveller</option><option value="merchant">merchant</option></select></label><label>{t('Content locale','內容語言')}<select value={contentLocale} onChange={event=>setContentLocale(event.target.value)}><option value="en">en</option><option value="zh-hk">zh-hk</option><option value="zh-tw">zh-tw</option><option value="zh-cn">zh-cn</option><option value="ja">ja</option><option value="ko">ko</option><option value="th">th</option></select></label><label>{t('Sort order','排序')}<input type="number" value={sortOrder} onChange={event=>setSortOrder(event.target.value)}/></label><Feedback state={state}/><button className="k-btn primary" disabled={state.locked}>{t('Create testimonial','建立見證')}</button></form><h2>{t('Testimonial publication controls','見證發布控制')}</h2>{items.map(item=>{const itemId=String(item.id??''),status=String(item.status??'');return <article key={itemId}><h3>{String(item.quote??itemId)}</h3><p>{String(item.author_name??'')} · {status}</p><button className="k-btn" disabled={state.locked} onClick={()=>void state.post({action:'setTestimonialStatus',locale,id:itemId,status:status==='published'?'draft':'published'})}>{status==='published'?t('Unpublish testimonial','取消發布見證'):t('Publish testimonial','發布見證')}</button></article>;})}</section>;
}

function EnquiryAction({actorId,item,onChanged}:{actorId:string;item:Record<string,unknown>;onChanged:()=>void}){
 const{locale,t}=useApp(),state=useAdminPost(actorId,onChanged),[status,setStatus]=useState('in_progress'),[reason,setReason]=useState(''),itemId=String(item.id??''),current=String(item.status??'');
 return <article><h3>{String(item.name??itemId)}</h3><p>{current} · {String(item.type??'')} · {String(item.target_name??'')}</p><label>{t('New enquiry status','新查詢狀態')}<select value={status} onChange={event=>setStatus(event.target.value)}><option value="in_progress">in_progress</option><option value="resolved">resolved</option><option value="spam">spam</option></select></label><label>{t('Status reason','狀態原因')}<input maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label><Feedback state={state}/><button className="k-btn" disabled={state.locked||current===status||(['resolved','spam'].includes(status)&&!reason.trim())} onClick={()=>void state.post({action:'setEnquiryStatus',locale,id:itemId,status,reason})}>{t('Update enquiry','更新查詢')}</button></article>;
}

export function OpsContentAdmin({actorId,view,items,onChanged}:{actorId:string;view:View;items:Record<string,unknown>[];onChanged:()=>void}){
 if(view==='sessions')return <SessionAdmin actorId={actorId} items={items} onChanged={onChanged}/>;
 if(view==='perks')return <PerkAdmin actorId={actorId} items={items} onChanged={onChanged}/>;
 if(view==='testimonials')return <TestimonialAdmin actorId={actorId} items={items} onChanged={onChanged}/>;
 return <section className="k-card"><h2>Enquiries</h2>{items.length===0?<p>No active enquiries.</p>:items.map(item=><EnquiryAction key={String(item.id)} actorId={actorId} item={item} onChanged={onChanged}/>)}</section>;
}
