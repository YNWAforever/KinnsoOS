'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useApp} from '../travel/ui';
import {templateById} from '../../lib/studio/templates';
import type {TemplateId} from '../../lib/studio/contracts';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useStudioQuestion} from './useStudioQuestion';
import {TripDraftHandoff} from './TripDraftHandoff';

/** Manual intake only. Persisted actions still happen in the original workflow. */
export function TaskStarter({templateId,actorId}:{templateId:TemplateId;actorId:string|null}){
 const {t,href}=useApp(),task=templateById(templateId);
 const [question,setQuestion]=useStudioQuestion(actorId,templateId);
 const [notes,setNotes]=useState(''),[prepared,setPrepared]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[valid,setValid]=useState(true);
 const [tripDraft,setTripDraft]=useState(false);
 useEffect(()=>subscribeAccountInvalidation(next=>{
  if(next!==actorId){setNotes('');setPrepared(false);setStatus('');setError('');setValid(false);}
 }),[actorId]);
 const brief=[t(task.en,task.title),question.trim(),notes.trim()].filter(Boolean).join('\n\n');
 function edit(){setPrepared(false);setStatus('');setError('');}
 async function copy(){
  setStatus('');setError('');
  try{await navigator.clipboard.writeText(brief);setStatus(t('Brief copied.','已複製 brief。'));}
  catch{setError(t('Could not copy. Select and copy the prepared text below.','未能複製，請選取下方 brief 文字再手動複製。'));}
 }
 if(!valid)return <p role="alert">{t('Your account changed. Start a new task.','帳戶已變更，請重新開始任務。')}</p>;
 if(tripDraft&&templateId==='T1')return <TripDraftHandoff key={actorId??'guest'} actorId={actorId} initialNote={brief}/>;
 return <section className="cs-card cs-task-starter">
  <h1>{t(task.en,task.title)}</h1>
  <label>{t('Question','問題')}<textarea rows={3} maxLength={8000} value={question} onChange={event=>{setQuestion(event.target.value);edit();}}/></label>
  <label>{t('Your notes','你的筆記')}<textarea rows={4} maxLength={8000} value={notes} onChange={event=>{setNotes(event.target.value);edit();}}/></label>
  <button className="k-btn primary" disabled={!question.trim()} onClick={()=>setPrepared(true)}>{t('Review brief','檢視 brief')}</button>
  {prepared&&<section className="cs-brief-preview">
   <label>{t('Prepared brief','已整理的 brief')}<textarea readOnly rows={8} value={brief}/></label>
   <p>{t('This brief is not saved. Copy it before leaving or reloading.','這份 brief 尚未保存，離開或重新載入前請先複製。')}</p>
   <button className="k-btn" onClick={()=>void copy()}>{t('Copy brief','複製 brief')}</button>
   {templateId==='T1'&&<button className="k-btn primary" onClick={()=>setTripDraft(true)}>{t('Prepare a trip draft','整理成行程草稿')}</button>}
   {status&&<p role="status">{status}</p>}{error&&<p className="cs-error" role="alert">{error}</p>}
  </section>}
  {!prepared&&<p className="cs-note">{t('Prepare with your own text. Saving and sharing happen in the existing workflow.','先用自己的文字整理；保存及分享在原有流程中完成。')}</p>}
  <div className="cs-actions"><Link className="k-btn" href={href(task.destination)}>{t('Open existing workflow','進入既有流程')}</Link></div>
 </section>;
}
