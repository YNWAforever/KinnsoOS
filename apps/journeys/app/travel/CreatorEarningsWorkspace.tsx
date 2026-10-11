'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {WorkspaceServiceState} from './WorkspaceServiceState';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {creatorEarnings,type EarningsPage,type EarningsSection} from '../../lib/creators/collaboration';

export function CreatorEarningsWorkspace({actorId,enabled}:{actorId:string|null;enabled:boolean}){
 const {t,href,locale}=useApp();
 const [section,setSection]=useState<EarningsSection>('settled'),[data,setData]=useState<EarningsPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[valid,setValid]=useState(true);
 const generation=useRef(0);
 const reference=useRef<string|undefined>(undefined);
 async function load(next:EarningsSection=section,after?:string){
  const own=++generation.current;setBusy(true);setError('');
  const r=await creatorEarnings.get(next,after);if(own!==generation.current)return;setBusy(false);
  if(!r.ok){reference.current=r.requestId;setError(r.code);setData(null);if(r.code==='AUTH_REQUIRED')setValid(false);return;}
  setData(previous=>after&&previous?.section===next?{...r.data,items:[...previous.items,...r.data.items]}:r.data);setSection(next);
 }
 useEffect(()=>{
  setValid(true);setData(null);setError('');setSection('settled');
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){++generation.current;setData(null);setValid(false);setBusy(false);}});
  if(actorId&&enabled)void load('settled');return()=>{++generation.current;unsubscribe();};
 },[actorId,enabled]);
 const amount=(currency:string|null,value:string)=>`${currency??t('Currency unspecified','未註明貨幣')} ${value}`;
 if(!enabled)return <section className="k-page"><h1>{t('Your earnings records','你的收益紀錄')}</h1><WorkspaceServiceState locale={locale} code="UNAVAILABLE" retryState="blocked"/></section>;
 if(!actorId||!valid)return <section className="k-page"><h1>{t('Your earnings records','你的收益紀錄')}</h1><WorkspaceServiceState locale={locale} code="AUTH_REQUIRED" retryState="blocked" returnPath={href('studio/earnings')}/></section>;
 return <section className="k-page" data-testid="creator-earnings"><p className="k-eyebrow">{t('CREATOR STUDIO','創作者工作室')}</p><h1>{t('Your earnings records','你的收益紀錄')}</h1><p>{t('These records show settlement and payout status. Each currency is reported separately.','以下紀錄顯示結算及付款狀態，各種貨幣分開列出。')}</p>
  <div className="k-actions"><Link className="k-btn" href={href('studio/missions')}>{t('Collaborations','合作')}</Link><Link className="k-btn" href={href('inbox')}>{t('Inbox','收件匣')}</Link><Link className="k-btn" href={href('support')}>{t('Ask about a record','查詢紀錄')}</Link></div>
  {error&&<WorkspaceServiceState locale={locale} code={error} requestId={reference.current} retryState={busy?'blocked':'read'} onRetry={()=>void load()} returnPath={href('studio/earnings')}/>} {busy&&<p role="status">{t('Loading earnings records…','正在載入收益紀錄…')}</p>}
  <button className="k-btn" disabled={busy} onClick={()=>load()}>{t('Refresh earnings','重新載入收益')}</button>
  {data&&<><div className="k-grid">{data.totals.map(total=><article className="k-card" key={total.currency??'unknown'}><h2>{total.currency??t('Currency unspecified','未註明貨幣')}</h2><p>{t('Pending creator payout','待支付創作者款項')} <strong>{amount(total.currency,total.pending)}</strong></p><p>{t('Recorded as paid','已記錄付款')} <strong>{amount(total.currency,total.paid)}</strong></p></article>)}</div>
   <div className="k-actions" aria-label={t('Earnings record categories','收益紀錄分類')}><button className="k-btn" disabled={busy} aria-pressed={section==='settled'} onClick={()=>load('settled')}>{t('Settlement records','結算紀錄')}</button><button className="k-btn" disabled={busy} aria-pressed={section==='tracked'} onClick={()=>load('tracked')}>{t('Tracked activity','追蹤活動')}</button><button className="k-btn" disabled={busy} aria-pressed={section==='payouts'} onClick={()=>load('payouts')}>{t('Payout batches','付款批次')}</button></div>
   {section==='tracked'&&<p>{t('Tracked affiliate activity is not yet payable and is excluded from your earnings totals.','追蹤中的聯盟活動尚未可支付，不計入收益總額。')}</p>}
   {section==='payouts'&&<p>{t('Payout batches are recorded payment decisions. They are not added to settlement totals again. This history does not enable withdrawals.','付款批次是已記錄的付款決定，不會再次加入結算總額；這些歷史紀錄不會開放提款。')}</p>}
   {data.items.length===0&&<div className="k-card"><h2>{t('No records in this category yet.','此分類暫未有紀錄。')}</h2><p>{t('Eligible activity appears when its settlement is recorded.','合資格活動會在記錄結算後顯示。')}</p></div>}
   {data.items.map(item=><article className="k-card" key={item.kind+item.id}><h2>{item.kind==='payout_batch'?t('Recorded payout batch','已記錄付款批次'):item.title||t('Affiliate activity','聯盟活動')}</h2><p><strong>{amount(item.currency,item.amount)}</strong> · {item.status==='paid'?(item.kind==='affiliate'?t('Provider event recorded as paid','供應商事件已記錄付款'):t('Recorded as paid','已記錄付款')):item.status==='cancelled'?t('Cancelled','已取消'):item.status==='processing'?t('Processing','處理中'):t('Pending','待處理')}</p>{item.targetAt&&<p>{t('Target date: ','目標日期：')}<time dateTime={item.targetAt}>{new Date(item.targetAt).toLocaleDateString(locale)}</time></p>}{item.missionId&&<Link href={href('studio/missions/'+item.missionId)}>{t('View collaboration','查看合作')}</Link>}<p>{t('Record source: ','紀錄來源：')}{item.kind==='mission'?t('Collaboration settlement','合作結算'):item.kind==='booking'?t('Booking settlement','預訂結算'):item.kind==='affiliate'?t('Provider activity record','供應商活動紀錄'):t('Historical payout decision','歷史付款決定')}</p><p>{t('Source recorded time: ','來源紀錄時間：')}{item.updatedAt?<time dateTime={item.updatedAt}>{item.updatedAt}</time>:t('Not recorded','沒有紀錄')}</p>{item.amount.startsWith('-')&&<p>{t('A negative correction is a recorded adjustment, not a new charge or withdrawal.','負數更正是已記錄的調整，不代表新的收費或提款。')}</p>}<Link href={item.missionId?`${href('support')}?mission=${item.missionId}`:href('support')}>{t('Ask about this record','查詢這筆紀錄')}</Link><p className="k-muted">{t('Record reference: ','紀錄編號：')}{item.id}</p></article>)}
   {data.nextCursor&&<button className="k-btn" disabled={busy} onClick={()=>load(section,data.nextCursor!)}>{t('Load more records','載入更多紀錄')}</button>}
  </>}
 </section>;
}
