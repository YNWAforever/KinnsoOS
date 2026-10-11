'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {WorkspaceServiceState} from './WorkspaceServiceState';
import{useWorkspaceRecovery}from'./useWorkspaceRecovery';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {merchants,type Membership} from '../../lib/merchants/repository';
import {finance} from '../../lib/finance/repository';
import {displayMinorUnits} from '../../lib/finance/money';
import type {FinanceCursor,FinanceFilter,FinanceWorkspace as Workspace,MoneyState,ReviewState} from '../../lib/finance/contracts';

export function FinanceWorkspace({actorId,enabled,opsMode=false}:{actorId:string|null;enabled:boolean;opsMode?:boolean}){
 const {t,locale,href}=useApp();
 const [data,setData]=useState<Workspace|null>(null),[memberships,setMemberships]=useState<Membership[]>([]),[merchantId,setMerchantId]=useState(''),[state,setState]=useState(''),[exceptionsOnly,setExceptions]=useState(false),[reason,setReason]=useState(''),[reviewState,setReviewState]=useState<ReviewState>('investigating'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[valid,setValid]=useState(true),[unknown,setUnknown]=useState(false);
 const generation=useRef(0),membersGeneration=useRef(0),allowedMerchants=useRef(new Set<string>()),pending=useRef<{command:Parameters<typeof finance.review>[0];id:string}|null>(null);
 const [membershipsReady,setMembershipsReady]=useState(false),membersLoading=useRef(false),membershipActor=useRef<string|null>(null);
 const filter:FinanceFilter={...!opsMode&&merchantId?{merchantId}:{},...state?{state:state as MoneyState}:{},exceptionsOnly};
 const recovery=useWorkspaceRecovery({actorId,scope:'finance:'+ (opsMode?'ops':merchantId),authorized:!!data&&valid&&(opsMode||data.scope.merchantId===merchantId),dirty:!!reason,draft:{reason,reviewState},pending:pending.current,restore:value=>{const draft=value.draft as {reason?:unknown;reviewState?:unknown};if(typeof draft?.reason!=='string'||draft.reason.length>2000||!['open','investigating','waiting_business_rules','closed'].includes(String(draft.reviewState)))throw Error('INVALID_RECOVERY');setReason(draft.reason);setReviewState(draft.reviewState as ReviewState);if(value.pending){if(typeof value.pending.id!=='string'||!value.pending.command||typeof value.pending.command!=='object')throw Error('INVALID_RECOVERY');pending.current=value.pending as NonNullable<typeof pending.current>;setUnknown(true);setError('UNAVAILABLE');}}});

 function clear(){setData(null);pending.current=null;setUnknown(false);}
 async function loadMemberships(){
  if(!actorId||!enabled||opsMode||membershipActor.current!==actorId||membersLoading.current)return;
  const own=++membersGeneration.current;membersLoading.current=true;setBusy(true);setError('');setMembershipsReady(false);
  try{
   const r=await merchants.memberships();if(own!==membersGeneration.current)return;
   if(!r.ok){setError(r.code);if(r.code==='AUTH_REQUIRED'){setValid(false);membershipActor.current=null;clear();setReason('');}return;}
   const allowed=r.data.filter(m=>['owner','finance'].includes(m.role));allowedMerchants.current=new Set(allowed.map(m=>m.merchantId));setMemberships(allowed);setMerchantId(allowed[0]?.merchantId??'');setMembershipsReady(true);
  }catch{if(own===membersGeneration.current)setError('UNAVAILABLE');}
  finally{if(own===membersGeneration.current){membersLoading.current=false;setBusy(false);}}
 }
 async function load(cursor?:FinanceCursor){
  if(!opsMode&&(!merchantId||!allowedMerchants.current.has(merchantId)))return;
  const own=++generation.current;setBusy(true);const r=await finance.get(filter,cursor);if(own!==generation.current)return;setBusy(false);
  if(!r.ok){clear();setError(r.code);if(r.code==='AUTH_REQUIRED'){setValid(false);setReason('');}return;}setData(r.data);setError('');
 }
 useEffect(()=>{
  ++generation.current;++membersGeneration.current;membersLoading.current=false;membershipActor.current=actorId&&enabled?actorId:null;allowedMerchants.current.clear();setValid(true);clear();setMemberships([]);setMerchantId('');setMembershipsReady(false);setReason('');setError('');setBusy(false);
  const unsub=subscribeAccountInvalidation(next=>{if(next!==actorId){++generation.current;++membersGeneration.current;membershipActor.current=null;membersLoading.current=false;allowedMerchants.current.clear();setValid(false);clear();setMemberships([]);setMembershipsReady(false);setReason('');setBusy(false);}});
  if(actorId&&enabled&&!opsMode)void loadMemberships();
  return()=>{++generation.current;++membersGeneration.current;membershipActor.current=null;unsub();};
 },[actorId,enabled,opsMode]);
 useEffect(()=>{setReason('');setReviewState('investigating');},[merchantId,opsMode]);
 useEffect(()=>{clear();if(actorId&&enabled&&valid&&(opsMode||merchantId))void load();},[actorId,enabled,opsMode,merchantId,state,exceptionsOnly,valid]);
 async function send(command?:Parameters<typeof finance.review>[0]){
  if(!pending.current&&command)pending.current={command,id:crypto.randomUUID()};const p=pending.current;if(!p)return;
  const own=++generation.current,wasUnknown=unknown;setBusy(true);
  if(wasUnknown){const saved=await finance.get(filter);if(own!==generation.current)return;if(!saved.ok){setBusy(false);setError(saved.code);if(['AUTH_REQUIRED','FORBIDDEN'].includes(saved.code)){clear();setReason('');if(saved.code==='AUTH_REQUIRED')setValid(false);}return;}setData(saved.data);}
  try{await recovery.retain(p);}catch{setBusy(false);setError('UNAVAILABLE');setUnknown(true);return;}
  const r=await finance.review(p.command,p.id);if(own!==generation.current)return;setBusy(false);
  if(!r.ok){if(['AUTH_REQUIRED','FORBIDDEN'].includes(r.code)){clear();setReason('');if(r.code==='AUTH_REQUIRED')setValid(false);}setError(r.code);setUnknown(wasUnknown||r.code==='UNAVAILABLE');if(!wasUnknown&&r.code!=='UNAVAILABLE'){try{await recovery.release(p.id);pending.current=null;}catch{setUnknown(true);setError('UNAVAILABLE');}}return;}
  try{await recovery.clear(p.id);}catch{setError('UNAVAILABLE');setUnknown(true);return;}
  pending.current=null;setUnknown(false);setReason('');await load();
 }
 const locked=busy||unknown||!!data&&!recovery.ready;
 return <section className="k-page"><h1>{t('Financial reconciliation','財務對帳')}</h1>
 {!actorId||!valid?<Link href={`/${locale}/sign-in?next=${encodeURIComponent(href(opsMode?'ops/reconciliation':'merchant/reconciliation'))}`}>{t('Sign in','登入')}</Link>:!enabled?<p>{t('Reconciliation service is unavailable.','對帳服務尚未接通。')}</p>:<>
 {recovery.error&&<p role="alert">{t('Device draft recovery is unavailable. Keep this page open; no new review is sent until the original request is retained.','裝置草稿恢復未能使用。請保持此頁開啟；保留原有請求前不會送出新的覆核。')}</p>}{recovery.saved&&<p role="status">{t('Draft kept on this device for this account.','草稿已保留在此裝置並綁定此帳戶。')}</p>}
 <p>{t('Historical records only. Payment, refunds, fee adjustments and financial dispute resolution remain disabled.','只顯示歷史紀錄；付款、退款、費用調整及金錢爭議裁決尚未開放。')}</p>
 {error&&<WorkspaceServiceState locale={locale} code={error} retryState={unknown?'immutable-command':busy?'blocked':'read'} onRetry={!opsMode&&!membershipsReady&&!unknown&&error==='UNAVAILABLE'?()=>void loadMemberships():undefined} returnPath={href(opsMode?'ops/reconciliation':'merchant/reconciliation')}/> }
 {!opsMode&&<><label>{t('Merchant','商戶')}<select disabled={locked} value={merchantId} onChange={e=>setMerchantId(e.target.value)}>{memberships.map(m=><option key={m.merchantId} value={m.merchantId}>{m.name}</option>)}</select></label>{membershipsReady&&memberships.length===0&&<p>{t('No merchant finance membership is available for this account.','此帳戶沒有可用的商戶財務成員權限。')}</p>}</>}
 <label>{t('Money state','金錢狀態')}<select value={state} disabled={locked} onChange={e=>setState(e.target.value)}><option value="">{t('All states','所有狀態')}</option>{['claimed','redeemed','validated','eligible','settled','paid','recorded'].map(s=><option key={s}>{s}</option>)}</select></label>
 <label><input type="checkbox" checked={exceptionsOnly} disabled={locked} onChange={e=>setExceptions(e.target.checked)}/>{t('Exceptions only','只顯示例外')}</label>
 <button className="k-btn" disabled={locked||!opsMode&&!merchantId} onClick={()=>void load()}>{t('Refresh records','重新載入紀錄')}</button>{unknown&&<button className="k-btn" disabled={busy} onClick={()=>void send()}>{t('Retry the same review request','重試相同覆核請求')}</button>}
 {data&&(opsMode||data.scope.merchantId===merchantId)&&<>
 <p>{data.scope.role==='finance'?t('Only records proven to belong to your assigned active branches are shown. Branch-less receipts and obligations are excluded.','只顯示有證據屬於你獲指派有效分店的紀錄；沒有分店歸屬的收據及款項不會顯示。'):t('Totals cover all matching records, independently of the current page.','總額包含所有符合篩選的紀錄，不受本頁分頁限制。')}</p>
 <p>{t('A payout promise has no settlement allocation in these records. Do not add promises to creator obligations or treat one as proof the other was paid.','這些付款承諾沒有逐筆結算分配；不可與創作者應收款相加，亦不可當作逐筆已付款證據。')}</p>
 <div className="k-card"><h2>{t('Matching totals','符合條件的總額')}</h2>{data.totals.map((b,i)=><p key={i}>{b.currency??t('Unknown currency','未知幣別')} · {b.basis} · {b.state} · {b.count} {t('records','筆紀錄')} · {displayMinorUnits(b.minorAmount,b.currency)??t('Amount conversion unavailable','金額轉換未能提供')}{b.blockedAmountCount>0&&` (${b.blockedAmountCount} ${t('blocked amounts','筆金額待核實')})`}</p>)}{data.totals.length===0&&<p>{t('No matching records.','沒有符合條件的紀錄。')}</p>}</div>
 <label>{t('Review reason','覆核原因')}<textarea value={reason} disabled={locked} minLength={10} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>
 {opsMode&&<label>{t('Review status','覆核狀態')}<select value={reviewState} disabled={locked} onChange={e=>setReviewState(e.target.value as ReviewState)}>{['open','investigating','waiting_business_rules','closed'].map(s=><option key={s}>{s}</option>)}</select></label>}
 <p>{t('Closing a review records that review work ended. It changes no money, refund, receipt approval or payout status.','關閉覆核只記錄覆核工作完成，不會更改金錢、退款、收據審核或付款狀態。')}</p>
 {data.items.map(row=><article className="k-card" key={row.key}><h2>{row.title}</h2><p>{row.kind} · {row.sourceId}</p><p>{row.state} · {t('Source status','來源狀態')}: {row.sourceStatus}</p><p>{displayMinorUnits(row.minorAmount,row.currency)??`${row.currency??t('Unknown currency','未知幣別')} ${row.recordedAmount??t('Amount not recorded','沒有金額紀錄')}`}</p>{row.amountIssue&&<p>{row.amountIssue}</p>}<p>{t('Evidence','證據')}: {Object.entries(row.proof).filter(([,confirmed])=>confirmed).map(([name])=>name).join(' · ')||t('No validated money evidence','沒有已核實金錢證據')}</p><p>{row.exceptions.map(code=>code==='receipt_linkage_unknown'?t('Receipt linkage is unavailable; this is not proof of an approved receipt.','收據關聯未能提供；這不能證明收據已獲批准。'):code==='receipt_approval_unverified'?t('Receipt approval could not be verified.','未能核實收據是否已獲批准。'):code==='no_linked_obligation'?t('No obligation is linked to this receipt; an unlinked record may exist.','未找到與此收據關聯的應收款；可能已有未關聯的紀錄。'):code).join(' · ')}</p><p>{t('Source recorded time: ','來源紀錄時間：')}<time dateTime={row.updatedAt}>{row.updatedAt}</time></p>{row.recordedAmount?.startsWith('-')&&<p>{t('A negative correction remains an exact recorded adjustment; conversion and money actions stay blocked.','負數更正保留原有精確調整紀錄；金額轉換及金錢操作仍被封鎖。')}</p>}{(['claimId','redemptionId','submissionId','settlementId','bookingId'] as const).map(key=>row.references[key]&&<p key={key}>{key==='claimId'?t('Claim reference','領取編號'):key==='redemptionId'?t('Redemption reference','兌換編號'):key==='submissionId'?t('Submission reference','提交編號'):key==='settlementId'?t('Settlement reference','結算編號'):t('Booking reference','預訂編號')}: {row.references[key]}</p>)}{!locked&&!reason.trim()&&<div className="k-actions"><Link href={!opsMode&&data.scope.role==='owner'&&row.missionId?`${href('support')}?mission=${row.missionId}`:href('support')}>{t('Ask about this record','查詢這筆紀錄')}</Link>{!opsMode&&data.scope.role==='owner'&&row.missionId&&<Link href={`${href('merchant')}?company=${row.merchantId}&campaign=${row.missionId}`}>{t('View collaboration','查看合作')}</Link>}</div>}
 {row.review?<><p>{t('Review owner','覆核負責人')}: {row.review.ownerId??t('Unassigned','未指派')} · {row.review.status}</p><p>{t('Recent history entries','最近歷史紀錄')}: {row.review.history.length}/{row.review.historyCount}</p><ol>{row.review.history.map(h=><li key={h.id}>{h.status} · {h.reason} · <time dateTime={h.createdAt}>{h.createdAt}</time></li>)}</ol>{opsMode&&['owner','admin','moderator'].includes(data.scope.role)&&<button className="k-btn" disabled={locked||reason.trim().length<10} onClick={()=>void send({type:'review',id:row.review!.id,expectedRevision:row.review!.revision,status:reviewState,reason})}>{t('Assign to me and record review','指派予我並記錄覆核')}</button>}</>:['settlement','receipt'].includes(row.kind)&&(!opsMode||['owner','admin','moderator'].includes(data.scope.role))&&<button className="k-btn" disabled={locked||reason.trim().length<10} onClick={()=>void send({type:'open',sourceKey:row.key,reason})}>{t('Open source-linked review','建立與來源關聯的覆核')}</button>}
 </article>)}{data.nextCursor&&<button className="k-btn" disabled={locked} onClick={()=>void load(data.nextCursor!)}>{t('Next records','下一頁紀錄')}</button>}
 </>}
 </>}</section>;
}
