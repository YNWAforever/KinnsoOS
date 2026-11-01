'use client'
import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import type {GuideDraft} from '@kinnso/journeys/lib/creators/contracts'
import {publicationReadiness} from '@kinnso/journeys/lib/creators/editor-operations'
import {saveOrPublishStudioGuide,recoverBoundGuide} from '@/lib/guides/studio-actions'
import type {BoundGuideIntent} from '@/lib/guides/studio-adapter'
import {StructuredGuideForm} from './StructuredGuideForm'
const storageEvent='kinnso:web-studio-reference';
const subscribeReference=(callback:()=>void)=>{window.addEventListener('storage',callback);window.addEventListener(storageEvent,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(storageEvent,callback);};};
const serverReference=()=>null;
function reference(key:string){try{return sessionStorage.getItem(key);}catch{return null;}}
function writeReference(key:string,value:string|null){try{if(value)sessionStorage.setItem(key,value);else sessionStorage.removeItem(key);window.dispatchEvent(new Event(storageEvent));}catch{}}
export function StudioBoundGuideForm({initial,actorId,locale}:{initial:GuideDraft;actorId:string;locale:string}){
 const [draft,setDraft]=useState(initial),[payload,setPayload]=useState(initial.payload),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[denied,setDenied]=useState(false),[message,setMessage]=useState(''),[confirm,setConfirm]=useState<'save'|'publish'|null>(null),[checked,setChecked]=useState(false)
 const scope=useRef(0),storageKey='kinnso.web.studio.pending.'+actorId+'.'+initial.id;
 const recovery=useSyncExternalStore(subscribeReference,()=>reference(storageKey),serverReference);
 useEffect(()=>{const generation=++scope.current;return()=>{scope.current=generation+1;};},[storageKey]);
 const intent=useRef<BoundGuideIntent|null>(null),zh=locale.toLowerCase()==='zh-hk',t=(en:string,cn:string)=>zh?cn:en
 const dirty=JSON.stringify(payload)!==JSON.stringify(draft.payload),readiness=publicationReadiness(payload)
 function edit(next:typeof payload){setPayload(next);setConfirm(null);setChecked(false);setMessage(t('Changes not saved.','修改尚未保存。'))}
 async function run(){if(busy||(!recovery&&!intent.current&&(!confirm||!checked)))return;setBusy(true);const generation=scope.current,fromStorage=!!recovery&&!intent.current
  const command=intent.current??{actorId,guideId:draft.id,action:confirm??'save',requestId:crypto.randomUUID(),preparationId:crypto.randomUUID(),expectedRevision:draft.revision,payload:structuredClone(payload),confirmed:true as const};if(!fromStorage)intent.current=command
  if(!fromStorage)writeReference(storageKey,command.preparationId)
  try{const result=fromStorage?await recoverBoundGuide({actorId,guideId:draft.id,preparationId:recovery!}):await saveOrPublishStudioGuide(command);if(generation!==scope.current)return
   if(result.ok||!result.retryable){writeReference(storageKey,null)}
   if(result.ok){setDraft(result.draft);setPayload(result.draft.payload);intent.current=null;setPending(false);setConfirm(null);setChecked(false);setMessage(result.published?t('Publication verified by readback.','已讀回核對發布結果。'):t('Private draft saved and read back.','私人草稿已保存並讀回。'))}
   else{setPending(result.retryable);if(!result.retryable)intent.current=null;if(['FORBIDDEN','AUTH_REQUIRED'].includes(result.code)){setDenied(true);setPayload({title:'',city:'',summary:'',content:{days:[]}});}setMessage(result.code==='CONFLICT'?t('Version changed. Your edits remain; reload the saved version before a new confirmation.','版本已變更。你的修改仍在，重新載入已保存版本後才可作新確認。'):t('Outcome not verified. Keep this tab open and retry the same request.','結果尚未核實。請保留此頁，核對或重試同一請求。'))}
  }catch{if(generation!==scope.current)return;setPending(true);setMessage(t('Result unknown; retry keeps the same request.','結果未知；重試會保留同一請求。'))}finally{if(generation===scope.current)setBusy(false)}
 }
 if(denied)return <p role="alert">{t('Account or source access changed. Reload and sign in on this site.','帳戶或來源權限已變更，請重新載入並於此網站登入。')}</p>
 return <main className="k-container py-12"><h1>{t('Your source-linked guide','連結來源的攻略')}</h1><p>{t('This site checks its own login. Saving and publication are separate confirmations.','此網站會獨立驗證登入。保存及發布分開確認。')} v{draft.revision}</p>
 <fieldset disabled={busy||pending||!!recovery}>{(['title','city','summary'] as const).map(key=><label key={key} style={{display:'block'}}>{({title:t('Title','名稱'),city:t('Destination','目的地'),summary:t('Summary','摘要')})[key]}<textarea className="k-input" value={payload[key]} maxLength={key==='summary'?4000:key==='city'?120:200} onChange={e=>edit({...payload,[key]:e.target.value})}/></label>)}
 {payload.content.days.map((day,di)=><fieldset key={di}><legend>{t('Day','第')} {day.offset+1}</legend><label>{t('Day title','日期名稱')}<input className="k-input" value={day.title} onChange={e=>edit({...payload,content:{days:payload.content.days.map((d,i)=>i===di?{...d,title:e.target.value}:d)}})}/></label>{day.stops.map((stop,si)=><div key={si}>{(['title','description'] as const).map(key=><label key={key}>{key==='title'?t('Stop title','站點名稱'):t('Public description','公開描述')}<textarea className="k-input" value={stop[key]} onChange={e=>edit({...payload,content:{days:payload.content.days.map((d,i)=>i===di?{...d,stops:d.stops.map((s,j)=>j===si?{...s,[key]:e.target.value}:s)}:d)}})}/></label>)}<p>{t('Start minute / duration','開始分鐘／停留分鐘')} {stop.startMinuteOfDay??'—'} / {stop.durationMinutes??'—'}</p><button onClick={()=>edit({...payload,content:{days:payload.content.days.map((d,i)=>i===di?{...d,stops:d.stops.filter((_,j)=>j!==si)}:d)}})}>{t('Remove stop','移除站點')}</button></div>)}<button disabled={day.stops.length>=50} onClick={()=>edit({...payload,content:{days:payload.content.days.map((d,i)=>i===di?{...d,stops:[...d.stops,{title:'',description:'',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}:d)}})}>{t('Add stop','加入站點')}</button></fieldset>)}
 <button disabled={payload.content.days.length>=30} onClick={()=>edit({...payload,content:{days:[...payload.content.days,{offset:Math.max(-1,...payload.content.days.map(d=>d.offset))+1,title:'',stops:[]}]}})}>{t('Add day','加入一天')}</button></fieldset>
 <button disabled={busy||pending||!!recovery} onClick={()=>{setConfirm('save');setChecked(false)}}>{t('Review save','核對保存內容')}</button><button disabled={busy||pending||!!recovery||dirty||readiness.issues.length>0} onClick={()=>{setConfirm('publish');setChecked(false)}}>{t('Review publication','核對發布內容')}</button>
 {confirm&&<section><h2>{t('Complete content preview','完整內容預覽')}</h2><h3>{payload.title} · {payload.city}</h3><p>{payload.summary}</p>{payload.content.days.map((day,i)=><article key={i}><h4>{day.offset+1} · {day.title}</h4>{day.stops.map((stop,j)=><div key={j}><p>{stop.title}</p><p>{stop.description}</p><p>{stop.startMinuteOfDay??'—'} / {stop.durationMinutes??'—'} · {stop.placeId??''}</p></div>)}</article>)}<label><input type="checkbox" checked={checked} disabled={busy||pending||!!recovery} onChange={e=>setChecked(e.target.checked)}/>{t('I reviewed every item and its permission.','我已核對每項內容及使用權限。')}</label><button disabled={!checked||busy||pending||!!recovery} onClick={()=>void run()}>{confirm==='publish'?t('Confirm publication','確認發布'):t('Confirm private save','確認私人保存')}</button></section>}
 {(pending||recovery)&&<button disabled={busy} onClick={()=>void run()}>{t('Retry same request','重試同一請求')}</button>}<p role="status">{message}</p>
 <p>{t('Source selections remain attached to this guide. Review the original brief before changing its evidence.','此攻略保留交接時的 brief 版本；後續 brief 修改不會自動覆寫攻略，來源權限仍會核對。')}</p>
 <a href={`/${locale}/studio/guides`}>{t('Back to guides','返回攻略')}</a>
 {/* The existing withdrawal action remains available without bypassing publication. */}
 <StructuredGuideForm id={draft.id} locale={locale} initialVersion={draft.publishedVersion} initialContent={payload.content} withdrawOnly/>
 </main>
}
