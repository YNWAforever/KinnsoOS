'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useApp} from '../travel/ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {createBriefFromSources,readableBrief} from '../../lib/studio/evidence';
import {buildGuideProjection} from '../../lib/studio/guide-handoff';
import {clearGuestQuestion} from '../../lib/studio/guest-draft';
import {useStudioQuestion} from './useStudioQuestion';
import {studioRepository,studioRequest,verifiedCommand} from '../../lib/studio/repository';
import {rememberStudioRecovery as remember,forgetStudioRecovery as forget,readStudioRecovery} from '../../lib/studio/recovery';
import {sameValue} from '../../lib/studio/contracts';
import type {StudioBrief,SourceDocument,StudioThread,StudioCommand,StudioEnvelope,StudioReceipt,GuideProjection,GuideHandoff,StudioGuideDraft} from '../../lib/studio/contracts';
import {DocumentPicker} from './DocumentPicker';
import {EvidencePanel} from './EvidencePanel';
import {BriefEditor} from './BriefEditor';
import {GuideHandoff as HandoffPreview} from './GuideHandoff';
import {resolveMatchedSources} from '../../lib/discovery/brief';
import type {DiscoveryStore,MatchedSourceInput} from '../../lib/discovery/contracts';

type Pending=StudioEnvelope<StudioCommand>;
export function ThreadWorkspace({actorId,enabled,handoffEnabled,roles,threadId,discoveryStore,matchedContext}:{actorId:string|null;enabled:boolean;handoffEnabled:boolean;roles:string[];threadId?:string;discoveryStore?:DiscoveryStore;matchedContext?:MatchedSourceInput}){
 const {t,href,locale}=useApp(),router=useRouter();
 const [sources,setSources]=useState<SourceDocument[]>([]),[selected,setSelected]=useState<string[]>([]),[brief,setBrief]=useState<StudioBrief|null>(null);
 const [question,setQuestion]=useStudioQuestion(actorId,'C1','',!threadId),[messages,setMessages]=useState<{role:string;body:string}[]>([]),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[denied,setDenied]=useState(false),[preview,setPreview]=useState<GuideProjection|null>(null),[conflict,setConflict]=useState<StudioBrief|null>(null);
 const id=useRef(threadId??crypto.randomUUID()),created=useRef(false),threadRevision=useRef(0),persistedSources=useRef(new Set<string>()),epoch=useRef(0),busyRef=useRef(false),editEpoch=useRef(0),savedBody=useRef('');
 const pending=useRef<Pending|null>(null),domain=useRef<GuideHandoff|null>(null),recoverId=useRef<string|null>(null);
 function clearPrivate(){epoch.current++;setSources([]);setSelected([]);setBrief(null);setMessages([]);setQuestion('');setPreview(null);setConflict(null);pending.current=null;domain.current=null;recoverId.current=null;setUnknown(false);setDenied(true);clearGuestQuestion();}
 function errorText(code:string){return code==='CONFLICT'?t('A newer version exists. Review it before saving another intent.','已有較新版本，請先比對再保存新意圖。'):code==='INVALID'?t('This input was rejected; correct it before a new save.','輸入未獲接納，請修正後再保存。'):code==='RESTRICTED'?t('A source is restricted. Rebuild using permitted sources.','來源已受限，請用仍有權使用的資料重建。'):t('The result is unknown. Keep the same request while checking or retrying.','結果未知。核對或重試時會保留同一個請求。');}
 function applySnapshot(value:StudioThread,replaceBrief=true){created.current=true;threadRevision.current=value.revision;setSources(value.sources);persistedSources.current=new Set(value.sources.map(s=>s.id));setMessages(value.messages);if(replaceBrief){const b=value.artifacts[0]??null;setBrief(b);savedBody.current=JSON.stringify(b);setSelected([...new Set(b?b.blocks.flatMap(block=>block.sources.map(ref=>ref.sourceId)):(value.messages.at(-1)?.sourceIds??[]))].filter(id=>value.sources.some(s=>s.id===id&&s.status==='active')));}}
 useEffect(()=>{
  clearGuestQuestion();epoch.current++;const generation=epoch.current;setDenied(false);
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId)clearPrivate();});
  async function load(){
   if(!actorId||!enabled)return;
   if(threadId){const r=await studioRepository(actorId).getThread(threadId);if(epoch.current!==generation)return;if(r.ok)applySnapshot(r.data);else{if(['AUTH_REQUIRED','FORBIDDEN','RESTRICTED'].includes(r.code))clearPrivate();setError(errorText(r.code));}}
   const previous=readStudioRecovery(actorId,id.current);if(previous){recoverId.current=previous.requestId;setUnknown(true);setStatus(t('An earlier request needs an outcome check.','上次請求需要核對結果。'));}
  }
  void load();return()=>{epoch.current++;unsubscribe();};
 },[actorId,enabled,threadId]); // Account changes remount this workspace; all responses also check the epoch.
 function envelope(kind:StudioCommand['kind'],targetId:string,revision:number,data:Record<string,unknown>):Pending{return{requestId:crypto.randomUUID(),expectedRevision:revision,payload:{kind,targetId,data}};}
 async function commit<T>(intent:Pending):Promise<StudioReceipt<T>>{
  if(!actorId||!enabled||denied)throw Error('UNAVAILABLE');
  if(pending.current&&pending.current.requestId!==intent.requestId)throw Error('PENDING_INTENT');
  const generation=epoch.current;pending.current=structuredClone(intent);remember(actorId,id.current,intent.requestId);
  const result=await verifiedCommand<T>(actorId,intent);if(epoch.current!==generation)throw Error('STALE_SCOPE');
  if(!result.ok){
   if(result.retryable){setUnknown(true);recoverId.current=intent.requestId;}
   else{pending.current=null;forget(actorId,id.current,intent.requestId);if(['AUTH_REQUIRED','FORBIDDEN','RESTRICTED'].includes(result.code))clearPrivate();}
   throw Error(result.code);
  }
  pending.current=null;recoverId.current=null;setUnknown(false);forget(actorId,id.current,intent.requestId);return result.data;
 }
 async function ensureThread(){
  if(created.current)return;
  window.history.replaceState(null,'',href('workroom/t/'+id.current));
  const r=await commit<StudioThread>(envelope('createThread',id.current,0,{title:question.slice(0,180)||t('Guide brief','攻略 brief'),topic:'creation',templateId:'C1'}));
  created.current=true;threadRevision.current=r.revision;
  window.history.replaceState(null,'',href('workroom/t/'+id.current));
 }
 async function action(work:()=>Promise<void>){
  if(busyRef.current||denied)return;busyRef.current=true;setBusy(true);setError('');const generation=epoch.current;
  try{await work();}catch(e){if(epoch.current===generation){const code=e instanceof Error?e.message:'UNAVAILABLE';if(['AUTH_REQUIRED','FORBIDDEN','RESTRICTED'].includes(code))clearPrivate();else if(code!=='STALE_SCOPE')setError(errorText(code));}}finally{busyRef.current=false;if(epoch.current===generation)setBusy(false);}
 }
 async function addSource(title:string,text:string,own:boolean){
  const generation=epoch.current,hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');if(generation!==epoch.current)return;
  const source:SourceDocument={id:crypto.randomUUID(),threadId:id.current,ownerId:actorId??'guest',title,text,hash,version:1,aclVersion:1,rights:own?'own':'unknown',status:'active'};
  setSources(previous=>[...previous,source]);setSelected(previous=>[...previous,source.id]);setPreview(null);setStatus(t('Document is in this page only; not saved.','文件只在此頁，尚未保存。'));
 }
 async function persistSources(ids:string[]){
  for(const source of sources){if(!ids.includes(source.id)||persistedSources.current.has(source.id)||source.status!=='active')continue;
   const receipt=await commit<SourceDocument>(envelope('saveSource',source.id,0,{threadId:id.current,title:source.title,text:source.text,rights:source.rights,attested:source.rights==='own',...(source.rights==='licensed'?{matchContext:matchedContext}:{})}));persistedSources.current.add(source.id);setSources(values=>values.map(s=>s.id===source.id?receipt.data:s));
  }
 }
 function changeBrief(value:StudioBrief){editEpoch.current++;setBrief(value);setPreview(null);setStatus(t('New edits are not saved.','新修改尚未保存。'));}
 async function saveBrief(){
  if(!actorId){setError(t('Sign in before saving. This trial is not stored.','保存前請先登入；試問尚未儲存。'));return;}
  if(!enabled){setError(t('Private saving is not connected. Your text remains in this page only.','私人保存尚未接通，文字只留在此頁。'));return;}
  if(!brief||!readableBrief(brief,sources)){setError(t('Check your selected sources first.','請先核對已選來源。'));return;}
  const captured=structuredClone(brief),edits=editEpoch.current;
  await action(async()=>{
   await ensureThread();await persistSources(captured.blocks.flatMap(block=>block.sources.map(ref=>ref.sourceId)));
   const r=await commit<StudioBrief>(envelope('saveArtifact',captured.id,captured.revision,{threadId:id.current,brief:captured}));
   savedBody.current=JSON.stringify(r.data);setBrief(current=>current?editEpoch.current===edits?r.data:{...current,revision:r.revision}:null);
   setStatus(editEpoch.current===edits?t('Private brief saved and read back.','私人 brief 已保存並讀回核對。'):t('Earlier version saved; newer edits are still pending.','較早版本已保存；新修改仍待保存。'));
  });
 }
 async function discuss(){
  if(!question.trim())return;
  const body=question,refs=[...selected];setMessages(m=>[...m,{role:'user',body},{role:'assistant',body:t(`Source excerpt mode: ${refs.length} selected document(s). Open the evidence, then create a separate brief. No outside facts have been verified.`,`來源摘錄模式：已選 ${refs.length} 份文件。你可以展開證據，再另開 brief。未核實任何外部事實。`)}]);setQuestion('');
  if(actorId&&enabled)await action(async()=>{await ensureThread();await persistSources(refs);const r=await commit<StudioThread>(envelope('appendMessage',id.current,threadRevision.current,{body,sourceIds:refs}));threadRevision.current=r.revision;setStatus(t('Discussion saved and read back.','討論已保存並讀回。'));});
 }
 async function restrict(idToRestrict:string){
  const source=sources.find(s=>s.id===idToRestrict);if(!source)return;
  await action(async()=>{if(persistedSources.current.has(source.id))await commit(envelope('restrictSource',source.id,source.version,{}));setSources(values=>values.map(s=>s.id===source.id?{...s,status:'restricted',text:'',aclVersion:s.aclVersion+1,version:s.version+1}:s));setSelected(ids=>ids.filter(x=>x!==source.id));setBrief(null);setPreview(null);savedBody.current='';setStatus(t('Source stopped. Rebuild the brief with permitted sources.','已停用來源，請用仍有權使用的資料重建 brief。'));});
 }
 async function saveGuide(handoff:GuideHandoff){
  if(!actorId)return;domain.current=handoff;setUnknown(true);
  const generation=epoch.current;
  const ack=await studioRequest<StudioGuideDraft>('/api/creator/guides/'+handoff.guideId,actorId,'PUT',{expectedRevision:handoff.expectedRevision,requestId:handoff.domainRequestId,payload:handoff.payload});
  if(epoch.current!==generation)return;
  if(!ack.ok){if(!ack.retryable){domain.current=null;setUnknown(false);forget(actorId,id.current,recoverId.current);if(['AUTH_REQUIRED','FORBIDDEN','RESTRICTED'].includes(ack.code))clearPrivate();}throw Error(ack.code);}
  const read=await studioRequest<StudioGuideDraft>('/api/creator/guides/'+handoff.guideId,actorId);
  if(epoch.current!==generation)return;
  if(!read.ok)throw Error(read.code);
  if(read.data.id!==ack.data.id||read.data.revision!==ack.data.revision||!sameValue(read.data.payload,handoff.payload))throw Error('UNAVAILABLE');
  domain.current=null;setUnknown(false);forget(actorId,id.current,recoverId.current);recoverId.current=null;setStatus(t('Guide draft saved and read back. Continue in the existing editor.','攻略草稿已保存並讀回。繼續使用既有編輯器。'));router.push(href('studio/guides/'+handoff.guideId+'/edit'));
 }
 async function handoff(){if(!actorId||!brief||!preview)return;
  if(!handoffEnabled||!roles.includes('creator')){setError(t('An active creator and the handoff capability are required.','需要有效創作者身分及已接通的交接能力。'));return;}
  if(JSON.stringify(brief)!==savedBody.current){setPreview(null);setError(t('Save and review the latest brief first.','請先保存並核對最新 brief。'));return;}
  await action(async()=>{const intent=envelope('prepareGuideSave',crypto.randomUUID(),0,{artifactId:brief.id,artifactRevision:brief.revision,guideId:crypto.randomUUID(),expectedGuideRevision:0,domainRequestId:crypto.randomUUID(),selectedBlockIds:preview.blockIds,confirmed:true});const r=await commit<GuideHandoff>(intent);recoverId.current=intent.requestId;remember(actorId,id.current,intent.requestId);await saveGuide(r.data);});
 }
 async function retry(){if(!actorId)return;await action(async()=>{const generation=epoch.current;
  if(domain.current){await saveGuide(domain.current);return;}
  if(pending.current){const intent=pending.current;const result=await commit<unknown>(intent);if(intent.payload.kind==='prepareGuideSave'){recoverId.current=intent.requestId;remember(actorId,id.current,intent.requestId);await saveGuide(result.data as GuideHandoff);return;}}
  else if(recoverId.current){const r=await studioRepository(actorId).getRequest(recoverId.current);if(epoch.current!==generation)return;if(!r.ok)throw Error(r.code);if(r.data.status!=='complete')throw Error(r.data.status==='restricted'?'RESTRICTED':'UNAVAILABLE');const value=r.data.receipt.data as Partial<GuideHandoff>;if(value.operation==='save'){await saveGuide(value as GuideHandoff);return;}setUnknown(false);forget(actorId,id.current,recoverId.current);recoverId.current=null;}
  const fresh=await studioRepository(actorId).getThread(id.current);if(epoch.current!==generation)return;if(!fresh.ok)throw Error(fresh.code);applySnapshot(fresh.data,false);const remote=brief&&fresh.data.artifacts.find(b=>b.id===brief.id);if(remote){setBrief(current=>current?{...current,revision:remote.revision}:remote);savedBody.current=JSON.stringify(remote);}setStatus(t('Request checked. Review your current text before the next save.','請求已核對，下一次保存前請檢查目前文字。'));
 });}
 const dirty=!!brief&&JSON.stringify(brief)!==savedBody.current;
 useEffect(()=>{if(denied||(!dirty&&!unknown&&!busy&&!sources.some(source=>!persistedSources.current.has(source.id))))return;const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};const leave=(event:MouseEvent)=>{const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;if(event.defaultPrevented||!(anchor instanceof HTMLAnchorElement)||anchor.origin!==location.origin||anchor.pathname+anchor.search===location.pathname+location.search)return;if(!window.confirm(t('Unsaved text or an unverified action remains. Leave this page?','仍有未保存文字或未核實的操作。確定離開此頁？'))){event.preventDefault();event.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);};},[dirty,unknown,busy,denied,sources]);
 const locked=busy||unknown||denied;
 return <section className="cs-content"><span className="cs-chip">C1 · {t('Private conversation','私人討論')} · {actorId&&enabled?t('Server checks required','需伺服器核對'):t('This-page trial','本頁試用')}</span><h1>{t('Write a guide brief','撰寫 guide brief')}</h1><p>{t('Your own notes, clear evidence, a draft you can keep improving.','自己的筆記、清楚的證據，一份可以慢慢完善的草稿。')}</p>
 <ol className="cs-steps"><li>1 選文件</li><li>2 開始討論</li><li>3 查看證據</li><li>4 另開 brief</li><li>5 保存成果</li></ol>
 {matchedContext&&discoveryStore&&!denied&&<section className="cs-card" aria-label="已收藏配對來源"><span className="cs-chip">旅程配對 → C1</span><h2>把合適的優惠變成創作證據</h2><p>讀取你已收藏的特定來源版本。商戶文字會保留用途授權及引用，不會變成你的原創聲明。</p><button className="k-btn primary" disabled={locked} onClick={()=>void action(async()=>{const g=epoch.current;const r=await resolveMatchedSources(matchedContext,discoveryStore);if(g!==epoch.current)return;if(!r.ok)throw Error(r.code);setSources(old=>[...old,...r.sources.filter(s=>!old.some(x=>x.id===s.id)).map(s=>({...s,threadId:id.current}))]);setSelected(old=>[...new Set([...old,...r.sources.map(s=>s.id)])]);setStatus('已核對配對證據。可展開來源，再另開私人 brief。');})}>讀取已收藏配對證據</button></section>}
 {!actorId&&<p><Link href={`/${locale}/sign-in?next=${encodeURIComponent(href('workroom'))}`}>{t('Sign in to save','登入後保存')}</Link> · {t('Trial text is not stored and will reset on reload.','試問文字不會儲存，重新載入會重設。')}</p>}
 {denied?<p className="cs-error" role="alert">{t('Account or source access changed. Sign in and select permitted documents again.','帳戶或來源權限已改變，請重新登入並選擇有權使用的文件。')}</p>:<div className={'cs-work-grid'+(brief?' has-brief':'')}><div>
 <DocumentPicker sources={sources} selected={selected} onSelect={ids=>{setSelected(ids);setPreview(null);}} onAdd={addSource} onRestrict={id=>void restrict(id)} locked={locked}/>
 <section className="cs-card"><h2>{t('This conversation','這個討論串')}</h2>{messages.map((m,i)=><p key={i} className={'cs-message '+m.role}>{m.body}</p>)}<label>{t('Your question','你的問題')}<textarea rows={3} maxLength={8000} value={question} disabled={locked} onChange={e=>setQuestion(e.target.value)}/></label><div className="cs-actions"><button className="k-btn" disabled={locked||!question.trim()} onClick={()=>void discuss()}>{t('Discuss selected documents','討論已選文件')}</button><button className="k-btn primary" disabled={locked||!selected.length} onClick={()=>{setBrief(createBriefFromSources(crypto.randomUUID(),id.current,sources,selected));savedBody.current='';setPreview(null);setStatus(t('A separate private brief is open; not saved yet.','已另開私人 brief，尚未保存。'));}}>{t('Open a separate brief','另開 brief')}</button></div><EvidencePanel sources={sources} selected={selected}/></section></div>
 {brief&&<div><BriefEditor brief={brief} onChange={changeBrief} onSave={()=>void saveBrief()} onPreview={()=>{try{if(JSON.stringify(brief)!==savedBody.current)throw Error('UNSAVED');setPreview(buildGuideProjection(brief,brief.blocks.filter(b=>b.intendedUse==='public-candidate').map(b=>b.id),sources));setError('');}catch(e){setError(e instanceof Error&&e.message==='UNSAVED'?t('Save the latest brief first.','請先保存最新 brief。'):t('Choose authored stops with current original-source permission. Private or unverified sources cannot be handed off.','請選取親自填寫的站點並核對原創來源；私人或未驗證來源不可移交。'));}}} status={status||t('Not saved yet.','尚未保存。')} locked={locked}/>{preview&&<HandoffPreview key={JSON.stringify(preview)} projection={preview} disabled={locked} onConfirm={()=>void handoff()} onCancel={()=>setPreview(null)}/>}</div>}
 </div>}
 {error&&<p role="alert" className="cs-error">{error}</p>}{!brief&&status&&<p role="status" className="cs-status">{status}</p>}
 {unknown&&<button className="k-btn" disabled={busy||denied} onClick={()=>void retry()}>{t('Check / retry the same request','核對／重試同一請求')}</button>}
 {!unknown&&brief&&actorId&&<button className="k-btn" disabled={busy||denied} onClick={()=>void action(async()=>{const generation=epoch.current;const r=await studioRepository(actorId).getThread(id.current);if(epoch.current!==generation)return;if(!r.ok)throw Error(r.code);setConflict(r.data.artifacts.find(b=>b.id===brief.id)??null);})}>{t('Compare saved brief','比對已保存 brief')}</button>}
 {conflict&&<section className="cs-card" aria-label="版本比對"><h2>已保存版本 v{conflict.revision}</h2><p>{conflict.title} · {conflict.city}</p><p>{conflict.summary}</p>{conflict.blocks.map(b=><p key={b.id}>{b.title}：{b.text}</p>)}<p>目前表格仍保留你的修改。核對後可選擇保存表格內容，或載入遠端版本。</p><button className="k-btn" onClick={()=>{setBrief(current=>current?{...current,revision:conflict.revision}:conflict);setConflict(null);setStatus('已核對較新版本；下一次保存是新意圖。');}}>保留表格內容，以此版本為基礎</button><button className="k-btn" onClick={()=>{setBrief(conflict);savedBody.current=JSON.stringify(conflict);setConflict(null);setPreview(null);}}>載入已保存版本</button></section>}
 </section>;
}
