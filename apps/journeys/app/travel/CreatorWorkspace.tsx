'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useApp } from './ui';
import { creators, emptyDraft, emptyProfile, type CreatorProgress, type DraftPayload, type GuideDraft, type Profile } from '../../lib/creators/contracts';
import { PLATFORMS } from '../../lib/creators/handles';
import { subscribeAccountInvalidation } from '../../lib/trips/local-drafts';
import {formatTimeOfDay,parseTimeOfDay,moveDay,moveStop,removeStop,moved} from '../../lib/creators/editor-operations';

export function CreatorWorkspace({ path, actorId, enabled }: { path: string; actorId: string | null; enabled: boolean }) {
 const { t, href, locale } = useApp();
 const [progress, setProgress] = useState<CreatorProgress | null>(null), [error, setError] = useState(''), [validAccount, setValidAccount] = useState(true);
 useEffect(() => {
  setProgress(null); setError(''); setValidAccount(true);
  if (!actorId || !enabled) return;
  let active = true; let timer: ReturnType<typeof setTimeout>;
  const unsubscribe = subscribeAccountInvalidation(next => { if (next !== actorId) { active = false; setProgress(null); setValidAccount(false); } });
  async function load() {
   const r = await creators.progress(); if (!active) return;
   if (!r.ok) { setError(r.code); return; }
   setProgress(r.data); setError('');
   if (r.data.step === 'progress' || r.data.step === 'wait' || (r.data.step === 'review' && !r.data.profileReady)) timer = setTimeout(load, 2000);
  }
  void load(); return () => { active = false; clearTimeout(timer); unsubscribe(); };
 }, [actorId, enabled]);
 if (!actorId || !validAccount) return <section className="k-page"><h1>{t('Your creator studio', '你的創作工作室')}</h1><Link className="k-btn primary" href={`/${locale}/sign-in?next=${encodeURIComponent(href(path))}`}>{t('Sign in to continue', '登入後繼續')}</Link></section>;
 if (!enabled) return <section className="k-page"><h1>{t('Your creator studio', '你的創作工作室')}</h1><p role="status">{t('Creator publishing is not connected yet.', '創作者發布服務尚未接通。')}</p></section>;
 if (error) return <section className="k-page"><h1>{t('Your creator studio', '你的創作工作室')}</h1><p role="alert">{error === 'FORBIDDEN' ? t('This creator account is currently restricted.', '此創作者帳戶目前受限制。') : t('Could not load your studio. Refresh to retry.', '未能載入工作室，請重新整理。')}</p></section>;
 if (!progress) return <p className="k-page" role="status">{t('Loading your studio…', '正在載入工作室…')}</p>;
 if (progress.step !== 'done') return <CreatorOnboarding progress={progress} onDone={() => setProgress({ ...progress, step: 'done' })}/>;
 const editor = path === 'studio/guides/new' || path === 'studio/adventures/new' || path.endsWith('/edit');
 return editor ? <CreatorEditor key={path} path={path}/> : <CreatorGuides/>;
}

