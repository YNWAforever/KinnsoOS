'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {request} from '../../lib/trips/repository';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {applicationWebsite,clearApplicationReviewMarker,merchantApplicationDecision,readApplicationReviewMarker,storeApplicationReviewMarker,type ApplicationReviewMarker,type MerchantApplication,type MerchantApplicationCursor,type MerchantApplicationDecision,type MerchantApplicationPage} from '../../lib/merchants/application-review';

const endpoint='/api/ops/merchant-applications';
type Pending=ApplicationReviewMarker;

export function MerchantApplicationReviewPage(props:{actorId:string|null;enabled:boolean}){
 const{t,href}=useApp();
 return <section className="k-page k-merchant"><h1>{t('Merchant onboarding review','商戶加入審批')}</h1><Link className="k-btn" href={href('ops')}>{t('Operations queue','營運待辦')}</Link><MerchantApplicationReview {...props}/></section>;
}

export function MerchantApplicationReview({actorId,enabled}:{actorId:string|null;enabled:boolean}){
 const{t}=useApp();
 const[directory,setDirectory]=useState<MerchantApplicationPage|null>(null),[selected,setSelected]=useState<MerchantApplication|null>(null),[reason,setReason]=useState('');
 const[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[valid,setValid]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState('');
 const epoch=useRef(0),reads=useRef(0),working=useRef(false),pending=useRef<Pending|null>(null),scope=useRef<string|null>(null);
 const locked=loading||busy||unknown;

 function clear(){pending.current=null;working.current=false;setDirectory(null);setSelected(null);setReason('');setLoading(false);setBusy(false);setUnknown(false);setReceipt('');}
 function deny(code:string){epoch.current++;reads.current++;clear();setValid(false);setError(code);}
 async function load(after?:MerchantApplicationCursor){
  if(pending.current||working.current)return;
  const own=epoch.current,read=++reads.current;setLoading(true);setDirectory(null);setSelected(null);setReason('');setError('');
  const result=await request<MerchantApplicationPage>(endpoint+(after?'?'+new URLSearchParams({after:JSON.stringify(after)}):''));
  if(own!==epoch.current||read!==reads.current)return;
  setLoading(false);if(!result.ok){setError(result.code);if(['FORBIDDEN','AUTH_REQUIRED'].includes(result.code))deny(result.code);return;}
  setDirectory(result.data);
 }
 function complete(application:MerchantApplication){
  if(!pending.current||application.id!==pending.current.id||!['approved','rejected'].includes(application.status))return false;
  // Only a terminal server read releases an uncertain intent. A pending read cannot
  // rule out an earlier command that is still running behind a lost acknowledgement.
  try{clearApplicationReviewMarker(window.sessionStorage,actorId!);}catch{/* A retained marker will reconcile again on the next visit. */}
  pending.current=null;setUnknown(false);setSelected(null);setReason('');setError('');setReceipt(application.status);
  setDirectory(previous=>previous?{...previous,applications:previous.applications.filter(item=>item.id!==application.id)}:null);
  if(!directory)void load();
  return true;
 }
 async function reconcile(){
  const intent=pending.current;if(!intent||working.current)return;
  const own=epoch.current;working.current=true;setBusy(true);setError('');
  const result=await request<MerchantApplication>(endpoint+'?'+new URLSearchParams({id:intent.id}));
  if(own!==epoch.current)return;
  working.current=false;setBusy(false);
  if(!result.ok){setError(result.code);if(['FORBIDDEN','AUTH_REQUIRED'].includes(result.code))deny(result.code);return;}
  if(result.data.id!==intent.id){setError('UNAVAILABLE');return;}
  if(!complete(result.data)){setSelected(result.data);setUnknown(true);}
 }
 useEffect(()=>{
  epoch.current++;reads.current++;clear();scope.current=actorId;setError('');setValid(Boolean(actorId&&enabled));
  if(actorId&&enabled){
   try{const marker=readApplicationReviewMarker(window.sessionStorage,actorId);if(marker){pending.current=marker;setReason(marker.reason);setUnknown(true);void reconcile();}else void load();}
   catch{setError('RECOVERY_UNAVAILABLE');setValid(false);}
  }
  const off=subscribeAccountInvalidation(next=>{if(next!==actorId){epoch.current++;reads.current++;clear();setValid(false);scope.current=null;}});
  return()=>{epoch.current++;reads.current++;off();};
 },[actorId,enabled]);

 async function decide(action?:MerchantApplicationDecision['action']){
  if(!actorId||!enabled||!valid||scope.current!==actorId||working.current||loading)return;
  const wasUnknown=unknown;
  if(!pending.current){
   if(!selected||selected.status!=='pending'||!action)return;
   let command:MerchantApplicationDecision;try{command=merchantApplicationDecision({id:selected.id,action,reason});}catch{setError('INVALID');return;}
   try{storeApplicationReviewMarker(window.sessionStorage,actorId,command);}catch{setError('RECOVERY_UNAVAILABLE');return;}
   pending.current=command;
  }else if(action)return;
  const intent=pending.current;
  const own=epoch.current;working.current=true;setBusy(true);setUnknown(true);setError('');setReceipt('');
  const result=await request<MerchantApplication>(endpoint,'POST',intent);
  if(own!==epoch.current)return;
  working.current=false;setBusy(false);
  if(!result.ok){
   setError(result.code);
   if(['FORBIDDEN','AUTH_REQUIRED'].includes(result.code)){deny(result.code);return;}
   if(result.code!=='UNAVAILABLE'&&!wasUnknown){
    // These responses explicitly reject the first command. A previously uncertain
    // command keeps its lock even if a later retry is explicitly rejected.
    try{clearApplicationReviewMarker(window.sessionStorage,actorId);}catch{return;}
    pending.current=null;setUnknown(false);
   }
   return;
  }
  if(!complete(result.data))setError('UNAVAILABLE');
 }

 if(!enabled)return <section className="k-card"><h2>{t('Merchant application review','商戶申請審核')}</h2><p>{t('Merchant application review is unavailable.','商戶申請審核暫不可用。')}</p></section>;
 if(!actorId||!valid||scope.current!==actorId)return <section className="k-card"><h2>{t('Merchant application review','商戶申請審核')}</h2><p role="status">{error==='RECOVERY_UNAVAILABLE'?t('Decision recovery is unavailable. Refresh this page before reviewing.','暫時無法復原審核結果；請重新載入本頁後再審核。'):t('Moderator access is required to review merchant applications.','審核商戶申請需要審核員權限。')}</p></section>;
 const website=applicationWebsite(selected?.websiteUrl);
 return <section className="k-card" aria-label={t('Merchant application review','商戶申請審核')}>
  <h2>{t('Merchant application review','商戶申請審核')}</h2>
  <p>{t('Review the submitted company details and write a decision reason. Approval creates an active merchant profile; rejection records the reason for the applicant.','請查看公司提交的資料並填寫決定原因。批准會建立有效的商戶檔案；拒絕會為申請人記錄原因。')}</p>
  {loading&&<p role="status">{t('Loading pending applications…','正在載入待審核申請…')}</p>}
  {error&&<p role="alert">{error==='INVALID'?t('Write a decision reason of 1 to 500 characters.','請填寫 1 至 500 字的決定原因。'):error==='CONFLICT'?t('This applicant already has a merchant profile. Refresh the application before deciding.','此申請人已有商戶檔案；請重新載入申請後再作決定。'):error==='RECOVERY_UNAVAILABLE'?t('The decision could not be prepared for recovery. Refresh this page before trying again.','未能準備復原決定；請重新載入本頁後再試。'):t('The review result could not be confirmed. Check its current status before continuing.','未能確認審核結果；請先核對目前狀態再繼續。')}</p>}
  {receipt&&<p role="status">{t('Recorded decision: '+receipt,receipt==='approved'?'已記錄決定：批准':'已記錄決定：拒絕')}</p>}
  {unknown&&<div role="status"><p>{t('This decision is awaiting confirmation. Keep the original decision until a recorded outcome is available.','此決定正等待確認；請保留原本決定，直至取得已記錄的結果。')}</p><p>{t('The original decision and reason are kept privately in this browser tab until its recorded outcome is confirmed. Company contact details and the pitch are not kept.','本分頁會暫時保留原本決定及原因，直至確認已記錄的結果；不會保留公司聯絡資料及申請說明。')}</p><button className="k-btn" disabled={busy} onClick={()=>void reconcile()}>{t('Check decision status','核對決定狀態')}</button><button className="k-btn" disabled={busy} onClick={()=>void decide()}>{t('Retry original decision','重試原本決定')}</button></div>}
  <button className="k-btn" disabled={locked} onClick={()=>void load()}>{t('Refresh applications','重新載入申請')}</button>
  {directory&&<>
   <label>{t('Pending merchant application','待審核商戶申請')}<select aria-label={t('Pending merchant application','待審核商戶申請')} value={selected?.id??''} disabled={locked} onChange={event=>{if(locked)return;setSelected(directory.applications.find(application=>application.id===event.target.value)??null);setReason('');setReceipt('');setError('');}}><option value="">{t('Select an application to review','選擇申請以審核')}</option>{directory.applications.map(application=><option key={application.id} value={application.id}>{application.companyName} · {application.createdAt}</option>)}</select></label>
   {directory.applications.length===0&&<p>{t('No pending applications on this page.','本頁沒有待審核申請。')}</p>}
   {directory.nextCursor&&<button className="k-btn" disabled={locked} onClick={()=>void load(directory.nextCursor!)}>{t('Next applications','下一頁申請')}</button>}
  </>}
  {selected&&<article aria-label={t('Submitted application','已提交申請')}>
   <h3>{selected.companyName}</h3>
   <dl><dt>{t('Submitted contact','已提交聯絡人')}</dt><dd>{selected.contactName||t('Not provided','未提供')}</dd><dt>{t('Contact email','聯絡電郵')}</dt><dd>{selected.contactEmail}</dd><dt>{t('Submitted at','提交時間')}</dt><dd>{selected.createdAt}</dd></dl>
   {website?<a href={website} target="_blank" rel="noopener noreferrer">{t('Company website','公司網站')}</a>:<p>{t('No usable website address was provided.','未提供可用的網站地址。')}</p>}
   <h4>{t('Application pitch','申請說明')}</h4><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{selected.pitch||t('No pitch was provided.','未提供申請說明。')}</p>
   <label>{t('Decision reason','決定原因')}<textarea aria-label={t('Decision reason','決定原因')} required maxLength={500} value={reason} disabled={locked} onChange={event=>setReason(event.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box'}}/></label>
   <div><button className="k-btn" type="button" disabled={locked||!reason.trim()} onClick={()=>void decide('approve')}>{t('Approve application','批准申請')}</button><button className="k-btn" type="button" disabled={locked||!reason.trim()} onClick={()=>void decide('reject')}>{t('Reject application','拒絕申請')}</button><button className="k-btn" type="button" disabled={locked} onClick={()=>{if(locked)return;setSelected(null);setReason('');setError('');}}>{t('Cancel review','取消審核')}</button></div>
  </article>}
 </section>;
}
