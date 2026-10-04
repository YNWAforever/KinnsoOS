'use client';
import {useState,useRef,useEffect} from 'react';
import Link from 'next/link';
import {useApp} from '../travel/ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {agentRequest} from '../../lib/agent/repository';
import {trips} from '../../lib/trips/repository';
import type {TripSnapshot} from '../../lib/contracts/trips';
import type {AgentResult,TripProposal} from '../../lib/agent/result-contract';
import {canonicalUrl} from '../../lib/agent/result-contract';
import type {AgentTask} from '../../lib/agent/policy';
const descriptions:Record<AgentTask,[string,string]>={sourceQA:['Source questions: read published sources and verification dates.','來源問答：查看已公開來源及核實日期。'],tripSuggestion:['Trip suggestions: preview your owned trip and confirm each change.','行程建議：預覽你擁有的行程，逐項確認套用。'],creatorMaterials:['Creator materials: read your own material for organization.','Creator 素材整理：只讀取自己的素材，提供整理參考。'],merchantBrief:['Merchant brief: owner or marketing members can preview before editing.','Merchant brief 建議：限 owner / marketing 成員，先預覽再於商戶編輯器修改。']};
const taskLabels:Record<AgentTask,[string,string]>={sourceQA:['Source questions','來源問答'],tripSuggestion:['Trip suggestions','行程建議'],creatorMaterials:['Creator materials','Creator 素材整理'],merchantBrief:['Merchant brief','Merchant brief 建議']};
export default function AgentWorkspace({actorId,roles=[],initialTrip=null,merchantId,connected=false,contextLoading=false}:{actorId:string|null;roles?:string[];initialTrip?:TripSnapshot|null;merchantId?:string;connected?:boolean;contextLoading?:boolean}) {
 const {locale,t}=useApp();
 const [task,setTask]=useState<AgentTask>('sourceQA');const [prompt,setPrompt]=useState('');const [result,setResult]=useState<AgentResult|null>(null);
 const [trip,setTrip]=useState(initialTrip);const [busy,setBusy]=useState(false);const [status,setStatus]=useState('');
 const generation=useRef(0);const pending=useRef(false);const commandRequest=useRef<{proposal:TripProposal;requestId:string}|null>(null);
 const [valid,setValid]=useState(true);
 // Backend snapshots can be re-materialized as new objects without changing their
 // owner/id/revision. Reference churn must not erase a controlled query. Actual
 // context changes still clear every private draft and fence outstanding requests.
 const contextKey=JSON.stringify([actorId,initialTrip?.id??null,initialTrip?.revision??null,merchantId??null,connected,[...roles].sort()]);
 const [readyContext,setReadyContext]=useState<string|null>(null);const ready=readyContext===contextKey;
 function clear(){setReadyContext(null);setTrip(null);setResult(null);setPrompt('');setStatus('');commandRequest.current=null;pending.current=false;setBusy(false);}
 useEffect(()=>{++generation.current;clear();setTrip(initialTrip);setValid(true);setReadyContext(contextKey);const unsub=subscribeAccountInvalidation(next=>{if(next!==actorId){++generation.current;clear();setValid(false);}});return()=>{++generation.current;unsub();};},[contextKey]);
 // A selected trip is not an established context until its owned snapshot arrives.
 // Lock input during that read so the ensuing privacy reset cannot erase new text.
 const canUse=(kind:AgentTask)=>!contextLoading&&ready&&connected&&valid&&!!actorId&&(kind!=='creatorMaterials'||roles.includes('creator'))&&(kind!=='merchantBrief'||roles.includes('merchant')&&!!merchantId)&&(kind!=='tripSuggestion'||!!trip);
 async function run(){
  if(pending.current||!canUse(task)||!prompt.trim())return;
  pending.current=true;setBusy(true);setStatus('');setResult(null);commandRequest.current=null;
  const current=++generation.current;
  try{const response=await agentRequest({task,prompt,tripId:task==='tripSuggestion'?trip?.id:undefined,merchantId:task==='merchantBrief'?merchantId:undefined,locale:locale==='en'?'en':'zh-hk',requestId:crypto.randomUUID()});
   if(current!==generation.current)return;
   if(response.ok)setResult(response.data);else if(response.code==='FORBIDDEN'||response.code==='AUTH_REQUIRED'){clear();setValid(false);}else setStatus(t('Sources are unavailable. Continue in the ordinary editor.','來源服務暫不可用；可以繼續在普通編輯器修改。'));
  }finally{if(current===generation.current){pending.current=false;setBusy(false);}}
 }
 async function apply(proposal:TripProposal){
  if(pending.current||!canUse('tripSuggestion')||!trip||proposal.payload.tripId!==trip.id)return;
  if(proposal.payload.expectedRevision!==trip.revision){setStatus(t('Trip changed. Generate a new preview.','行程已有修改。請重新產生預覽。'));return;}
  pending.current=true;setBusy(true);const current=generation.current;
  // Preserve an uncertain retry's UUID. Each new preview/command receives a new request ID.
  if(commandRequest.current?.proposal!==proposal)commandRequest.current={proposal,requestId:crypto.randomUUID()};
  try{const response=await trips.apply(trip.id,proposal.payload.expectedRevision,commandRequest.current.requestId,proposal.payload.command);
   if(current!==generation.current)return;
   if(response.ok){setTrip(response.data);setResult(null);commandRequest.current=null;setStatus(t('Change applied.','這項行程修改已套用。'));}
   else if(response.code==='CONFLICT'){setStatus(t('Trip changed. Read again and generate a new preview.','行程已有修改。請重新讀取並產生預覽。'));setResult(null);commandRequest.current=null;const fresh=await trips.get(trip.id);if(current===generation.current&&fresh.ok)setTrip(fresh.data);}
   else if(response.code==='FORBIDDEN'||response.code==='AUTH_REQUIRED'){clear();setValid(false);}
   else setStatus(t('Change is unconfirmed. Retry this change or return to the ordinary editor.','修改未確認成功。可重試這項修改，或回到普通編輯器。'));
  }finally{if(current===generation.current){pending.current=false;setBusy(false);}}
 }
 return <section className="k-card"><h2>{t('Source-based task preview','有來源的任務預覽')}</h2><p>{t('Paid AI is not configured. Source excerpts and proposed changes require confirmation.','目前使用來源摘錄模式。付費 AI 尚未設定。所有建議均需自行確認。')}</p>
  <label>{t('Task','任務')}<select aria-label={t('Task','任務')} value={task} disabled={busy||contextLoading||!ready} onChange={e=>{generation.current++;setTask(e.target.value as AgentTask);setResult(null);setStatus('');commandRequest.current=null;}}>{Object.entries(taskLabels).map(([key,label])=><option key={key} value={key} disabled={!canUse(key as AgentTask)}>{t(...label)}</option>)}</select></label>
  <p>{t(...descriptions[task])}</p><label>{t('Query','查詢')}<textarea aria-label={t('Query','查詢')} maxLength={50000} value={ready?prompt:''} disabled={busy||contextLoading||!ready||!valid||!actorId||!connected} onChange={e=>{setPrompt(e.currentTarget.value);setResult(null);generation.current++;}}/></label>
  <button className="k-btn primary" type="button" disabled={busy||!canUse(task)||!prompt.trim()} onClick={()=>void run()}>{busy?t('Working…','處理中…'):t('Read sources and preview','查看來源及預覽')}</button>
  {!connected&&<p>{t('Sign in to a connected account to read sources.','請登入已連接的帳戶使用來源服務。')}</p>}
  <p role="status" aria-live="polite">{status}</p>
  {ready&&valid&&result&&<div><p>{t('Mode','模式')}：{result.capabilityMode} · AI：{result.providerStatus}</p><div style={{whiteSpace:'pre-wrap'}}>{result.answer}</div>
   <ul>{result.sources.map((s,i)=>{const url=canonicalUrl(s.url);return <li key={i}>{url?<a href={url} target="_blank" rel="noopener noreferrer">{s.title}</a>:s.title} · {s.verifiedAt?t('Verified: ','核實：')+s.verifiedAt:t('Verification date unknown','核實日期未知')}</li>;})}</ul>
   {result.proposedActions.map((p,i)=><div key={i}><h3>{t('Trip change preview','行程修改預覽')}</h3><p>{t('Current revision','目前版本')}：{p.payload.expectedRevision}</p><p>{t('Original order','原次序')}：{trip?.days.flatMap(d=>d.stops.map(s=>s.title)).join(' → ')}</p><p>{t('Move to the first position of its day: ','移至該天首位：')}{trip?.days.flatMap(d=>d.stops).find(s=>s.id===('id'in p.payload.command?p.payload.command.id:''))?.title??t('Trip stop','行程站點')}</p><button type="button" disabled={busy||!canUse('tripSuggestion')} onClick={()=>void apply(p)}>{t('Confirm and apply this change','確認並套用這項修改')}</button></div>)}
  </div>}
  <Link href={`/${locale}/trips${ready&&valid&&trip?'/'+trip.id:''}`}>{t('Return to trip editor','返回普通行程編輯器')}</Link>
 </section>;
}