function CreatorOnboarding({ progress, onDone }: { progress: CreatorProgress; onDone: () => void }) {
 const { t } = useApp(), router = useRouter();
 const [profile, setProfile] = useState<Profile>(progress.profile ?? emptyProfile()), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
 const [handles, setHandles] = useState(Object.fromEntries(progress.handles.map(h => [h.platform, h.handle])));
 const intent = useRef<{ key: string; requestId: string } | null>(null), [pending, setPending] = useState(false);
 const edited = useRef(false), suggestionKey = useRef(JSON.stringify(progress.profile));
 useEffect(() => { const key = JSON.stringify(progress.profile); if (!edited.current && !pending && !busy && key !== suggestionKey.current) { setProfile(progress.profile); setConfirmed(false); suggestionKey.current = key; } }, [progress.profile, pending, busy]);
 async function confirm() {
  if (!confirmed || busy) return; setBusy(true);
  const key = JSON.stringify(profile); if (intent.current?.key !== key) intent.current = { key, requestId: crypto.randomUUID() };
  const r = await creators.confirm(profile, intent.current.requestId); setBusy(false);
  if (r.ok) { intent.current = null; setPending(false); onDone(); router.refresh(); }
  else { setPending(r.retryable); if (!r.retryable) intent.current = null; setMessage(r.code === 'FORBIDDEN' ? t('This account cannot publish a profile.', '此帳戶目前不能發布檔案。') : t('Confirmation was not completed. Your input is kept; retry the same confirmation.', '確認尚未完成，輸入已保留，請重試同一確認。')); }
 }
 async function saveHandles() {
  setBusy(true); const r = await creators.handles(PLATFORMS.filter(p => handles[p]?.trim()).map(platform => ({ platform, handle: handles[platform] })));
  setBusy(false); setMessage(r.ok ? t('Social handles saved.', '社交帳號已保存。') : t('Could not save handles. Check their format and retry.', '未能保存帳號，請檢查格式並重試。'));
 }
 return <section className="k-page os-editor"><p className="k-eyebrow">{t('CREATOR ONBOARDING', '創作者設定')}</p><h1>{t('Tell travellers about your work.', '向旅人介紹你的創作。')}</h1>
  <p role="status">{progress.jobStatus ? t(`Analysis status: ${progress.jobStatus}.`, `分析狀態：${progress.jobStatus}。`) : t('You can complete your profile manually.', '你可以自行填寫並確認檔案。')}</p>
  <p>{t('Review all suggestions before publishing. You can continue manually while analysis is unavailable.', '發布前請核對所有建議。分析服務未能使用時，你仍可自行完成。')}</p>
  <fieldset disabled={busy || pending}><legend>{t('Social handles (optional)', '社交帳號（選填）')}</legend>{PLATFORMS.map(p => <label key={p}>{p}<input value={handles[p] ?? ''} maxLength={200} onChange={e => setHandles({ ...handles, [p]: e.target.value })}/></label>)}<button className="k-btn" type="button" onClick={saveHandles}>{t('Save handles', '保存帳號')}</button></fieldset>
  <fieldset disabled={busy || pending}><legend>{t('Your public creator profile', '你的公開創作者檔案')}</legend><label>{t('Bio', '個人介紹')}<textarea aria-label={t('Bio', '個人介紹')} value={profile.bio} maxLength={4000} onChange={e => { edited.current = true; setProfile({ ...profile, bio: e.target.value }); }}/></label>
   {(['niches', 'content_pillars', 'tone', 'languages'] as const).map(key => <label key={key}>{({ niches: t('Interests (comma separated)', '興趣（以逗號分隔）'), content_pillars: t('Content themes (comma separated)', '創作主題（以逗號分隔）'), tone: t('Tone (comma separated)', '風格（以逗號分隔）'), languages: t('Languages (comma separated)', '語言（以逗號分隔）') })[key]}<input maxLength={2000} value={profile[key].join(', ')} onChange={e => { edited.current = true; setProfile({ ...profile, [key]: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }); }}/></label>)}
   <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{t('I have reviewed this profile and confirm publication.', '我已核對此檔案並確認發布。')}</label>
  </fieldset>
  <button className="k-btn primary" disabled={busy || !confirmed} type="button" onClick={confirm}>{pending ? t('Retry confirmation', '重試確認') : t('Confirm creator profile', '確認創作者檔案')}</button><p role="status">{message}</p>
 </section>;
}

function CreatorGuides() {
 const { t, href } = useApp(), [items, setItems] = useState<GuideDraft[]>([]), [cursor, setCursor] = useState<string | null>(null), [message, setMessage] = useState(''), [loaded, setLoaded] = useState(false);
 async function load(after?: string) { const r = await creators.list(after); if (r.ok) { setItems(previous => after ? [...previous, ...r.data.items] : r.data.items); setCursor(r.data.nextCursor); setLoaded(true); setMessage(''); } else setMessage(t('Your guides could not be loaded. Retry.', '未能載入你的攻略，請重試。')); }
 useEffect(() => { let active = true; creators.list().then(r => { if (!active) return; if (r.ok) { setItems(r.data.items); setCursor(r.data.nextCursor); setLoaded(true); } else setMessage('Could not load guides.'); }); return () => { active = false; }; }, []);
 return <section className="k-page"><div className="k-section-title"><h1>{t('Your authored guides', '你的創作攻略')}</h1><Link className="k-btn primary" href={href('studio/guides/new')}>{t('Create guide', '建立攻略')}</Link></div><p>{t('Drafts are private. Published versions can be adopted into traveller trips.', '草稿屬私人內容，已發布版本可供旅人套用到行程。')}</p>
  {!loaded && !message && <p role="status">{t('Loading guides…', '正在載入攻略…')}</p>}{loaded && !items.length && <p>{t('Start with your first authored route.', '由你的第一份創作路線開始。')}</p>}
  <div className="k-card-grid">{items.map(d => <article className="os-guide" key={d.id}><div className="os-guide-body"><h2>{d.payload.title || t('Untitled guide', '未命名攻略')}</h2><p>{d.payload.summary}</p><span>{d.status === 'published' ? t(`Published version ${d.publishedVersion}`, `已發布第 ${d.publishedVersion} 版`) : t('Private draft', '私人草稿')}</span><Link className="k-btn" href={href('studio/guides/' + d.id + '/edit')}>{t('Edit guide', '編輯攻略')}</Link></div></article>)}</div>
  {cursor && <button className="k-btn" onClick={() => load(cursor)}>{t('Load more', '載入更多')}</button>}{message && <><p role="alert">{message}</p><button className="k-btn" onClick={() => load()}>{t('Retry', '重試')}</button></>}
 </section>;
}

