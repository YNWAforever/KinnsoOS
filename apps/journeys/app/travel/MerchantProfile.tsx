'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {MerchantContactFields} from './MerchantContactFields';
import {merchantOnboarding,type MerchantProfile as Profile} from '../../lib/merchants/onboarding';
import {profileInput,type ProfileInput} from '../../lib/merchants/onboarding-validation';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
export function MerchantProfile({actorId,merchantId,onLockChange}:{actorId:string|null;merchantId:string;onLockChange:(locked:boolean)=>void}){
 const {t}=useApp();const [saved,setSaved]=useState<Profile|null>(null),[draft,setDraft]=useState<ProfileInput|null>(null),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[valid,setValid]=useState(true);
 const epoch=useRef(0),pending=useRef<{input:ProfileInput;expectedUpdatedAt:string;requestId:string}|null>(null),locked=useRef(false);
 useEffect(()=>{onLockChange(busy||unknown);return()=>onLockChange(false);},[busy,unknown,onLockChange]);
 const fields=(p:Profile):ProfileInput=>({companyName:p.companyName,contactName:p.contactName,contactEmail:p.contactEmail,websiteUrl:p.websiteUrl,tagline:p.tagline,city:p.city,logoUrl:p.logoUrl});
 function fail(code:string){setError(code);if(code==='AUTH_REQUIRED'||code==='FORBIDDEN'){epoch.current++;setValid(false);setSaved(null);setDraft(null);pending.current=null;setUnknown(false);locked.current=false;}}
 async function load(){if(locked.current||!actorId)return;const own=epoch.current;setBusy(true);const r=await merchantOnboarding.profile(merchantId);if(own!==epoch.current)return;setBusy(false);if(r.ok){setSaved(r.data);setDraft(fields(r.data));setError('');setMessage('');}else fail(r.code);}
 useEffect(()=>{epoch.current++;setSaved(null);setDraft(null);setError('');setMessage('');setValid(true);setBusy(false);setUnknown(false);pending.current=null;locked.current=false;void load();const off=subscribeAccountInvalidation(next=>{if(next!==actorId){epoch.current++;setValid(false);setSaved(null);setDraft(null);pending.current=null;locked.current=false;}});return()=>{epoch.current++;off();};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actorId,merchantId]);
 const dirty=!!saved&&!!draft&&JSON.stringify(fields(saved))!==JSON.stringify(draft);
 useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{if(dirty||unknown||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty,unknown,busy]);
 async function save(){if(busy||!valid||!saved||!draft||error==='CONFLICT')return;const own=epoch.current;try{pending.current??={input:profileInput(draft),expectedUpdatedAt:saved.updatedAt,requestId:crypto.randomUUID()};}catch{setError('INVALID');return;}
  locked.current=true;setBusy(true);setError('');setMessage('');const intent=pending.current,r=await merchantOnboarding.save(merchantId,intent.input,intent.expectedUpdatedAt,intent.requestId);if(own!==epoch.current)return;setBusy(false);
  if(!r.ok){setUnknown(r.code==='UNAVAILABLE');if(r.code!=='UNAVAILABLE'){pending.current=null;locked.current=false;}fail(r.code);return;}
  pending.current=null;locked.current=false;setUnknown(false);setSaved(r.data);setDraft(fields(r.data));setMessage(t('Company profile saved.','公司檔案已保存。'));
 }
 if(!actorId||!valid)return <p role="alert">{t('Current owner access is required.','需要目前公司的擁有人權限。')}</p>;
 return <section className="k-card k-collab-card"><h2>{t('Company profile','公司檔案')}</h2><p>{t('Company name, introduction, city, logo and website describe your business. Contact details remain private to your owner account and authorized operations staff.','公司名稱、介紹、城市、標誌及網站用作介紹業務。聯絡資料只供擁有人及獲授權營運人員查看。')}</p>
  {busy&&<p role="status">{t('Loading or saving profile…','正在載入或保存檔案…')}</p>}
  {error&&<p role="alert">{error==='CONFLICT'?t('A newer profile was saved elsewhere. Your edits are kept here; review them before discarding and reloading the saved version.','其他地方已保存較新的檔案。你的修改仍保留在此；請核對後才放棄並重新載入已保存版本。'):error==='INVALID'?t('Check the form and use valid HTTPS links.','請核對表格並填寫有效 HTTPS 連結。'):t('Could not confirm the save. Retry the same changes.','未能確認保存，請重試同一修改。')}</p>}
  {!draft&&!busy&&<button className="k-btn" onClick={()=>void load()}>{t('Retry company profile','重試載入公司檔案')}</button>}
  {draft&&<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy||unknown}><legend>{t('Owner profile settings','擁有人檔案設定')}</legend><MerchantContactFields value={draft} onChange={patch=>setDraft({...draft,...patch})}/><label>{t('Company introduction','公司簡介')}<textarea maxLength={160} value={draft.tagline} onChange={e=>setDraft({...draft,tagline:e.target.value})}/></label><div className="k-collab-fields"><label>{t('City','城市')}<input maxLength={120} value={draft.city} onChange={e=>setDraft({...draft,city:e.target.value})}/></label><label>{t('Logo URL (HTTPS, optional)','標誌網址（HTTPS，選填）')}<input type="url" maxLength={2048} value={draft.logoUrl} onChange={e=>setDraft({...draft,logoUrl:e.target.value})}/></label></div></fieldset>
   <div className="k-actions"><button className="k-btn primary" disabled={busy||error==='CONFLICT'||(!dirty&&!unknown)} type="submit">{unknown?t('Retry same profile save','重試保存同一檔案'):t('Save company profile','保存公司檔案')}</button>{(error==='CONFLICT'||dirty)&&<button className="k-btn" type="button" disabled={busy||unknown} onClick={()=>void load()}>{t('Discard edits and reload','放棄修改並重新載入')}</button>}</div>
   {unknown&&<p role="status">{t('Result unconfirmed. Keep this form open and retry the same save.','尚未確認結果，請保持表格開啟並重試同一保存。')}</p>}
   {message&&<p role="status">{message}</p>}
  </form>}
 </section>;
}
