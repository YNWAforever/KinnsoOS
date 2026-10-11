'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {merchantCampaigns,type CampaignDirectory,type CampaignDetail,type CampaignQuery} from '../../lib/merchants/campaign-repository';
import {campaignCommand,campaignLink,type CampaignCommand,type CampaignInput} from '../../lib/merchants/campaigns';
import {parseCommissionPercent} from '../../lib/merchants/access';

function blank():CampaignInput{return{title:'',summary:'',couponCode:'',couponUrl:'',affiliateRate:null,kinnsoRate:null,creatorRate:null,requirements:[],deliverables:[],milestones:[]};}
export function MerchantCampaigns({actorId,merchantId,refreshKey,locked,onLockChange,onChanged,onDenied}:{actorId:string;merchantId:string;refreshKey:number;locked:boolean;onLockChange:(locked:boolean)=>void;onChanged:()=>Promise<void>;onDenied:(code:string)=>void}){
 const {t,locale}=useApp();
 const [data,setData]=useState<CampaignDirectory|null>(null),[loading,setLoading]=useState(true),[valid,setValid]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [draft,setDraft]=useState<CampaignInput>(blank),[rates,setRates]=useState(['','','']),[editing,setEditing]=useState<CampaignDetail|null>(null),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false);
 const [feedback,setFeedback]=useState<Record<string,string>>({}),[branchEdits,setBranchEdits]=useState<Record<string,{name:string;reason:string}>>({});
 const generation=useRef(0),scope=useRef(0),running=useRef(false),pending=useRef<{command:CampaignCommand;requestId:string}|null>(null),query=useRef<CampaignQuery>({});
 const editorBaseline=useRef({input:JSON.stringify(blank()),rates:['','',''].join('|')});
 const blocked=locked||busy||unknown||!valid;
 const dirty=JSON.stringify(draft)!==editorBaseline.current.input||rates.join('|')!==editorBaseline.current.rates;
 const labels:Record<string,[string,string]>={draft:['Draft','草稿'],published:['Open for applications','接受申請中'],paused:['Closed to new applications','已停止接受新申請'],completed:['Completed','已完成'],cancelled:['Cancelled','已取消'],applied:['Awaiting review','等待審核'],invited:['Invitation awaiting creator response','等待創作者回覆邀請'],active:['Accepted','已接受'],submitted:['Submitted for review','已提交審核'],pending:['Not submitted','尚未提交'],approved:['Approved','已批准'],rejected:['Rejected','已拒絕'],revision_requested:['Revision requested','需要修改']};
 const status=(value:string)=>labels[value]?t(...labels[value]):t('Recorded state','已記錄狀態');
 const date=(value:string|null)=>value?new Date(value).toLocaleDateString(locale==='en'?'en-GB':'zh-HK'):t('Not recorded','未記錄');
 function resetEditor(){const empty=blank();editorBaseline.current={input:JSON.stringify(empty),rates:['','',''].join('|')};setDraft(empty);setRates(['','','']);setEditing(null);}
 function deny(code:string){if(code==='AUTH_REQUIRED'||code==='FORBIDDEN'){scope.current++;generation.current++;setData(null);resetEditor();setFeedback({});setBranchEdits({});setValid(false);onDenied(code);}}
 async function load(next:CampaignQuery=query.current){
  const own=++generation.current;setLoading(true);setError('');
  let result=await merchantCampaigns.list(merchantId,next);if(own!==generation.current)return;
  if(result.ok&&!next.campaignId&&result.data.items.length){next={...next,campaignId:result.data.items[0].id};result=await merchantCampaigns.list(merchantId,next);if(own!==generation.current)return;}
  setLoading(false);if(!result.ok){setError(result.code);setData(null);deny(result.code);return;}
  query.current=next;setData(result.data);setFeedback({});setBranchEdits({});
 }
 useEffect(()=>{
  scope.current++;setValid(true);resetEditor();setData(null);pending.current=null;running.current=false;setBusy(false);setUnknown(false);query.current={};void load({});
  const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){scope.current++;generation.current++;setValid(false);setData(null);resetEditor();setFeedback({});setBranchEdits({});pending.current=null;running.current=false;setBusy(false);setUnknown(false);}});
  return()=>{scope.current++;generation.current++;unsubscribe();};
 },[actorId,merchantId]);
 useEffect(()=>{if(refreshKey>0&&!pending.current)void load();},[refreshKey]);
 useEffect(()=>{onLockChange(busy||unknown);return()=>onLockChange(false);},[busy,unknown,onLockChange]);
 useEffect(()=>{const prevent=(event:BeforeUnloadEvent)=>{if(valid&&(dirty||busy||unknown)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[valid,dirty,busy,unknown]);
 async function send(command?:CampaignCommand){
  if(running.current||!valid)return;
  if(!pending.current){if(!command)return;try{pending.current={command:campaignCommand(command),requestId:crypto.randomUUID()};}catch{setError('INVALID');return;}}
  const request=pending.current,own=scope.current;running.current=true;setBusy(true);setMessage('');
  const result=await merchantCampaigns.command(merchantId,request.command,request.requestId);if(own!==scope.current)return;
  running.current=false;setBusy(false);
  if(!result.ok){setError(result.code);setUnknown(result.code==='UNAVAILABLE');if(result.code!=='UNAVAILABLE')pending.current=null;deny(result.code);return;}
  pending.current=null;setUnknown(false);setError('');setMessage(t('Saved on the server.','已儲存至伺服器。'));
  if(['createDraft','updateDraft'].includes(request.command.type))resetEditor();
  const campaignId=['createDraft','updateDraft','publish','close'].includes(request.command.type)?request.command.id:query.current.campaignId;
  await load({...query.current,campaignId,participantsAfter:undefined,submissionsAfter:undefined});
  if(own===scope.current)await onChanged();
 }
 function save(publish:boolean){
  const parsed=rates.map(value=>value===''?null:parseCommissionPercent(value));if(rates.some((value,index)=>value!==''&&parsed[index]===null)){setError('INVALID');return;}
  const input={...draft,requirements:draft.requirements.map(value=>value.trim()).filter(Boolean),deliverables:draft.deliverables.map(value=>value.trim()).filter(Boolean),affiliateRate:parsed[0],kinnsoRate:parsed[1],creatorRate:parsed[2]};
  if(editing)void send({type:'updateDraft',id:editing.id,expectedUpdatedAt:editing.updatedAt,input,reason:t('Merchant saved an edited promotion draft','商戶儲存已修改的推廣草稿')});
  else void send({type:'createDraft',id:crypto.randomUUID(),input,publish,reason:publish?t('Merchant confirmed publication of the authored brief','商戶確認發布已填寫的推廣簡報'):t('Merchant saved an authored promotion draft','商戶儲存推廣草稿')});
 }
 function edit(detail:CampaignDetail){const input={title:detail.title,summary:detail.summary,couponCode:detail.couponCode,couponUrl:detail.couponUrl,affiliateRate:detail.affiliateRate,kinnsoRate:detail.kinnsoRate,creatorRate:detail.creatorRate,requirements:detail.requirements,deliverables:detail.deliverables,milestones:detail.milestones};const nextRates=[detail.affiliateRate,detail.kinnsoRate,detail.creatorRate].map(value=>value===null?'':String(value));editorBaseline.current={input:JSON.stringify(input),rates:nextRates.join('|')};setEditing(detail);setDraft(input);setRates(nextRates);setMessage('');}
 if(!valid)return null;
 return <section className="k-card k-campaigns" aria-label={t('Promotion management','推廣管理')}>
  <h2>{t('Create coupon promotion brief','建立優惠推廣簡報')}</h2>
  <p>{t('Save a draft, describe the work creators should deliver, then publish when the brief is ready. Published terms stay fixed; closing stops new applications while accepted creators can finish their work.','先儲存草稿，說明創作者需要提交的作品，準備好後再發布。發布後條款會鎖定；關閉只停止新申請，已接受的創作者仍可完成作品。')}</p>
  {error&&<p role="alert">{error==='CONFLICT'?t('This record changed. Reload the promotion to review the latest version before trying again. Your draft remains below.','紀錄已變更。請重新載入推廣並核對最新版本後再試；你的草稿仍保留於下方。'):error==='INVALID'?t('Check the entered details. Publishing requires coupon details, all commission rates and at least one complete milestone. Reviews need written feedback.','請核對資料。發布必須提供優惠資料、全部佣金比例及至少一個完整里程碑；審核必須填寫回饋。'):t('Promotion services could not complete the request. Please retry.','推廣服務未能完成請求，請重試。')}</p>}
  {message&&<p role="status">{message}</p>}{unknown&&<button className="k-btn" disabled={busy} onClick={()=>void send()}>{t('Retry promotion request','重試推廣請求')}</button>}
  <form onSubmit={event=>{event.preventDefault();save((event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='publish');}}>
   {editing&&<p>{t('Editing saved draft','修改已儲存草稿')}: {editing.title}</p>}
   {editing&&data?.detail?.id===editing.id&&data.detail.updatedAt!==editing.updatedAt&&<div role="alert"><p>{t('A newer saved version is shown in the promotion details below. Compare it with your draft before replacing it.','下方推廣詳情顯示較新的已儲存版本。請先與你的草稿比較再決定取代。')}</p><button className="k-btn" type="button" disabled={blocked||!data.detail.canEdit} onClick={()=>setEditing(data.detail)}>{t('Keep my draft against this latest version','使用此最新版本保留我的草稿')}</button></div>}
   <label>{t('Brief title','簡報標題')}<input required maxLength={120} disabled={blocked} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
   <label>{t('Brief description','簡報內容')}<textarea maxLength={5000} disabled={blocked} value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})}/></label>
   <label>{t('Coupon code','優惠碼')}<input maxLength={200} disabled={blocked} value={draft.couponCode} onChange={e=>setDraft({...draft,couponCode:e.target.value})}/></label>
   <label>{t('Coupon URL','優惠網址')}<input type="url" maxLength={2048} disabled={blocked} value={draft.couponUrl} onChange={e=>setDraft({...draft,couponUrl:e.target.value})}/></label>
   {([['Affiliate commission rate (%)','聯盟佣金比例（%）'],['Platform commission rate (%)','平台佣金比例（%）'],['Creator commission rate (%)','創作者佣金比例（%）']] as const).map(([en,zh],index)=><label key={en}>{t(en,zh)}<input type="number" min="0" max="999999.99" step="0.01" disabled={blocked} value={rates[index]} onChange={e=>setRates(rates.map((value,i)=>i===index?e.target.value:value))}/></label>)}
   <p>{t('Enter percentages: 70 means 70%; 0.70 means 0.70%. This coupon brief has no fixed creator fee.','請輸入百分比：70 代表 70%；0.70 代表 0.70%。此優惠推廣不設固定創作者費用。')}</p>
   <label>{t('Creator requirements, one per line','創作者要求，每行一項')}<textarea maxLength={20020} disabled={blocked} value={draft.requirements.join('\n')} onChange={e=>setDraft({...draft,requirements:e.target.value.split('\n')})}/></label>
   <label>{t('Expected deliverables, one per line','預期作品，每行一項')}<textarea maxLength={20020} disabled={blocked} value={draft.deliverables.join('\n')} onChange={e=>setDraft({...draft,deliverables:e.target.value.split('\n')})}/></label>
   <h3>{t('Delivery milestones','作品里程碑')}</h3><p>{t('Add at least one milestone before publishing. Each milestone has its own submission and review.','發布前請新增至少一個里程碑。每個里程碑會分別提交及審核。')}</p>
   {draft.milestones.map((milestone,index)=><fieldset key={milestone.id} disabled={blocked}><legend>{t('Milestone','里程碑')} {index+1}</legend>
    <label>{t('Milestone title','里程碑標題')}<input maxLength={120} value={milestone.title} onChange={e=>setDraft({...draft,milestones:draft.milestones.map((value,i)=>i===index?{...value,title:e.target.value}:value)})}/></label>
    <label>{t('Milestone instructions','里程碑指示')}<textarea maxLength={2000} value={milestone.description} onChange={e=>setDraft({...draft,milestones:draft.milestones.map((value,i)=>i===index?{...value,description:e.target.value}:value)})}/></label>
    <label>{t('Due date (UTC), optional','到期日（UTC），選填')}<input type="date" value={milestone.dueAt?.slice(0,10)??''} onChange={e=>setDraft({...draft,milestones:draft.milestones.map((value,i)=>i===index?{...value,dueAt:e.target.value?e.target.value+'T23:59:59Z':null}:value)})}/></label>
    <button className="k-btn" type="button" onClick={()=>setDraft({...draft,milestones:draft.milestones.filter((_,i)=>i!==index)})}>{t('Remove milestone','移除里程碑')}</button>
   </fieldset>)}
   <button className="k-btn" type="button" disabled={blocked||draft.milestones.length>=20} onClick={()=>setDraft({...draft,milestones:[...draft.milestones,{id:crypto.randomUUID(),title:'',description:'',dueAt:null}]})}>{t('Add milestone','新增里程碑')}</button>
   <button className="k-btn" value="draft" disabled={blocked||!draft.title.trim()}>{t('Save promotion draft','儲存推廣草稿')}</button>
   {!editing&&<button className="k-btn primary" value="publish" disabled={blocked||!draft.title.trim()}>{t('Publish promotion brief','發布推廣簡報')}</button>}
   {(editing||dirty)&&<button className="k-btn" type="button" disabled={blocked} onClick={resetEditor}>{editing?t('Cancel draft edits','取消草稿修改'):t('Discard unsaved draft','放棄未儲存草稿')}</button>}
  </form>
  <h2>{t('Promotion progress','推廣進度')}</h2>
  {loading&&<p role="status">{t('Loading promotions…','正在載入推廣…')}</p>}
  <button className="k-btn" disabled={blocked||loading} onClick={()=>void load()}>{t('Reload promotion','重新載入推廣')}</button>
  {data&&<>
   <dl className="k-merchant-summary">{([['draft','Drafts','草稿'],['published','Open promotions','開放推廣'],['applications','Applications awaiting review','待審申請'],['activeCreators','Accepted creators','已接受創作者'],['submitted','Submitted deliverables','已提交作品'],['approved','Approved deliverables','已批准作品']] as const).map(([key,en,zh])=><div key={key}><dt>{t(en,zh)}</dt><dd>{data.summary[key]}</dd></div>)}</dl>
   <p>{t('Counts cover this company, including records on other pages. Approved work is a delivery result; it does not represent a payment.','數量涵蓋此公司，包括其他頁面的紀錄。已批准作品代表交付結果，並不代表付款。')}</p>
   {data.items.length===0?<p>{t('No promotions yet. Save your first draft above.','尚未有推廣，請在上方儲存第一份草稿。')}</p>:data.items.map(item=><article className="k-card" key={item.id}><h3>{item.title}</h3><p>{item.summary}</p><p>{status(item.status)}</p><button className="k-btn" disabled={blocked||loading||dirty} onClick={()=>{resetEditor();void load({...query.current,campaignId:item.id,participantsAfter:undefined,submissionsAfter:undefined});}}>{t('Manage promotion','管理推廣')} · {item.title}</button></article>)}
   {data.nextCursor&&<button className="k-btn" disabled={blocked||loading||dirty} onClick={()=>{resetEditor();void load({after:data.nextCursor!});}}>{t('Next promotions','下一頁推廣')}</button>}
   {query.current.after&&<button className="k-btn" disabled={blocked||loading||dirty} onClick={()=>{resetEditor();void load({});}}>{t('First promotions','第一頁推廣')}</button>}
   {data.detail&&<section className="k-card"><h3>{t('Promotion details','推廣詳情')} · {data.detail.title}</h3><p>{status(data.detail.status)}</p>
    <p>{data.detail.requiresApplication?t('Creators apply before they can submit work. Review each proposal below.','創作者必須先申請才可提交作品，請在下方審核各項提案。'):t('This promotion keeps its existing creator joining rules.','此推廣沿用原有的創作者參與規則。')}</p>
    <p>{data.detail.summary}</p><p>{t('Coupon code','優惠碼')}: {data.detail.couponCode||t('Not supplied','未提供')}</p>{campaignLink(data.detail.couponUrl)&&<p><a href={data.detail.couponUrl} target="_blank" rel="noreferrer noopener">{t('Open coupon page','開啟優惠網頁')}</a></p>}
    <p>{t('Recorded commission percentages: affiliate / platform / creator','已記錄佣金百分比：聯盟／平台／創作者')} · {[data.detail.affiliateRate,data.detail.kinnsoRate,data.detail.creatorRate].map(value=>value===null?t('Not supplied','未提供'):String(value)+'%').join(' / ')}</p>
    {data.detail.canEdit&&<><button className="k-btn" disabled={blocked||dirty} onClick={()=>edit(data.detail!)}>{t('Edit saved draft','修改已儲存草稿')}</button><button className="k-btn primary" disabled={blocked||dirty} onClick={()=>void send({type:'publish',id:data.detail!.id,expectedUpdatedAt:data.detail!.updatedAt,reason:t('Merchant confirmed the saved promotion brief for publication','商戶確認發布已儲存推廣簡報')})}>{t('Publish saved draft','發布已儲存草稿')}</button></>}
    {data.detail.canClose&&<button className="k-btn" disabled={blocked} onClick={()=>void send({type:'close',id:data.detail!.id,expectedUpdatedAt:data.detail!.updatedAt,reason:t('Merchant closed the promotion to new applications','商戶停止接受此推廣的新申請')})}>{t('Close new applications','停止接受新申請')}</button>}
    {!!data.detail.requirements.length&&<><h4>{t('Requirements','要求')}</h4><ul>{data.detail.requirements.map((value,i)=><li key={i}>{value}</li>)}</ul></>}
    {!!data.detail.deliverables.length&&<><h4>{t('Deliverables','作品')}</h4><ul>{data.detail.deliverables.map((value,i)=><li key={i}>{value}</li>)}</ul></>}
    {data.detail.milestones.map(m=><article key={m.id}><h4>{m.title||t('Untitled milestone','未命名里程碑')}</h4><p>{m.description}</p>{m.dueAt&&<p>{t('Due','到期')} · {date(m.dueAt)}</p>}</article>)}
    <h3>{t('Creator applications and decisions','創作者申請及決定')}</h3>
    {data.detail.participants.length===0&&<p>{t('No creator applications yet.','尚未有創作者申請。')}</p>}
    {data.detail.participants.map(participant=><article className="k-card" key={participant.id}><h4>{participant.creatorName||t('Creator','創作者')}{participant.creatorHandle?' · @'+participant.creatorHandle:''}</h4><p>{status(participant.status)}</p><p>{participant.note||t('No application note supplied.','未提供申請說明。')}</p>{participant.reviewNote&&<p>{t('Your review','你的審核')}: {participant.reviewNote}</p>}
     {participant.status==='applied'&&participant.creatorId!==actorId&&<><label>{t('Application review feedback','申請審核回饋')}<textarea maxLength={2000} disabled={blocked} value={feedback[participant.id]??''} onChange={e=>setFeedback({...feedback,[participant.id]:e.target.value})}/></label>{(['approve','reject'] as const).map(action=><button className="k-btn" key={action} disabled={blocked||!(feedback[participant.id]??'').trim()||(action==='approve'&&data.detail!.status!=='published')} onClick={()=>void send({type:'reviewApplication',id:participant.id,expectedUpdatedAt:participant.updatedAt,action,note:feedback[participant.id].trim(),reason:feedback[participant.id].trim()})}>{action==='approve'?t('Approve application','批准申請'):t('Reject application','拒絕申請')}</button>)}</>}
    </article>)}
    {data.detail.participantsNextCursor&&<button className="k-btn" disabled={blocked||loading} onClick={()=>void load({...query.current,participantsAfter:data.detail!.participantsNextCursor!})}>{t('Next applications','下一頁申請')}</button>}
    <h3>{t('Submitted work and outcomes','已提交作品及結果')}</h3>
    {data.role!=='owner'?<p>{t('The company owner can open private submitted evidence and review coupon deliverables.','公司擁有人可開啟私人提交證明並審核優惠推廣作品。')}</p>:data.detail.submissions.length===0&&<p>{t('No deliverables submitted yet.','尚未有已提交作品。')}</p>}
    {data.detail.submissions.map(submission=><article className="k-card" key={submission.id}><h4>{submission.creatorName||t('Creator','創作者')} · {submission.milestoneTitle}</h4><p>{status(submission.status)} · {date(submission.submittedAt)}</p><p>{submission.notes}</p><ul>{submission.proofUrls.filter(campaignLink).map(url=><li key={url}><a href={url} target="_blank" rel="noreferrer noopener">{t('Open submitted evidence','開啟已提交證明')} · {new URL(url).hostname}</a></li>)}</ul>{submission.feedback&&<p>{t('Review feedback','審核回饋')}: {submission.feedback}</p>}
     {data.detail!.canReviewSubmissions&&submission.status==='submitted'&&submission.creatorId!==actorId&&<><label>{t('Deliverable review feedback','作品審核回饋')}<textarea maxLength={2000} disabled={blocked} value={feedback[submission.id]??''} onChange={e=>setFeedback({...feedback,[submission.id]:e.target.value})}/></label>{(['approve','request_revision','reject'] as const).map(action=><button className="k-btn" key={action} disabled={blocked||!(feedback[submission.id]??'').trim()} onClick={()=>void send({type:'reviewSubmission',id:submission.id,expectedUpdatedAt:submission.updatedAt,action,feedback:feedback[submission.id].trim(),reason:feedback[submission.id].trim()})}>{action==='approve'?t('Approve deliverable','批准作品'):action==='reject'?t('Reject deliverable','拒絕作品'):t('Request revision','要求修改')}</button>)}</>}
    </article>)}
    {data.detail.submissionsNextCursor&&<button className="k-btn" disabled={blocked||loading} onClick={()=>void load({...query.current,submissionsAfter:data.detail!.submissionsNextCursor!})}>{t('Next submitted work','下一頁作品')}</button>}
   </section>}
   {data.role==='owner'&&<section id="merchant-branch-management"><h3>{t('Manage branches','管理分店')}</h3><p>{t('Archiving disables branch actions. Existing assignments and recorded outcomes are retained.','封存會停用分店操作，原有權限分配及結果紀錄會保留。')}</p>{data.branches.map(branch=>{const edit=branchEdits[branch.id]??{name:branch.name,reason:''};return <form className="k-card" key={branch.id} onSubmit={e=>{e.preventDefault();void send({type:'setBranch',id:branch.id,expectedActive:branch.active,expectedName:branch.name,name:edit.name,active:branch.active,reason:edit.reason});}}><h4>{branch.name} · {branch.active?t('Active','生效'):t('Archived','已封存')}</h4><label>{t('Updated branch name','更新分店名稱')}<input maxLength={120} required value={edit.name} disabled={blocked} onChange={e=>setBranchEdits({...branchEdits,[branch.id]:{...edit,name:e.target.value}})}/></label><label>{t('Branch change reason','分店變更原因')}<textarea maxLength={2000} required value={edit.reason} disabled={blocked} onChange={e=>setBranchEdits({...branchEdits,[branch.id]:{...edit,reason:e.target.value}})}/></label><button className="k-btn" disabled={blocked||!edit.reason.trim()||!edit.name.trim()}>{t('Save branch name','儲存分店名稱')}</button><button className="k-btn" type="button" disabled={blocked||!edit.reason.trim()} onClick={()=>void send({type:'setBranch',id:branch.id,expectedActive:branch.active,expectedName:branch.name,name:branch.name,active:!branch.active,reason:edit.reason})}>{branch.active?t('Archive branch','封存分店'):t('Restore branch','還原分店')}</button></form>;})}{data.branchesNextCursor&&<button className="k-btn" disabled={blocked||loading} onClick={()=>void load({...query.current,branchesAfter:data.branchesNextCursor!})}>{t('Next branches','下一頁分店')}</button>}{query.current.branchesAfter&&<button className="k-btn" disabled={blocked||loading} onClick={()=>void load({...query.current,branchesAfter:undefined})}>{t('First branches','第一頁分店')}</button>}</section>}
  </>}
 </section>;
}
