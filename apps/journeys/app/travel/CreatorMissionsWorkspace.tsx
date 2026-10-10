'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {creatorMissions,type CreatorMission,type CreatorMissionDetail,type CreatorMissionCommand,type Evidence,type MissionScope} from '../../lib/creators/collaboration';
import {evidenceUrl} from '../../lib/creators/collaboration-validation';

type EvidenceForm={milestoneId:string;submissionId:string|null;expectedUpdatedAt:string|null;proofText:string;notes:string};
export function CreatorMissionsWorkspace({path,actorId,enabled}:{path:string;actorId:string|null;enabled:boolean}){
 const {t,href,locale}=useApp();
 const missionId=/^studio\/missions\/[0-9a-f-]{36}$/i.test(path)?path.split('/')[2]:null;
 const [scope,setScope]=useState<MissionScope>(path==='studio/outcomes'?'mine':'available');
 const [items,setItems]=useState<CreatorMission[]|null>(null),[cursor,setCursor]=useState<string|null>(null),[detail,setDetail]=useState<CreatorMissionDetail|null>(null);
 const [busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[valid,setValid]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [applicationNote,setApplicationNote]=useState(''),[agreed,setAgreed]=useState(false),[form,setForm]=useState<EvidenceForm|null>(null);
 const generation=useRef(0),pending=useRef<{command:CreatorMissionCommand;requestId:string}|null>(null);
 function clear(){setItems(null);setDetail(null);setCursor(null);setForm(null);setApplicationNote('');setAgreed(false);setUnknown(false);pending.current=null;}
 function denied(code:string){if(code==='AUTH_REQUIRED'||code==='FORBIDDEN'){clear();if(code==='AUTH_REQUIRED')setValid(false);}}
 async function load(after?:string,nextScope=scope){
  const own=++generation.current;setBusy(true);setError('');
  if(missionId){
   const r=await creatorMissions.get(missionId,after);if(own!==generation.current)return;setBusy(false);
   if(!r.ok){denied(r.code);setError(r.code);if(!after)setDetail(null);return;}
   setDetail(previous=>after&&previous?{...r.data,submissions:[...previous.submissions,...r.data.submissions].filter((row,index,all)=>all.findIndex(x=>x.id===row.id)===index)}:r.data);
  }else{
   const r=await creatorMissions.list(nextScope,after);if(own!==generation.current)return;setBusy(false);
   if(!r.ok){denied(r.code);setError(r.code);if(!after)setItems(null);return;}
   setItems(previous=>after?[...(previous??[]),...r.data.items].filter((row,index,all)=>all.findIndex(x=>x.id===row.id)===index):r.data.items);setCursor(r.data.nextCursor);
  }
 }
 useEffect(()=>{
  setValid(true);clear();setError('');setMessage('');const initial:MissionScope=path==='studio/outcomes'?'mine':'available';setScope(initial);
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){++generation.current;setValid(false);setBusy(false);clear();}});
  if(actorId&&enabled)void load(undefined,initial);
  return()=>{++generation.current;unsubscribe();};
 },[actorId,enabled,path]);
 async function send(command?:CreatorMissionCommand){
  if(!missionId||busy||!valid)return;
  if(!pending.current&&command)pending.current={command,requestId:crypto.randomUUID()};
  const intent=pending.current;if(!intent)return;
  const own=++generation.current;setBusy(true);setError('');setMessage('');
  const result=await creatorMissions.command(missionId,intent.command,intent.requestId);if(own!==generation.current)return;setBusy(false);
  if(!result.ok){denied(result.code);setError(result.code);setUnknown(result.retryable);if(!result.retryable)pending.current=null;return;}
  pending.current=null;setUnknown(false);setForm(null);setAgreed(false);setApplicationNote('');setMessage(t('Your update is saved.','更新已保存。'));await load();
 }
 function prepare(milestoneId:string,submission?:Evidence){setForm({milestoneId,submissionId:submission?.id??null,expectedUpdatedAt:submission?.updatedAt??null,proofText:submission?.proofUrls.join('\n')??'',notes:submission?.notes??''});setError('');setMessage('');}
 const locked=busy||unknown;
 const status=(value:string)=>{
  const labels:Record<string,[string,string]>={invited:['Invitation received','收到邀請'],applied:['Application under review','申請審核中'],active:['Active collaboration','合作進行中'],completed:['Completed','已完成'],cancelled:['Withdrawn','已撤回'],rejected:['Rejected','未獲接納'],submitted:['Submitted for review','已提交審核'],approved:['Approved','已核准'],revision_requested:['Revision requested','需要修改'],pending:['Draft evidence','證明草稿'],published:['Open','開放中'],paused:['Closed to new applications','已停止接受新申請']};
  return labels[value]?t(...labels[value]):value;
 };
 const errorText=error==='CONFLICT'?t('This collaboration changed. Your input is retained. Refresh and review the latest saved version before submitting again.','合作資料已有變動，輸入仍保留。請重新載入並核對最新版本後再提交。'):
  error==='NOT_FOUND'?t('This collaboration is unavailable or you do not have access.','此合作不存在或你沒有存取權。'):
  error==='FORBIDDEN'?t('Complete your creator profile or check your account access to continue.','請先完成創作者檔案，或檢查帳戶存取權。'):
  error==='INVALID'?t('This action is unavailable or the evidence needs correction. Check the campaign status, eligibility and HTTPS links.','此操作目前不可用或證明資料需要修正。請檢查合作狀態、資格及 HTTPS 連結。'):
  t('The request was not completed. Your input is retained; retry when the connection is available.','請求尚未完成，輸入仍保留，請在連線恢復後重試。');
 if(!actorId||!valid)return <section className="k-page"><h1>{t('Creator collaborations','創作者合作')}</h1><Link className="k-btn primary" href={`/${locale}/sign-in?next=${encodeURIComponent(href(path))}`}>{t('Sign in to continue','登入後繼續')}</Link></section>;
 if(!enabled)return <section className="k-page"><h1>{t('Creator collaborations','創作者合作')}</h1><p>{t('Collaboration service is not connected yet.','合作服務尚未接通。')}</p></section>;
 return <section className="k-page" data-testid="creator-collaborations">
  <p className="k-eyebrow">{t('CREATOR STUDIO','創作者工作室')}</p>
  <h1>{detail?.title??t('Creator collaborations','創作者合作')}</h1>
  <div className="k-actions"><Link className="k-btn" href={href('studio/guides')}>{t('My guides','我的攻略')}</Link><Link className="k-btn" href={href('studio/earnings')}>{t('Earnings records','收益紀錄')}</Link><Link className="k-btn" href={href('inbox')}>{t('Inbox','收件匣')}</Link></div>
  {error&&<p role="alert">{errorText}{error==='FORBIDDEN'&&<Link href={href('studio')}>{t('Open creator profile','開啟創作者檔案')}</Link>}</p>}
  {message&&<p role="status">{message}</p>}
  {busy&&<p role="status">{t('Loading collaboration records…','正在載入合作紀錄…')}</p>}
  <button className="k-btn" disabled={locked} onClick={()=>load()}>{t('Refresh collaborations','重新載入合作')}</button>
  {unknown&&<button className="k-btn primary" disabled={busy} onClick={()=>send()}>{t('Retry the same request','重試相同請求')}</button>}
  {!missionId&&<>
   <div className="k-actions" aria-label={t('Collaboration views','合作檢視')}><button className="k-btn" aria-pressed={scope==='available'} disabled={locked} onClick={()=>{setScope('available');void load(undefined,'available');}}>{t('Available collaborations','可參加的合作')}</button><button className="k-btn" aria-pressed={scope==='mine'} disabled={locked} onClick={()=>{setScope('mine');void load(undefined,'mine');}}>{t('My collaborations','我的合作')}</button></div>
   {items?.length===0&&<div className="k-card"><h2>{scope==='mine'?t('Your next collaboration starts here.','從這裡開始下一次合作。'):t('No open collaborations yet.','暫未有開放的合作。')}</h2><p>{scope==='mine'?t('Browse open briefs or return when a merchant invites you.','瀏覽開放的合作簡介，或在收到商戶邀請後返回。'):t('Check back for briefs that match your interests.','稍後再來尋找符合你興趣的合作。')}</p></div>}
   {items?.map(item=><article className="k-card" key={item.id}><p className="k-eyebrow">{item.merchantName??item.missionSource}</p><h2><Link href={href('studio/missions/'+item.id)}>{item.title}</Link></h2><p>{item.summary}</p><p>{status(item.participant?.status??item.status)}</p>{item.minTier&&!item.eligible&&<p>{t('Required creator tier: ','所需創作者級別：')}{item.minTier}</p>}<Link className="k-btn" href={href('studio/missions/'+item.id)}>{t('View collaboration','查看合作')}</Link></article>)}
   {cursor&&<button className="k-btn" disabled={locked} onClick={()=>load(cursor)}>{t('Load more collaborations','載入更多合作')}</button>}
  </>}
  {detail&&<>
   <Link href={href('studio/missions')}>{t('All collaborations','所有合作')}</Link>
   <article className="k-card"><p className="k-eyebrow">{detail.merchantName??detail.missionSource}</p><p>{detail.summary}</p><p>{status(detail.status)}{detail.participant&&' · '+status(detail.participant.status)}</p>
    {detail.endsAt&&<p>{t('Applications close: ','申請截止：')}<time dateTime={detail.endsAt}>{new Date(detail.endsAt).toLocaleDateString(locale)}</time></p>}
    {detail.paidFeeAmount!==null&&<p>{t('Published fee: ','公布費用：')}{detail.paidFeeCurrency??t('Currency unspecified','未註明貨幣')} {detail.paidFeeAmount}</p>}
    {detail.missionType==='coupon_affiliate'&&<p>{t('Content approval has no fixed fee. Any commission depends on separately recorded eligible activity.','內容核准不設固定酬金。佣金取決於另行記錄的合資格活動。')}</p>}
    {detail.requirements.length>0&&<><h2>{t('Requirements','合作要求')}</h2><ul>{detail.requirements.map((row,i)=><li key={i}>{row}</li>)}</ul></>}
    {detail.deliverables.length>0&&<><h2>{t('Deliverables','交付內容')}</h2><ul>{detail.deliverables.map((row,i)=><li key={i}>{row}</li>)}</ul></>}
    {detail.minTier&&!detail.eligible&&!detail.participant&&<p>{t('This collaboration requires creator tier: ','此合作要求的創作者級別：')}{detail.minTier}</p>}
    {!detail.participant&&detail.joinAvailable&&<fieldset disabled={locked||!detail.eligible}><legend>{t('Join this collaboration','參加此合作')}</legend><label>{t('Application note (optional)','申請說明（選填）')}<textarea aria-label={t('Application note (optional)','申請說明（選填）')} maxLength={2000} value={applicationNote} onChange={event=>setApplicationNote(event.target.value)}/></label><label><input type="checkbox" aria-label={t('I have read the collaboration requirements.','我已閱讀合作要求。')} checked={agreed} onChange={event=>setAgreed(event.target.checked)}/>{t('I have read the collaboration requirements.','我已閱讀合作要求。')}</label><button className="k-btn primary" disabled={locked||!agreed||!detail.eligible} onClick={()=>send({type:'join',applicationNote})}>{detail.missionType==='coupon_affiliate'&&!detail.requiresApplication?t('Join collaboration','參加合作'):t('Send application','提交申請')}</button></fieldset>}
    {detail.participant?.status==='invited'&&<div><p>{t('Review the brief before accepting this invitation.','接受邀請前請先核對合作簡介。')}</p><button className="k-btn primary" disabled={locked||!detail.acceptAvailable} onClick={()=>send({type:'acceptInvite',expectedUpdatedAt:detail.participant!.updatedAt})}>{t('Accept invitation','接受邀請')}</button></div>}
    {detail.participant&&['applied','invited'].includes(detail.participant.status)&&<button className="k-btn" disabled={locked} onClick={()=>send({type:'withdrawApplication',expectedUpdatedAt:detail.participant!.updatedAt})}>{detail.participant.status==='invited'?t('Decline invitation','婉拒邀請'):t('Withdraw application','撤回申請')}</button>}
    {detail.participant?.applicationNote&&<p>{t('Your application: ','你的申請：')}{detail.participant.applicationNote}</p>}
    {detail.participant?.status==='active'&&detail.couponCode&&<p>{t('Campaign coupon code: ','合作優惠碼：')}<strong>{detail.couponCode}</strong></p>}
    {detail.participant?.status==='active'&&evidenceUrl(detail.couponUrl)&&<a href={detail.couponUrl} target="_blank" rel="noopener noreferrer">{t('Open merchant offer','開啟商戶優惠')}</a>}
    {detail.partnerLinks.map(link=>evidenceUrl(link.url)&&<p key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer">{t('Your existing partner link','你現有的合作連結')}</a></p>)}
   </article>
   <h2>{t('Milestones and evidence','里程碑及證明')}</h2>
   <p>{t('Evidence links are reviewed by the merchant or Kinnso team. Submitting a link does not automatically verify or approve the work.','商戶或 Kinnso 團隊會審核證明連結。提交連結不會自動驗證或核准作品。')}</p>
   {detail.milestones.length===0&&<p>{t('This brief has no content milestones.','此合作簡介沒有內容里程碑。')}</p>}
   {detail.milestonesTruncated&&<p>{t('This campaign has more milestones than this view can show. Contact support for the complete brief.','此合作的里程碑超出本頁顯示範圍，請聯絡客服取得完整簡介。')}</p>}
   {detail.milestones.map(milestone=><article className="k-card" key={milestone.id}><h3>{milestone.title}</h3><p>{milestone.description}</p>{milestone.dueAt&&<p>{t('Due: ','期限：')}<time dateTime={milestone.dueAt}>{new Date(milestone.dueAt).toLocaleDateString(locale)}</time></p>}{milestone.repeatable&&detail.maxReceipts!==null&&<p>{t('Maximum submitted or approved receipts: ','已提交或核准收據上限：')}{detail.maxReceipts}</p>}
    {detail.evidenceAvailable&&(milestone.repeatable||!detail.submissions.some(s=>s.milestoneId===milestone.id))&&<button className="k-btn" disabled={locked} onClick={()=>prepare(milestone.id)}>{milestone.repeatable?t('Prepare new receipt','準備新收據'):t('Prepare evidence','準備證明')}</button>}
    {detail.submissions.filter(s=>s.milestoneId===milestone.id).map(submission=><div key={submission.id}><h4>{status(submission.status)}</h4>{submission.notes&&<p>{submission.notes}</p>}{submission.proofUrls.map((url,i)=>evidenceUrl(url)?<p key={i}><a href={url} target="_blank" rel="noopener noreferrer">{t('Evidence link ','證明連結 ')}{i+1}</a></p>:<p key={i}>{url}</p>)}{submission.merchantFeedback&&<p><strong>{t('Reviewer feedback: ','審核意見：')}</strong>{submission.merchantFeedback}</p>}{submission.reviews.length>0&&<details><summary>{t('Review history','審核紀錄')}</summary>{submission.reviews.map(review=><p key={review.id}>{status(review.action==='request_revision'?'revision_requested':review.action==='approve'?'approved':'rejected')} · {review.reason} <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString(locale)}</time></p>)}</details>}{detail.evidenceAvailable&&['pending','submitted','revision_requested'].includes(submission.status)&&<button className="k-btn" disabled={locked} onClick={()=>prepare(milestone.id,submission)}>{t('Edit and resubmit evidence','修改並重新提交證明')}</button>}</div>)}
   </article>)}
   {detail.submissionsNextCursor&&<button className="k-btn" disabled={locked} onClick={()=>load(detail.submissionsNextCursor!)}>{t('Load earlier evidence','載入較早證明')}</button>}
   {form&&<form className="k-card os-editor" onSubmit={event=>{event.preventDefault();const proofUrls=form.proofText.split('\n').map(x=>x.trim()).filter(Boolean);if(proofUrls.length<1||proofUrls.length>5||!proofUrls.every(evidenceUrl)){setError('INVALID');return;}void send({type:'submitEvidence',milestoneId:form.milestoneId,submissionId:form.submissionId,expectedUpdatedAt:form.expectedUpdatedAt,proofUrls,notes:form.notes});}}>
    <h2>{t('Your evidence','你的證明')}</h2><fieldset disabled={locked}><label>{t('Evidence links (one HTTPS link per line)','證明連結（每行一條 HTTPS 連結）')}<textarea aria-label={t('Evidence links (one HTTPS link per line)','證明連結（每行一條 HTTPS 連結）')} required maxLength={10244} value={form.proofText} onChange={event=>setForm({...form,proofText:event.target.value})}/></label><label>{t('Notes for reviewer','給審核員的備註')}<textarea aria-label={t('Notes for reviewer','給審核員的備註')} maxLength={4000} value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></label><button className="k-btn primary" disabled={locked} type="submit">{t('Submit evidence','提交證明')}</button><button className="k-btn" type="button" onClick={()=>setForm(null)}>{t('Cancel editing','取消編輯')}</button>
    {form.submissionId&&detail.submissions.some(s=>s.id===form.submissionId)&&<button className="k-btn" type="button" onClick={()=>prepare(form.milestoneId,detail.submissions.find(s=>s.id===form.submissionId))}>{t('Load saved evidence (replace this form)','載入已保存證明（替換此表格）')}</button>}</fieldset>
   </form>}
  </>}
 </section>;
}
