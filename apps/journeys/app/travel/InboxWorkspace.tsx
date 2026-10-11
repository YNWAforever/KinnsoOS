'use client';
import {useWorkspaceRecovery} from './useWorkspaceRecovery';
import {emptyCaseDraft,emptySupportDraft,restoreSupportDraft,supportDraftDirty,completeSupportDraft,type CaseDraft} from '../../lib/collaboration/support-drafts';
import {collaborationNotice} from '../../lib/collaboration/reminders';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {supportSubject,supportNextStep,type SupportContextView} from '../../lib/collaboration/support-context';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {inbox,support,deliveryFailures,entityLink,type InboxPage,type InboxCursor,type SupportCase,type DeliveryFailure} from '../../lib/notifications/repository';
export function InboxWorkspace({actorId,enabled}:{actorId:string|null;enabled:boolean}){
 const{t,locale}=useApp();const[data,setData]=useState<InboxPage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[valid,setValid]=useState(true),[unknown,setUnknown]=useState(false);
 const generation=useRef(0),pending=useRef<{command:Record<string,unknown>;id:string}|null>(null);
 function clear(){setData(null);pending.current=null;setUnknown(false);}
 async function load(cursor?:InboxCursor){const own=++generation.current;setBusy(true);const r=await inbox.get(cursor);if(own!==generation.current)return;setBusy(false);if(!r.ok){clear();setError(r.code);return;}setData(r.data);setError('');}
 useEffect(()=>{setValid(true);clear();setError('');const unsub=subscribeAccountInvalidation(next=>{if(next!==actorId){++generation.current;setValid(false);clear();}});if(actorId&&enabled)void load();return()=>{++generation.current;unsub();};},[actorId,enabled]);
 async function send(command?:Record<string,unknown>){if(!pending.current&&command)pending.current={command,id:crypto.randomUUID()};const p=pending.current;if(!p)return;const own=++generation.current;setBusy(true);const r=await inbox.command(p.command,p.id);if(own!==generation.current)return;setBusy(false);if(!r.ok){if(r.code==='FORBIDDEN'||r.code==='AUTH_REQUIRED')clear();setError(r.code);setUnknown(r.code==='UNAVAILABLE');if(r.code!=='UNAVAILABLE')pending.current=null;return;}pending.current=null;setUnknown(false);await load();}
 return <section className="k-page"><h1>{t('Your inbox','你的收件匣')}</h1>{!actorId||!valid?<Link href={`/${locale}/sign-in?next=/${locale}/inbox`}>{t('Sign in','登入')}</Link>:!enabled?<p>{t('Inbox service is not connected yet.','收件匣服務尚未接通。')}</p>:<>
 {error&&<p role="alert">{t('Inbox request was not completed. Refresh or retry.','收件匣請求未完成，請重新載入或重試。')}</p>}<button className="k-btn" disabled={busy||unknown} onClick={()=>void load()}>{t('Refresh inbox','重新載入收件匣')}</button>{unknown&&<button className="k-btn" disabled={busy} onClick={()=>void send()}>{t('Retry the same request','重試相同請求')}</button>}
 {data&&<><p>{data.unreadCount} {t('unread notifications','項未讀通知')}</p><p>{t('Email delivery is not configured. These are in-app notifications.','電郵外送尚未設定；這些是站內通知。')}</p><button className="k-btn" disabled={busy||unknown} onClick={()=>void send({type:'setPreference',channel:'email',enabled:false})}>{t('Opt out of future email delivery','取消未來電郵外送')}</button>{data.items.length===0&&<p>{t('No notifications yet.','暫未有通知。')}</p>}
 {data.items.map(item=><article className="k-card" key={item.id}><h2>{collaborationNotice(item.type,locale)}</h2><p>{item.payload.missionTitle}</p><time dateTime={item.createdAt}>{item.createdAt}</time><p>{item.readAt?t('Read','已讀'):t('Unread','未讀')}</p>{entityLink(item,locale)&&<Link href={entityLink(item,locale)!}>{t('Open related activity','開啟相關活動')}</Link>}<button className="k-btn" disabled={busy||unknown||!!item.readAt} onClick={()=>void send({type:'markRead',id:item.id})}>{t('Mark as read','標示已讀')}</button><Link href={`/${locale}/support?event=${item.id}`}>{t('Ask support about this event','向客服查詢此事件')}</Link></article>)}{data.nextCursor&&<button className="k-btn" disabled={busy||unknown} onClick={()=>void load(data.nextCursor!)}>{t('Older notifications','較早通知')}</button>}</>}
 <Link className="k-btn" href={`/${locale}/support`}>{t('Support cases','客服案件')}</Link></>}</section>;
}
export function SupportWorkspace({actorId,enabled,opsMode=false}:{actorId:string|null;enabled:boolean;opsMode?:boolean}){
 const{t,locale}=useApp();const contextQuery=useSearchParams().toString();const[context,setContext]=useState<SupportContextView|null>(null),[contextError,setContextError]=useState(''),[contextLoading,setContextLoading]=useState(false),[confirmation,setConfirmation]=useState('');const[items,setItems]=useState<SupportCase[]|null>(null),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[valid,setValid]=useState(true),[unknown,setUnknown]=useState(false);
 const [draft,setDraft]=useState(emptySupportDraft);const {subject,message}=draft;
 const setSubject=(value:string|((old:string)=>string))=>setDraft(d=>({...d,subject:typeof value==='function'?value(d.subject):value}));
 const setMessage=(message:string)=>setDraft(d=>({...d,message}));
 const editCase=(id:string,patch:Partial<CaseDraft>)=>setDraft(d=>({...d,cases:{...d.cases,[id]:{...(d.cases[id]??emptyCaseDraft()),...patch}}}));
 const scope=useRef(0),contextGeneration=useRef(0),generation=useRef(0),sending=useRef(false),pending=useRef<{command:Record<string,unknown>;id:string}|null>(null);
 const recovery=useWorkspaceRecovery({actorId,scope:'support:'+opsMode+':'+contextQuery,authorized:items!==null&&valid,draft,pending:pending.current,dirty:supportDraftDirty(draft),restore:value=>{setDraft(restoreSupportDraft(value.draft));if(value.pending?.id&&value.pending.command&&typeof value.pending.command==='object'){pending.current=value.pending as {command:Record<string,unknown>;id:string};setUnknown(true);setError('UNAVAILABLE');}}});
 function clear(){scope.current++;contextGeneration.current++;sending.current=false;setBusy(false);setItems(null);setCursor(null);pending.current=null;setUnknown(false);setDraft(emptySupportDraft());setContext(null);setContextError('');setContextLoading(false);setConfirmation('');}
 async function load(after?:string){const own=++generation.current;setBusy(true);const r=await support.list(opsMode,after);if(own!==generation.current)return;setBusy(false);if(!r.ok){if(r.code==='AUTH_REQUIRED'||r.code==='FORBIDDEN'){clear();if(r.code==='AUTH_REQUIRED')setValid(false);}else{setItems(null);setCursor(null);}setError(r.code);return;}setItems(r.data.items);setCursor(r.data.nextCursor);setError('');}
 async function loadContext(){const own=++contextGeneration.current,ownScope=scope.current;const q=new URLSearchParams(contextQuery);if(opsMode||!q.has('mission'))return;const ids=q.getAll('mission');if(ids.length!==1){setContextError('INVALID');return;}setContextLoading(true);const r=await support.context(ids[0]);if(own!==contextGeneration.current||ownScope!==scope.current)return;setContextLoading(false);setContextError('');if(!r.ok){setContextError(r.code);if(r.code==='AUTH_REQUIRED'){setValid(false);clear();}return;}setContext(r.data);setSubject(value=>value||supportSubject(r.data,locale));}
 async function older(c:SupportCase){if(!c.messagesNextCursor)return;const own=++generation.current;setBusy(true);const r=await support.messages(c.id,c.messagesNextCursor,opsMode);if(own!==generation.current)return;setBusy(false);if(!r.ok){if(r.code==='FORBIDDEN'||r.code==='AUTH_REQUIRED')clear();setError(r.code);return;}setItems(rows=>rows?.map(row=>row.id===c.id?{...row,messages:[...r.data.items,...row.messages],messagesNextCursor:r.data.nextCursor}:row)??null);setError('');}
 useEffect(()=>{setValid(true);clear();setError('');const unsub=subscribeAccountInvalidation(next=>{if(next!==actorId){++generation.current;setValid(false);clear();}});if(actorId&&enabled){void load();void loadContext();}return()=>{scope.current++;contextGeneration.current++;++generation.current;unsub();};},[actorId,enabled,opsMode,contextQuery]);
 async function send(command?:Record<string,unknown>){
  if(sending.current||command&&pending.current)return;
  if(!pending.current&&command)pending.current={command,id:crypto.randomUUID()};
  const p=pending.current;if(!p)return;
  const ownScope=scope.current,own=++generation.current,wasUnknown=unknown;
  const current=()=>own===generation.current&&ownScope===scope.current;
  sending.current=true;setBusy(true);
  try{
  async function confirmed(id:string){
   const completedDraft=completeSupportDraft(draft,p!.command);
   try{await recovery.complete(p!.id,completedDraft);}catch{if(current()){setUnknown(true);setError('UNAVAILABLE');}return;}
   if(!current())return;
   pending.current=null;setUnknown(false);setDraft(completedDraft);
   await load();if(ownScope!==scope.current)return;
   setConfirmation(p!.command.type==='create'?id:'updated');
  }
  if(wasUnknown){
   const receipt=await support.receipt(p.command,p.id);if(!current())return;
   if(!receipt.ok){setError(receipt.code);if(receipt.code==='AUTH_REQUIRED'||receipt.code==='FORBIDDEN'){clear();if(receipt.code==='AUTH_REQUIRED')setValid(false);}return;}
   if(receipt.data.result){await confirmed(receipt.data.result.id);return;}
  }
  try{await recovery.retain(p);}catch{if(current()){setUnknown(true);setError('UNAVAILABLE');}return;}
  if(!current())return;
  const r=await support.command(p.command,p.id);if(!current())return;
  if(!r.ok){
   if(r.code==='FORBIDDEN'||r.code==='AUTH_REQUIRED'){clear();if(r.code==='AUTH_REQUIRED')setValid(false);setError(r.code);return;}
   setError(r.code);setUnknown(wasUnknown||r.code==='UNAVAILABLE');
   if(!wasUnknown&&r.code!=='UNAVAILABLE'){try{await recovery.release(p.id);if(current())pending.current=null;}catch{if(current()){setUnknown(true);setError('UNAVAILABLE');}}}
   return;
  }
  await confirmed(r.data.id);
  }finally{if(ownScope===scope.current){sending.current=false;setBusy(false);}}
 }

 const locked=busy||unknown||items!==null&&!recovery.ready,createLocked=locked||contextLoading||!!contextError||(!opsMode&&new URLSearchParams(contextQuery).has('mission')&&!context);
 return <section className="k-page"><h1>{opsMode?t('Support queue','客服待辦'):t('Your support cases','你的客服案件')}</h1>{!actorId||!valid?<Link href={`/${locale}/sign-in?next=/${locale}/support`}>{t('Sign in','登入')}</Link>:!enabled?<p>{t('Support service is not connected yet.','客服服務尚未接通。')}</p>:<>
 {recovery.saved&&<p role="status">{t('Draft kept on this device for this account.','草稿已保存在此裝置，僅供此帳戶使用。')}</p>}{recovery.error&&<p role="alert">{t('Device recovery is unavailable. Keep this page open and copy your unsent text.','裝置恢復暫時無法使用。請保持本頁開啟並複製未送出的文字。')}</p>}
 {contextError&&<p role="alert">{t('This activity is unavailable for a new support case. Your existing cases remain private and accessible.','此活動暫不能建立客服案件；既有案件仍按你的權限顯示。')}</p>}{contextError&&<button className="k-btn" disabled={busy||unknown||contextLoading} onClick={()=>void loadContext()}>{t('Retry activity access','重新核對活動權限')}</button>}{contextLoading&&<p role="status">{t('Checking activity access…','正在核對活動權限…')}</p>}{confirmation&&<p role="status">{t('Support request confirmed. Reference:','客服請求已確認。參考編號：')} {confirmation}</p>}{error&&<p role="alert">{error==='CONFLICT'?t('This case changed. Refresh before submitting again.','案件已有變動，請重新載入後提交。'):t('Support request was not completed. Refresh or retry.','客服請求未完成，請重新載入或重試。')}</p>}<button className="k-btn" disabled={locked} onClick={()=>void load()}>{t('Refresh cases','重新載入案件')}</button>{unknown&&<button className="k-btn" disabled={busy} onClick={()=>void send()}>{t('Retry the same request','重試相同請求')}</button>}
 {!opsMode&&<form className="k-card" onSubmit={e=>{e.preventDefault();if(createLocked)return;const event=new URLSearchParams(contextQuery).get('event');void send({type:'create',id:crypto.randomUUID(),subject,message,...context?{context:{type:context.type,id:context.id}}:{},...event?{linkedEventId:event}:{}});}}><label>{t('Case subject','案件主題')}<input aria-label={t('Case subject','案件主題')} required maxLength={200} disabled={createLocked} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>{t('Message to support','給客服的訊息')}<textarea aria-label={t('Message to support','給客服的訊息')} required maxLength={4000} disabled={createLocked} value={message} onChange={e=>setMessage(e.target.value)}/></label><button className="k-btn primary" disabled={createLocked}>{t('Create support case','建立客服案件')}</button></form>}
 {draft.legacyText&&<aside className="k-card"><p>{t('Recovered text has no confirmed case. Copy it into the intended case before sending.','恢復的文字未能確認所屬案件。請先複製至正確案件再提交。')}</p><label>{t('Recovered unsent text','恢復的未送出文字')}<textarea readOnly value={draft.legacyText}/></label><button className="k-btn" disabled={locked} onClick={()=>setDraft(d=>({...d,legacyText:''}))}>{t('Dismiss recovered text','清除恢復文字')}</button></aside>}
 {items?.length===0&&<p>{t('No support cases.','沒有客服案件。')}</p>}
 {items?.map(c=>{const composition=draft.cases[c.id]??emptyCaseDraft();const {message,reason,status}=composition;return <article className="k-card" key={c.id}>
  <h2 id={'case-'+c.id}>{c.subject}</h2><p>{c.status} · {t('Assigned owner','指派負責人')}: {c.ownerId??t('Unassigned','未指派')}</p><p>{supportNextStep(c.status,locale)}</p>
  {c.context&&<p>{t('Related collaboration reference','相關合作編號')}: {c.context.id}</p>}<time dateTime={c.updatedAt}>{t('Last updated','最後更新')} {c.updatedAt}</time>
  {c.messagesNextCursor&&<button className="k-btn" disabled={locked} onClick={()=>void older(c)}>{t('Load older messages','載入較早訊息')}</button>}{c.messages.map(m=><p key={m.id}>{m.message}</p>)}
  {opsMode?<form aria-labelledby={'case-'+c.id} onSubmit={e=>{e.preventDefault();if(locked||reason.trim().length<10||(['waiting_customer','resolved'].includes(status)&&!message.trim()))return;void send({type:'review',id:c.id,expectedRevision:c.revision,ownerId:actorId,status,reason,...message.trim()?{message}:{}});}}>
   <label>{t('Case decision','案件決定')}<select aria-label={t('Case decision','案件決定')} disabled={locked} value={status} onChange={e=>editCase(c.id,{status:e.target.value as CaseDraft['status']})}>{['in_progress','waiting_customer','resolved'].map(x=><option key={x} value={x}>{x==='in_progress'?t('In progress','處理中'):x==='waiting_customer'?t('Waiting for customer','等待客戶回覆'):t('Resolved','已解決')}</option>)}</select></label>
   <label>{t('Internal decision reason','內部決定原因')}<textarea required disabled={locked} minLength={10} maxLength={2000} value={reason} onChange={e=>editCase(c.id,{reason:e.target.value})}/></label>
   <label>{t('Response visible to the customer','客戶可見的回覆')}<textarea disabled={locked} required={status!=='in_progress'} maxLength={4000} value={message} onChange={e=>editCase(c.id,{message:e.target.value})}/></label>
   <p>{t('A response is required when asking for details or resolving a case.','要求補充資料或結案時必須填寫回覆。')}</p>
   <button className="k-btn" disabled={locked||reason.trim().length<10||(['waiting_customer','resolved'].includes(status)&&!message.trim())}>{t('Assign to me and apply decision','指派予我並套用決定')}</button>
  </form>:c.status!=='resolved'&&<form aria-labelledby={'case-'+c.id} onSubmit={e=>{e.preventDefault();if(locked||!message.trim())return;void send({type:'reply',id:c.id,expectedRevision:c.revision,message});}}>
   <label>{t('Reply to this case','回覆此案件')}<textarea required maxLength={4000} disabled={locked} value={message} onChange={e=>editCase(c.id,{message:e.target.value})}/></label>
   <button className="k-btn" disabled={locked||!message.trim()}>{t('Send case reply','提交案件回覆')}</button>
  </form>}
 </article>})}{cursor&&<button className="k-btn" disabled={locked} onClick={()=>void load(cursor!)}>{t('Next cases','下一頁案件')}</button>}

 {opsMode&&<DeliveryFailures actorId={actorId} enabled={enabled}/>}
 </>}</section>;
}
function DeliveryFailures({actorId,enabled}:{actorId:string|null;enabled:boolean}){
 const{t}=useApp();const[items,setItems]=useState<DeliveryFailure[]|null>(null),[cursor,setCursor]=useState<string|null>(null),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[valid,setValid]=useState(true);
 const generation=useRef(0),pending=useRef<{command:{id:string;expectedRevision:number;reason:string};requestId:string}|null>(null);
 function clear(){setItems(null);setCursor(null);setReason('');setUnknown(false);pending.current=null;}
 async function load(after?:string){const own=++generation.current;setBusy(true);const r=await deliveryFailures.list(after);if(own!==generation.current)return;setBusy(false);if(!r.ok){clear();setError(r.code);return;}setItems(r.data.items);setCursor(r.data.nextCursor);setError('');}
 useEffect(()=>{setValid(true);clear();const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){++generation.current;setValid(false);clear();}});if(actorId&&enabled)void load();return()=>{++generation.current;unsubscribe();};},[actorId,enabled]);
 async function retry(item?:DeliveryFailure){if(item&&!pending.current)pending.current={command:{id:item.id,expectedRevision:item.revision,reason},requestId:crypto.randomUUID()};const p=pending.current;if(!p)return;const own=++generation.current;setBusy(true);const r=await deliveryFailures.retry(p.command,p.requestId);if(own!==generation.current)return;setBusy(false);if(!r.ok){if(r.code==='FORBIDDEN'||r.code==='AUTH_REQUIRED')clear();setUnknown(r.code==='UNAVAILABLE');if(r.code!=='UNAVAILABLE')pending.current=null;setError(r.code);return;}pending.current=null;setUnknown(false);setReason('');await load();}
 if(!valid||!actorId||!enabled)return null;
 return <section className="k-card"><h2>{t('Failed email deliveries','外送失敗的電郵')}</h2><p>{t('An approved retry starts at most five more attempts for the same event. It does not repeat the business action.','核准重試會為相同事件啟動最多五次外送嘗試，不會重複業務操作。')}</p>{error&&<p role="alert">{error==='CONFLICT'?t('Delivery changed. Refresh before retrying.','外送狀態已變更，請重新載入。'):t('Delivery queue request was not completed.','外送佇列請求未完成。')}</p>}<button className="k-btn" disabled={busy||unknown} onClick={()=>void load()}>{t('Refresh failed deliveries','重新載入外送失敗項目')}</button>{unknown&&<button className="k-btn" disabled={busy} onClick={()=>void retry()}>{t('Retry the same request','重試相同請求')}</button>}<label>{t('Internal reason for retry','重試的內部原因')}<textarea disabled={busy||unknown} value={reason} minLength={10} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>{items?.length===0&&<p>{t('No failed deliveries.','沒有外送失敗項目。')}</p>}{items?.map(item=><article key={item.id}><p>{item.channel} · {item.eventId} · {item.attempts} {t('attempts','次嘗試')}</p><button className="k-btn" disabled={busy||unknown||reason.trim().length<10} onClick={()=>void retry(item)}>{t('Authorize bounded retry','核准有限次重試')}</button></article>)}{cursor&&<button className="k-btn" disabled={busy||unknown} onClick={()=>void load(cursor!)}>{t('Next failed deliveries','下一頁外送失敗項目')}</button>}</section>;
}
