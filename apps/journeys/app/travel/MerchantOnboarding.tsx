'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useApp} from './ui';
import {MerchantContactFields} from './MerchantContactFields';
import {merchantOnboarding,type MerchantOnboarding as Onboarding} from '../../lib/merchants/onboarding';
import {applicationInput,type ApplicationInput} from '../../lib/merchants/onboarding-validation';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
const blank:ApplicationInput={companyName:'',contactName:'',contactEmail:'',websiteUrl:'',pitch:''};
export function MerchantOnboarding({actorId,enabled}:{actorId:string|null;enabled:boolean}){
 const {t,locale}=useApp(),router=useRouter();
 const [data,setData]=useState<Onboarding|null>(null),[input,setInput]=useState(blank),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState(''),[valid,setValid]=useState(true);
 const epoch=useRef(0),pending=useRef<{input:ApplicationInput;requestId:string}|null>(null),locked=useRef(false);
 function deny(code:string){setError(code);if(code==='AUTH_REQUIRED'||code==='FORBIDDEN'){epoch.current++;setValid(false);setData(null);setInput(blank);pending.current=null;setUnknown(false);locked.current=false;}}
 async function refresh(){if(locked.current)return;const own=epoch.current;setBusy(true);const r=await merchantOnboarding.get();if(own!==epoch.current)return;setBusy(false);if(r.ok){setData(r.data);setError('');if(r.data.merchant?.status==='active')router.refresh();}else deny(r.code);}
 useEffect(()=>{epoch.current++;setData(null);setInput(blank);setError('');setConfirmed(false);setValid(true);setBusy(false);setUnknown(false);pending.current=null;locked.current=false;
  if(actorId&&enabled)void refresh();const off=subscribeAccountInvalidation(next=>{if(next!==actorId){epoch.current++;setValid(false);setData(null);setInput(blank);pending.current=null;setUnknown(false);locked.current=false;}});
  return()=>{epoch.current++;off();};
 // Account identity is the lifetime of private form data.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actorId,enabled]);
 useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{if(unknown||busy||Object.values(input).some(Boolean)){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[input,busy,unknown]);
 async function submit(){if(busy||!confirmed||!valid||!actorId||!enabled)return;const own=epoch.current;
  try{pending.current??={input:applicationInput(input),requestId:crypto.randomUUID()};}catch{setError('INVALID');return;}
  const intent=pending.current;locked.current=true;setBusy(true);setError('');const r=await merchantOnboarding.submit(intent.input,intent.requestId);if(own!==epoch.current)return;
  setBusy(false);if(!r.ok){setUnknown(r.code==='UNAVAILABLE');if(r.code!=='UNAVAILABLE'){pending.current=null;locked.current=false;}deny(r.code);return;}
  pending.current=null;locked.current=false;setUnknown(false);setInput(blank);setConfirmed(false);await refresh();
 }
 if(!actorId||!enabled||!valid)return null;
 const open=data?.applications.find(a=>a.status==='pending');
 return <section className="k-card k-collab-card" aria-labelledby="merchant-onboarding-title"><p className="k-eyebrow">{t('BECOME A PARTNER','成為合作商戶')}</p><h2 id="merchant-onboarding-title">{t('Apply as a merchant','申請成為商戶')}</h2>
  <p>{t('Tell us about your business and proposed collaboration. Your application is reviewed before company access is created.','介紹你的業務及合作構想；我們審批申請後，才會開通公司工作區。')}</p>
  {error&&<p role="alert">{error==='INVALID'?t('Check your contact details and use complete HTTPS links.','請核對聯絡資料，並填寫完整 HTTPS 連結。'):error==='CONFLICT'?t('Your application status changed. Refresh to see the current decision.','申請狀態已有變更，請重新載入查看最新結果。'):t('Could not confirm this request. Your input is kept.','未能確認請求，輸入已保留。')}</p>}
  {busy&&<p role="status">{t('Checking application…','正在核對申請…')}</p>}
  {!data&&!busy&&<button className="k-btn" onClick={()=>void refresh()}>{t('Retry application status','重試載入申請狀態')}</button>}
  {data?.merchant?<div><p role="status">{data.merchant.status==='active'?t('Your company is approved. Refresh the workspace to continue.','你的公司已獲批，請重新載入工作區繼續。'):t('Your company account is currently restricted. Contact support for help.','你的公司帳戶目前受限制，請聯絡支援。')}</p><button className="k-btn" onClick={()=>window.location.reload()}>{t('Open approved company','開啟已獲批公司')}</button></div>:open?<div><h3>{open.companyName}</h3><p role="status">{t('Application pending review','申請正等候審批')}</p><p>{t('Contact','聯絡電郵')}: {open.contactEmail}</p><button className="k-btn" disabled={busy} onClick={()=>void refresh()}>{t('Refresh application status','重新載入申請狀態')}</button></div>:data&&<form onSubmit={e=>{e.preventDefault();void submit();}}>
   <fieldset disabled={busy||unknown}><legend>{t('Business details','商戶資料')}</legend><MerchantContactFields value={input} onChange={patch=>setInput({...input,...patch})}/><label>{t('Collaboration proposal (optional)','合作構想（選填）')}<textarea maxLength={4000} rows={4} value={input.pitch} onChange={e=>setInput({...input,pitch:e.target.value})}/></label><label className="k-checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('I confirm these business and contact details are correct.','我確認以上商戶及聯絡資料正確。')}</label></fieldset>
   {unknown&&<p role="status">{t('The result is not confirmed. Retry the same application; do not submit another.','尚未確認結果，請重試同一申請。')}</p>}
   <button className="k-btn primary" type="submit" disabled={busy||!confirmed}>{unknown?t('Retry same application','重試同一申請'):t('Submit merchant application','提交商戶申請')}</button>
  </form>}
  {data?.applications.length? <details><summary>{t('Recent application history (up to 20)','最近申請紀錄（最多 20 項）')}</summary>{data.applications.map(a=><article className="k-collab-history" key={a.id}><h3>{a.companyName}</h3><p>{({pending:t('Pending review','待審批'),approved:t('Approved','已獲批'),rejected:t('Rejected','未獲批')})[a.status]} · {new Date(a.createdAt).toLocaleDateString(locale)}</p>{a.decisionReason&&<p>{a.decisionReason}</p>}</article>)}</details>:null}
 </section>;
}
