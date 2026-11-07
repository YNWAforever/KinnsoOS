'use client';
import {useEffect,useRef,useState} from 'react';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp} from './ui';

type Offer={id:string;title:string;terms:string;discountKind:string;discountValue:number;commissionKind:string;commissionValue:number;validFrom:string;validTo:string;perVisitorLimit:number;totalCap:number|null;claimedCount:number;redeemedCount:number;status:string;createdAt:string;updatedAt:string};
const empty={title:'',terms:'',discountKind:'percent',discountValue:'',commissionKind:'flat',commissionValue:'',validFrom:'',validTo:'',perVisitorLimit:'1',totalCap:'',missionId:null};

export function MerchantOffersWorkspace({actorId,merchantId,onLockChange}:{actorId:string|null;merchantId:string;onLockChange?:(locked:boolean)=>void}){
 const{locale,t}=useApp(),[valid,setValid]=useState(true),[items,setItems]=useState<Offer[]|null>(null),[nextCursor,setNextCursor]=useState<string|null>(null),[loadingMore,setLoadingMore]=useState(false),[listError,setListError]=useState(''),[summary,setSummary]=useState({claimed:0,redeemed:0}),[draft,setDraft]=useState(empty),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false);
 const generation=useRef(0),intent=useRef<string|null>(null),listVersion=useRef(0),paging=useRef(false);
 const locked=busy||unknown;
 useEffect(()=>{onLockChange?.(locked);},[locked,onLockChange]);
 useEffect(()=>()=>onLockChange?.(false),[onLockChange]);
 function clearScope(){
  intent.current=null;listVersion.current++;paging.current=false;setNextCursor(null);setLoadingMore(false);setListError('');setItems(null);setSummary({claimed:0,redeemed:0});setDraft(empty);
  setError('');setMessage('');setBusy(false);setUnknown(false);
 }
 async function load(own:number,cursor:string|null=null){
  if(!actorId||!merchantId||(cursor&&paging.current))return;
  const version=++listVersion.current;
  paging.current=true;setLoadingMore(Boolean(cursor));setListError('');
  if(!cursor)setNextCursor(null);
  const params=new URLSearchParams({company:merchantId});if(cursor)params.set('cursor',cursor);
  const current=()=>own===generation.current&&version===listVersion.current;
  try{
   const response=await fetch('/api/merchant/offers?'+params,{cache:'no-store'}),body=await response.json();
   if(!current())return;
   if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');
   const rows:Offer[]=body.data.items;
   setItems(previous=>{
    if(!cursor||!previous)return rows;
    const seen=new Set(previous.map(row=>row.id));
    return [...previous,...rows.filter(row=>!seen.has(row.id)&&seen.add(row.id))];
   });
   setNextCursor(body.data.nextCursor??null);setSummary(body.data.summary);
  }catch(next){if(current())setListError(next instanceof Error?next.message:'UNAVAILABLE');}
  finally{if(current()){paging.current=false;setLoadingMore(false);}}
 }
 useEffect(()=>{
  const own=++generation.current;setValid(true);clearScope();void load(own);
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){generation.current++;setValid(false);clearScope();}});
  return()=>{generation.current++;unsubscribe();};
 },[actorId,merchantId]);
 if(!valid||!actorId)return <div className="k-card"><p>{t('Sign in to manage merchant offers.','登入後管理商戶優惠。')}</p></div>;
 function field(key:keyof typeof empty,value:string){setDraft(previous=>({...previous,[key]:value}));setError('');setMessage('');}
 async function create(event:React.FormEvent){
  event.preventDefault();
  if(busy||!valid||!actorId||(unknown&&!intent.current))return;
  const own=generation.current;
  const wire=intent.current??=JSON.stringify({requestId:crypto.randomUUID(),company:merchantId,input:draft});
  setBusy(true);setError('');setMessage('');setUnknown(false);
  try{
   const response=await fetch('/api/merchant/offers',{method:'POST',headers:{'Content-Type':'application/json'},body:wire,cache:'no-store'});
   const body=await response.json();
   if(own!==generation.current)return;
   if(!response.ok||!body.ok){
    if(response.status>=400&&response.status<500&&body.ok===false&&body.retryable===false){
     intent.current=null;setError(body.code??'INVALID');return;
    }
    throw Error(body.code??'UNAVAILABLE');
   }
   intent.current=null;setDraft(empty);setMessage(t('Offer saved.','優惠已儲存。'));await load(own);
  }catch(next){
   if(own!==generation.current)return;
   setError(next instanceof Error?next.message:'UNAVAILABLE');setUnknown(true);
  }finally{if(own===generation.current)setBusy(false);}
 }
 async function setStatus(offer:Offer,status:'live'|'paused'|'ended'){
  if(locked)return;
  const own=generation.current;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/merchant/offers/'+offer.id+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),company:merchantId,status}),cache:'no-store'}),body=await response.json();
   if(own!==generation.current)return;
   if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');
   setItems(previous=>previous?.map(row=>row.id===offer.id?{...row,status}:row)??previous);setMessage(t('Offer status updated.','優惠狀態已更新。'));
  }catch(next){if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');}
  finally{if(own===generation.current)setBusy(false);}
 }
 return <div className="k-card"><h2>{t('Offers and visits','優惠及到訪')}</h2><p>{summary.claimed} {t('claimed','已領取')} · {summary.redeemed} {t('redeemed','已核銷')}</p>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{t('Offer request failed: ','優惠請求失敗：')}{error}</p>}
  <form className="k-form" onSubmit={create} aria-label={t('Create merchant offer','建立商戶優惠')}>
   <label>{t('Offer title','優惠名稱')}<input required maxLength={120} value={draft.title} disabled={locked} onChange={e=>field('title',e.target.value)}/></label>
   <label>{t('Terms','條款')}<textarea required maxLength={1000} value={draft.terms} disabled={locked} onChange={e=>field('terms',e.target.value)}/></label>
   <label>{t('Discount type','折扣類型')}<select value={draft.discountKind} disabled={locked} onChange={e=>field('discountKind',e.target.value)}><option value="percent">percent</option><option value="amount">amount</option><option value="item">item</option></select></label>
   <label>{t('Discount value','折扣數值')}<input required type="number" min="0.01" step="0.01" value={draft.discountValue} disabled={locked} onChange={e=>field('discountValue',e.target.value)}/></label>
   <label>{t('Creator commission type','創作者佣金類型')}<select value={draft.commissionKind} disabled={locked} onChange={e=>field('commissionKind',e.target.value)}><option value="flat">flat</option><option value="percent">percent</option></select></label>
   <label>{t('Creator commission value','創作者佣金數值')}<input required type="number" min="0.01" step="0.01" value={draft.commissionValue} disabled={locked} onChange={e=>field('commissionValue',e.target.value)}/></label>
   <label>{t('Valid from (UTC)','開始時間（UTC）')}<input required type="datetime-local" value={draft.validFrom} disabled={locked} onChange={e=>field('validFrom',e.target.value)}/></label>
   <label>{t('Valid to (UTC)','結束時間（UTC）')}<input required type="datetime-local" value={draft.validTo} disabled={locked} onChange={e=>field('validTo',e.target.value)}/></label>
   <label>{t('Limit per visitor','每位旅客上限')}<input required type="number" min="1" step="1" value={draft.perVisitorLimit} disabled={locked} onChange={e=>field('perVisitorLimit',e.target.value)}/></label>
   <label>{t('Total cap (optional)','總名額上限（可選）')}<input type="number" min="1" step="1" value={draft.totalCap} disabled={locked} onChange={e=>field('totalCap',e.target.value)}/></label>
   {unknown&&<p role="alert">{t('The result is unknown. Retry the same request.','結果未明，請重試相同請求。')}</p>}
   <button className="k-btn primary" disabled={busy||(unknown&&!intent.current)}>{unknown?t('Retry the same save','重試相同儲存'):t('Save offer','儲存優惠')}</button>
  </form>
  {listError&&<p role="alert">{t('Could not load offers: ','無法載入優惠：')}{listError}</p>}{items===null&&!listError&&<p role="status">{t('Loading offers…','正在載入優惠…')}</p>}{items?.length===0&&<p>{t('No offers yet.','暫未建立優惠。')}</p>}{items?.map(offer=><article key={offer.id}><h3>{offer.title}</h3><p>{offer.status} · {offer.claimedCount} {t('claimed','已領取')} · {offer.redeemedCount} {t('redeemed','已核銷')}</p><p>{offer.terms}</p><div className="k-actions">{offer.status!=='live'&&<button className="k-btn" disabled={locked} onClick={()=>void setStatus(offer,'live')}>{t('Publish offer','發布優惠')}</button>}{offer.status==='live'&&<button className="k-btn" disabled={locked} onClick={()=>void setStatus(offer,'paused')}>{t('Pause offer','暫停優惠')}</button>}{offer.status!=='ended'&&<button className="k-btn danger" disabled={locked} onClick={()=>void setStatus(offer,'ended')}>{t('End offer','結束優惠')}</button>}</div></article>)}
  {nextCursor&&<button type="button" className="k-btn" disabled={loadingMore||busy} onClick={()=>void load(generation.current,nextCursor)}>{loadingMore?t('Loading offers…','正在載入優惠…'):t('Load more offers','載入更多優惠')}</button>}
 </div>;
}