type EditorState={payload:DraftPayload;keys:{day:string;stops:string[]}[]};
function editorState(payload:DraftPayload,key:(day:number,stop?:number)=>string):EditorState{return{payload,keys:payload.content.days.map((d,i)=>({day:key(i),stops:d.stops.map((_,j)=>key(i,j))}))};}
function CreatorEditor({ path }: { path: string }) {
 const { t, href } = useApp(), router = useRouter();
 const isNew = path.endsWith('/new');
 const editorId=useId();
 const [id, setId] = useState<string | null>(isNew ? null : path.split('/')[2]);
 const [editor,setEditor]=useState(()=>editorState(emptyDraft(),(d,s)=>`${editorId}-${d}-${s??'day'}`));const payload=editor.payload;
 const currentEditor=useRef(editor),editRevision=useRef(0),[undo,setUndo]=useState<EditorState|null>(null);
 const [revision, setRevision] = useState(0), [version, setVersion] = useState(0), [loaded, setLoaded] = useState(isNew), [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [conflict, setConflict] = useState(false), [preview, setPreview] = useState(false), [message, setMessage] = useState('');
 const [actionError, setActionError] = useState<{ action: 'save' | 'publish' | 'withdraw'; message: string } | null>(null);
 const [saveRejected,setSaveRejected]=useState(false);
 const saved = useRef(JSON.stringify(emptyDraft())), head = useRef(0), busyRef = useRef(false), lifetime = useRef(0);
 const intent = useRef<{ action: 'save' | 'publish' | 'withdraw'; requestId: string; revision: number; payload: DraftPayload; editRevision:number } | null>(null);
 useEffect(() => {
  lifetime.current++;
  if (intent.current) {
   busyRef.current = false; setBusy(false); setPending(true);
   setMessage(t('The action was not confirmed. Your input is kept; retry the same action.', '操作尚未確認，輸入已保留，請重試同一操作。'));
  }
  return () => { lifetime.current++; };
 }, []);
 function accept(d: GuideDraft,replace=true) { const p = { ...d.payload, content: d.payload.content ?? emptyDraft().content }; saved.current = JSON.stringify(p); head.current = d.revision; if(replace){const next=editorState(p,()=>crypto.randomUUID());currentEditor.current=next;setEditor(next);setUndo(null);} setRevision(d.revision); setVersion(d.publishedVersion); setLoaded(true); setConflict(d.sourceChanged); }
 function acceptAck(d:GuideDraft,commandEdit:number){const latest=editRevision.current===commandEdit;accept(d,false);if(latest){const next={...currentEditor.current,payload:d.payload};currentEditor.current=next;setEditor(next);}return latest;}
 useEffect(() => {
  if (isNew) { setId(crypto.randomUUID()); return; }
  let active = true; creators.get(path.split('/')[2]).then(r => { if (!active) return; if (r.ok) accept(r.data); else setMessage(r.code === 'NOT_FOUND' ? t('Guide not found.', '找不到攻略。') : t('Could not load the draft. Refresh to retry.', '未能載入草稿，請重新整理。')); });
  return () => { active = false; };
 }, [path, isNew]);
 async function run(action: 'save' | 'publish' | 'withdraw', reviewedCurrentVersion = false) {
  if (!id || busyRef.current || (conflict && !reviewedCurrentVersion)) return;
  const command = intent.current ?? { action, requestId: crypto.randomUUID(), revision: head.current, payload:currentEditor.current.payload,editRevision:editRevision.current };
  const startedLifetime = lifetime.current;
  intent.current = command; busyRef.current = true; setBusy(true);
  setSaveRejected(false);
  const r = command.action === 'save' ? await creators.save(id, command.revision, command.requestId, command.payload) : command.action === 'publish' ? await creators.publish(id, command.revision, command.requestId) : await creators.withdraw(id);
  if (lifetime.current !== startedLifetime) return;
  busyRef.current = false; setBusy(false);
  if (!r.ok) {
   setPending(r.retryable); setConflict(r.code === 'CONFLICT'); if (!r.retryable) intent.current = null;
   if(command.action==='save'&&!r.retryable)setSaveRejected(true);
   setMessage('');
   setActionError({ action: command.action, message: r.code === 'CONFLICT' ? t('Another version was saved. Review the saved draft before retrying.', '已有另一版本保存，請核對已保存草稿後再試。') : r.code === 'INVALID' ? command.action==='publish'?t('Complete the authored route before publication. Your input is kept.', '發布前請完成創作路線，輸入已保留。'):t('The draft was not saved. Check the supported fields or retry; keep this tab open.','草稿未能保存，請檢查支援欄位或重試，並保持此頁開啟。') : t('The action was not confirmed. Your input is kept; retry the same action.', '操作尚未確認，輸入已保留，請重試同一操作。') }); return;
  }
  intent.current = null; setPending(false);
  setActionError(previous => previous?.action === command.action ? null : previous);
  if (command.action === 'save') { const latest=acceptAck(r.data as GuideDraft,command.editRevision); setMessage(latest?t('Draft saved.', '草稿已保存。'):t('Earlier edits saved; newer changes pending.','較早修改已保存，新修改仍待保存。')); if (isNew&&latest) window.history.replaceState(null,'',href('studio/guides/' + id + '/edit')); }
  if (command.action === 'publish') { const result = r.data as { draft: GuideDraft }; const latest=acceptAck(result.draft,command.editRevision); setMessage(latest?t('Version published. Existing traveller copies stay unchanged.', '版本已發布，既有旅人行程保留原樣。'):t('Saved version published; your newer draft edits are kept.','已保存版本已發布，較新的草稿修改仍保留。')); }
  if (command.action === 'withdraw') setMessage(t('New adoptions withdrawn; traveller notes retained.', '已撤回新套用，旅人筆記保留。'));
 }
 const dirty = JSON.stringify(payload) !== saved.current;
 const status = busy ? intent.current?.action === 'publish' ? t('Publishing version…', '正在發布版本…') : intent.current?.action === 'withdraw' ? t('Withdrawing adoption…', '正在撤回套用…') : t('Saving draft…', '正在保存草稿…')
  : message || (dirty ? t('Draft changes pending.', '草稿修改待保存。') : revision > 0 ? t('Draft saved.', '草稿已保存。') : t('Draft not saved yet.', '草稿尚未保存。'));
 function transform(update:(previous:EditorState)=>EditorState,deleting=false){if(pending||conflict)return;const previous=currentEditor.current;const next=update(previous);if(next===previous)return;setUndo(deleting?previous:null);setSaveRejected(false);editRevision.current++;currentEditor.current=next;setEditor(next);setMessage('');}
 function edit(update: (previous: DraftPayload) => DraftPayload) {transform(previous=>({...previous,payload:update(previous.payload)}));}
 function focusItem(key:string){
  const origin=document.activeElement;
  requestAnimationFrame(()=>{if(document.activeElement===origin)document.querySelector<HTMLInputElement>(`[data-editor-focus="${CSS.escape(key)}"]`)?.focus();});
 }
 function reorderDay(from:number,to:number){const key=currentEditor.current.keys[from].day;transform(e=>({payload:{...e.payload,content:moveDay(e.payload.content,from,to)},keys:moved(e.keys,from,to)}));focusItem(key);}
 function reorderStop(day:number,from:number,to:number){const key=currentEditor.current.keys[day].stops[from];transform(e=>({payload:{...e.payload,content:moveStop(e.payload.content,day,from,to)},keys:e.keys.map((k,i)=>i===day?{...k,stops:moved(k.stops,from,to)}:k)}));focusItem(key);}
 useEffect(() => { if (!loaded || !id || !dirty || busy || pending || conflict || saveRejected) return; const timer = setTimeout(() => { void run('save'); }, 900); return () => clearTimeout(timer); }, [payload, loaded, id, busy, pending, conflict, saveRejected]);
 function changeStop(day: number, stop: number, patch: Partial<DraftPayload['content']['days'][number]['stops'][number]>) { edit(p => ({ ...p, content: { days: p.content.days.map((d, i) => i === day ? { ...d, stops: d.stops.map((s, j) => j === stop ? { ...s, ...patch } : s) } : d) } })); }
 return <section className="k-page os-editor" data-testid="creator-editor"><Link href={href('studio/guides')}>{t('Back to guides', '返回攻略')}</Link><h1>{t('Author your route', '創作你的路線')}</h1><p>{t('Write only itinerary content you have rights to publish. Summary text is never converted into stops.', '只填寫你有權公開的行程內容，摘要不會自動變成站點。')}</p>
  {!loaded ? <p role="status">{message || t('Loading draft…', '正在載入草稿…')}</p> : <>
   <fieldset disabled={pending || conflict}><legend>{t('Guide details', '攻略資料')}</legend>{(['title', 'city', 'summary'] as const).map(key => <label key={key}>{({ title: t('Guide title', '攻略名稱'), city: t('Destination', '目的地'), summary: t('Summary', '摘要') })[key]}<input value={payload[key]} maxLength={key === 'summary' ? 4000 : key === 'city' ? 120 : 200} onChange={e => edit(p => ({ ...p, [key]: e.target.value }))}/></label>)}</fieldset>
   {payload.content.days.map((day, di) => <fieldset key={editor.keys[di].day} data-testid="editor-day" disabled={pending || conflict}><legend>{t(`Day ${day.offset + 1}`, `第 ${day.offset + 1} 日`)}</legend><label>{t('Day title', '日期名稱')}<input data-editor-focus={editor.keys[di].day} value={day.title} maxLength={200} onChange={e => edit(p => ({ ...p, content: { days: p.content.days.map((d, i) => i === di ? { ...d, title: e.target.value } : d) } }))}/></label>
    <div><button type="button" className="k-btn" disabled={di===0} onClick={()=>reorderDay(di,di-1)}>{t('Move day up','日期上移')}</button><button type="button" className="k-btn" disabled={di===payload.content.days.length-1} onClick={()=>reorderDay(di,di+1)}>{t('Move day down','日期下移')}</button><button type="button" className="k-btn" onClick={()=>transform(e=>({payload:{...e.payload,content:{days:e.payload.content.days.filter((_,i)=>i!==di)}},keys:e.keys.filter((_,i)=>i!==di)}),true)}>{t('Delete day','刪除日期')}</button></div>
    {day.stops.map((stop, si) => <div key={editor.keys[di].stops[si]} data-testid="editor-stop"><label>{t('Stop title', '站點名稱')}<input data-editor-focus={editor.keys[di].stops[si]} value={stop.title} maxLength={200} onChange={e => changeStop(di, si, { title: e.target.value })}/></label><label>{t('Public description', '公開描述')}<textarea aria-label={t('Public description', '公開描述')} value={stop.description} maxLength={4000} onChange={e => changeStop(di, si, { description: e.target.value })}/></label><label>{t('Start time (HH:mm, optional)', '開始時間（HH:mm，可選）')}<input type="time" step={60} value={formatTimeOfDay(stop.startMinuteOfDay)} onChange={e => {const parsed=parseTimeOfDay(e.target.value);if(parsed.ok)changeStop(di,si,{startMinuteOfDay:parsed.minutes});}}/></label><label>{t('Duration in minutes (optional)', '停留分鐘（可選）')}<input type="number" min={1} max={1440} value={stop.durationMinutes ?? ''} onChange={e => changeStop(di, si, { durationMinutes: e.target.value === '' ? null : Number(e.target.value) })}/></label>
     <button type="button" className="k-btn" disabled={si===0} onClick={()=>reorderStop(di,si,si-1)}>{t('Move stop up','站點上移')}</button><button type="button" className="k-btn" disabled={si===day.stops.length-1} onClick={()=>reorderStop(di,si,si+1)}>{t('Move stop down','站點下移')}</button><button type="button" className="k-btn" onClick={()=>transform(e=>({payload:{...e.payload,content:removeStop(e.payload.content,di,si)},keys:e.keys.map((k,i)=>i===di?{...k,stops:k.stops.filter((_,j)=>j!==si)}:k)}),true)}>{t('Delete stop','刪除站點')}</button>
    </div>)}
    {!day.stops.length&&<p>{t('No stops. Add an authored stop before publishing.','尚未加入站點，發布前請填寫創作站點。')}</p>}
    <button className="k-btn" disabled={day.stops.length >= 50 || payload.content.days.reduce((n, d) => n + d.stops.length, 0) >= 200} onClick={() => transform(e=>({payload:{...e.payload,content:{days:e.payload.content.days.map((d,i)=>i===di?{...d,stops:[...d.stops,emptyDraft().content.days[0].stops[0]]}:d)}},keys:e.keys.map((k,i)=>i===di?{...k,stops:[...k.stops,crypto.randomUUID()]}:k)}))}>{t('Add stop', '加入站點')}</button>
   </fieldset>)}
   {!payload.content.days.length&&<p>{t('No days. Add a day before publishing.','尚未加入日期，發布前請加入日期。')}</p>}
   <button className="k-btn" disabled={pending || conflict || payload.content.days.length >= 30 || payload.content.days.some(d=>d.offset>=364)} onClick={() => transform(e=>({payload:{...e.payload,content:{days:[...e.payload.content.days,{...emptyDraft().content.days[0],offset:Math.max(-1,...e.payload.content.days.map(d=>d.offset))+1}]}},keys:[...e.keys,{day:crypto.randomUUID(),stops:[crypto.randomUUID()]}]}))}>{t('Add day', '加入一天')}</button>
   {undo&&<><button type="button" className="k-btn" disabled={pending||conflict} onClick={()=>{const restored=undo;transform(()=>restored);}}>{t('Undo last deletion','復原上次刪除')}</button><p>{t('Undo is available until the next edit.','下一次修改前可復原此刪除。')}</p></>}
   <button className="k-btn" disabled={busy || pending || conflict} onClick={() => run('save')}>{t('Save draft', '保存草稿')}</button><button className="k-btn" onClick={() => setPreview(!preview)}>{t('Preview', '預覽')}</button>
   <button className="k-btn primary" disabled={busy || pending || conflict || dirty || revision < 1} onClick={() => run('publish')}>{t('Publish structured version', '發布結構化版本')}</button>{version > 0 && <button className="k-btn" disabled={busy || pending || conflict} onClick={() => run('withdraw')}>{t('Withdraw adoption', '撤回套用')}</button>}
   {pending && <button className="k-btn primary" disabled={busy} onClick={() => run(intent.current?.action ?? 'save')}>{t('Retry same action', '重試同一操作')}</button>}
   {conflict && <><p role="alert">{t('A newer source version or draft exists. Your input is retained. Review the published guide and reload the saved draft before continuing.', '已有較新的來源版本或草稿，輸入仍保留。請先核對已發布攻略及重新載入已保存草稿。')}</p><button className="k-btn" onClick={async () => { const r = await creators.get(id!); if (r.ok) accept(r.data); }}>{t('Reload saved draft (replace this form)', '載入已保存草稿（替換此表格）')}</button><button className="k-btn" disabled={busy} onClick={() => run('save', true)}>{t('I reviewed the current version; save this draft', '我已核對目前版本，保存此草稿')}</button></>}
   {actionError && <p role="alert">{actionError.message}</p>}
   <p role="status">{status}</p>
   {version > 0 && <Link className="k-btn" href={href('g/' + id)}>{t('View published guide', '查看已發布攻略')}</Link>}
   {preview && <section aria-label={t('Guide preview', '攻略預覽')}><h2>{payload.title}</h2><p>{payload.summary}</p>{payload.content.days.map((d, i) => <article key={editor.keys[i].day}><h3>{d.title || t(`Day ${d.offset + 1}`, `第 ${d.offset + 1} 日`)}</h3>{d.stops.map((s, j) => <div key={editor.keys[i].stops[j]}><h4>{s.title}</h4><p>{s.description}</p></div>)}</article>)}</section>}
  </>}
 </section>;
}
