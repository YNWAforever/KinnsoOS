'use client';
import {useEffect,useRef,useState} from 'react';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp} from './ui';

type View='creators'|'merchants';

export function OpsRecordActions({actorId,view,detail}:{actorId:string;view:View;detail:Record<string,unknown>}){
 const{locale,t}=useApp(),record=(view==='creators'?detail.creator:detail.profile) as Record<string,unknown>|undefined;
 const id=typeof record?.id==='string'?record.id:'',initialStatus=typeof record?.status==='string'?record.status:'';
 const[operation,setOperation]=useState<'status'|'verified'|'listed'|'tier'|'note'>('status');
 const[status,setStatus]=useState(initialStatus),[truth,setTruth]=useState(record?.verified===true),[tier,setTier]=useState(typeof record?.tier==='string'?record.tier:'free');
 const[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [valid,setValid]=useState(true);
 const pending=useRef<string|null>(null),generation=useRef(0);
 useEffect(()=>{
  function clear(){pending.current=null;setBusy(false);setUnknown(false);setError('');setMessage('');setReason('');}
  setValid(true);clear();
  setOperation('status');setStatus(initialStatus);setTruth(record?.verified===true);setTier(typeof record?.tier==='string'?record.tier:'free');
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){generation.current++;setValid(false);clear();}});
  return()=>{generation.current++;unsubscribe();};
 },[actorId,view,id]);
 if(!id||!valid)return null;
 async function submit(body?:Record<string,unknown>){
  if(busy||!valid||(!pending.current&&!body))return;
  const own=generation.current,wire=pending.current??=JSON.stringify(body);
  setBusy(true);setError('');setMessage('');setUnknown(false);
  try{
   const response=await fetch('/api/ops/records',{method:'POST',headers:{'Content-Type':'application/json'},body:wire,cache:'no-store'}),payload=await response.json();
   if(own!==generation.current)return;
   if(!response.ok||!payload.ok){
    if(response.status>=400&&response.status<500&&payload.ok===false&&payload.retryable===false){
     pending.current=null;setError(payload.code??'INVALID');return;
    }
    throw Error(payload.code??'UNAVAILABLE');
   }
   pending.current=null;setReason('');setMessage(t('Operations record updated.','營運紀錄已更新。'));
  }catch(next){if(own===generation.current){setError(next instanceof Error?next.message:'UNAVAILABLE');setUnknown(true);}}
  finally{if(own===generation.current)setBusy(false);}
 }
 function change(){
  const body:Record<string,unknown>={locale,id,reason};
  if(view==='creators'&&operation==='status')Object.assign(body,{action:'setCreatorStatus',status});
  else if(view==='creators'&&operation==='verified')Object.assign(body,{action:'setCreatorVerified',verified:truth});
  else if(view==='creators'&&operation==='listed')Object.assign(body,{action:'setCreatorListed',listed:truth});
  else if(view==='creators'&&operation==='note')Object.assign(body,{action:'addCreatorNote'});
  else if(view==='merchants'&&operation==='status')Object.assign(body,{action:'setMerchantStatus',status});
  else if(view==='merchants'&&operation==='tier')Object.assign(body,{action:'setMerchantTier',tier});
  else Object.assign(body,{action:'addMerchantNote'});
  void submit(body);
 }
 return <section className="k-card" aria-label={t('Moderation controls','審核控制')}><h2>{t('Moderation controls','審核控制')}</h2>
  <label>{t('Operation','操作')}<select value={operation} disabled={busy||unknown} onChange={event=>setOperation(event.target.value as typeof operation)}>
   <option value="status">{t('Account status','帳戶狀態')}</option>
   {view==='creators'?<><option value="verified">{t('Verification','認證')}</option><option value="listed">{t('Directory listing','目錄展示')}</option><option value="note">{t('Internal note','內部備註')}</option></>:<><option value="tier">{t('Merchant tier','商戶級別')}</option><option value="note">{t('Internal note','內部備註')}</option></>}
  </select></label>
  {operation==='status'?<label>{t('New status','新狀態')}<select value={status} disabled={busy||unknown} onChange={event=>setStatus(event.target.value)}>{(view==='creators'?['active','suspended','banned']:['active','paused','suspended','archived']).map(value=><option key={value} value={value}>{value}</option>)}</select></label>:operation==='tier'?<label>{t('New tier','新級別')}<select value={tier} disabled={busy||unknown} onChange={event=>setTier(event.target.value)}><option value="free">free</option><option value="growth">growth</option></select></label>:operation==='note'?null:<label>{t('New value','新數值')}<select value={truth?'true':'false'} disabled={busy||unknown} onChange={event=>setTruth(event.target.value==='true')}><option value="true">{t('Enabled','啟用')}</option><option value="false">{t('Disabled','停用')}</option></select></label>}
  <label>{t('Audit reason','審核原因')}<textarea required maxLength={500} value={reason} disabled={busy||unknown} onChange={event=>setReason(event.target.value)}/></label>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{t('Moderation action failed: ','審核操作失敗：')}{error}</p>}
  {unknown&&pending.current?<button className="k-btn" disabled={busy} onClick={()=>void submit()}>{t('Retry the same change','重試相同修改')}</button>:<button className="k-btn primary" disabled={busy||!reason.trim()} onClick={change}>{t('Apply moderation change','套用審核修改')}</button>}
 </section>;
}
