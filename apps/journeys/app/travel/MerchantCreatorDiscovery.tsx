'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {merchantCreators,type DiscoveryDirectory,type DiscoveryQuery} from '../../lib/merchants/creator-discovery';
import {campaignCommand,type CampaignCommand} from '../../lib/merchants/campaigns';
import {WorkspaceServiceState} from './WorkspaceServiceState';
type Props={actorId:string|null;merchantId:string;refreshKey?:number;locked?:boolean;onLockChange:(locked:boolean)=>void;onChanged:()=>Promise<void>|void;onDenied:(code:string)=>void};
export function MerchantCreatorDiscovery({actorId,merchantId,refreshKey=0,locked=false,onLockChange,onChanged,onDenied}:Props){
 const {locale,t}=useApp(),[valid,setValid]=useState(true),[data,setData]=useState<DiscoveryDirectory|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[loading,setLoading]=useState(false),[q,setQ]=useState(''),[savedOnly,setSavedOnly]=useState(false),[notes,setNotes]=useState<Record<string,string>>({}),[campaignId,setCampaignId]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0),key=useRef(`${actorId}:${merchantId}`),live=useRef(true),running=useRef(false),reference=useRef<string|undefined>(undefined),query=useRef<DiscoveryQuery>({}),pending=useRef<{command:CampaignCommand;requestId:string}|null>(null);
 if(key.current!==`${actorId}:${merchantId}`){key.current=`${actorId}:${merchantId}`;generation.current++;live.current=true;}
 function clear(){generation.current++;live.current=false;running.current=false;pending.current=null;reference.current=undefined;setValid(false);setData(null);setNotes({});setQ('');setSavedOnly(false);setCampaignId('');setMessage('');setBusy(false);setUnknown(false);setLoading(false);}
 function denied(code:string){if(['AUTH_REQUIRED','FORBIDDEN'].includes(code)){clear();setError(code);onDenied(code);}}
 async function load(next:DiscoveryQuery=query.current,append=false){if(!live.current)return;const own=++generation.current;setLoading(true);const result=await merchantCreators.list(merchantId,next);if(own!==generation.current||!live.current)return;setLoading(false);
  if(!result.ok){reference.current=result.requestId;setError(result.code);setData(null);denied(result.code);return;}
  query.current=next;setError('');setData(old=>append&&old?{...result.data,items:[...old.items,...result.data.items.filter(c=>!old.items.some(p=>p.id===c.id))]}:result.data);
 }
 useEffect(()=>{if(!actorId){clear();return;}live.current=true;setValid(true);setData(null);setNotes({});setQ('');setSavedOnly(false);setCampaignId('');setError('');setMessage('');setBusy(false);setUnknown(false);pending.current=null;running.current=false;query.current={};void load({});return()=>{generation.current++;};},[actorId,merchantId]);
 useEffect(()=>subscribeAccountInvalidation(()=>clear()),[]);
 useEffect(()=>{if(refreshKey&&!busy&&!unknown&&live.current)void load({...query.current,after:undefined,campaignsAfter:undefined});},[refreshKey]);
 useEffect(()=>{onLockChange(busy||unknown);return()=>onLockChange(false);},[busy,unknown,onLockChange]);
 async function send(command?:CampaignCommand){if(running.current||!live.current)return;if(!pending.current){if(!command)return;try{pending.current={command:campaignCommand(command),requestId:crypto.randomUUID()};}catch{setError('INVALID');return;}}
  const intent=pending.current,own=generation.current;running.current=true;setBusy(true);setMessage('');
  if(unknown){const receipt=await merchantCreators.receipt(merchantId,intent.requestId);if(own!==generation.current||!live.current)return;
   if(!receipt.ok){running.current=false;setBusy(false);reference.current=receipt.requestId;setError(receipt.code);denied(receipt.code);return;}
   if(receipt.data.result){pending.current=null;running.current=false;setBusy(false);setUnknown(false);setError('');setMessage(t('Saved request confirmed.','已確認原本請求已保存。'));await load({...query.current,after:undefined});await onChanged();return;}
  }
  const result=await merchantCreators.command(merchantId,intent.command,intent.requestId);if(own!==generation.current||!live.current)return;running.current=false;setBusy(false);
  if(!result.ok){reference.current=result.requestId;setError(result.code);setUnknown(result.code==='UNAVAILABLE');if(result.code!=='UNAVAILABLE')pending.current=null;denied(result.code);return;}
  pending.current=null;setUnknown(false);setError('');setMessage(t('Saved.','已保存。'));await load({...query.current,after:undefined});await onChanged();
 }
 const disabled=locked||busy||unknown||loading;
 if(!valid)return error?<WorkspaceServiceState locale={locale} code={error} retryState="blocked" returnPath={`/${locale}/merchant`}/>:null;
 return <section id="merchant-creators" className="k-card" style={{overflowWrap:'anywhere'}}>
  <h2>{t('Find creators','尋找創作者')}</h2><p className="k-muted">{t('Public profiles and published guide activity. Notes are private to this company owner.','公開檔案及已發布指南紀錄。備註只供此公司的擁有人查看。')}</p>
  {error&&<WorkspaceServiceState locale={locale} code={error} requestId={reference.current} retryState={unknown?'immutable-command':'read'} onRetry={()=>unknown?void send():void load({...query.current,after:undefined})} returnPath={`/${locale}/merchant`}/>}
  {message&&<p role="status">{message}</p>}
  <form onSubmit={event=>{event.preventDefault();if(!disabled)void load({q:q.trim(),savedOnly});}}><fieldset disabled={disabled}><label>{t('Search public profiles','搜尋公開檔案')}<input value={q} maxLength={100} onChange={event=>setQ(event.target.value)}/></label><label><input type="checkbox" checked={savedOnly} onChange={event=>setSavedOnly(event.target.checked)}/>{t('Saved creators only','只看已收藏創作者')}</label><button type="submit" className="k-btn">{t('Search','搜尋')}</button><button type="button" className="k-btn" onClick={()=>{setQ('');setSavedOnly(false);void load({});}}>{t('Clear filters','清除篩選')}</button></fieldset></form>
  {data&&<><p>{t('Invitations used this month','本月已用邀請')} {data.quota.used}/{data.quota.limit} · {t('Remaining','剩餘')} {data.quota.remaining}</p>
   <label>{t('Published campaign','已發布活動')}<select disabled={disabled} value={campaignId} onChange={event=>setCampaignId(event.target.value)}><option value="">{t('Select a campaign','選擇活動')}</option>{data.campaigns.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
   {data.campaignsNextCursor&&<button className="k-btn" disabled={disabled} onClick={async()=>{const own=generation.current;setLoading(true);const r=await merchantCreators.list(merchantId,{...query.current,campaignsAfter:data.campaignsNextCursor!});if(own!==generation.current||!live.current)return;setLoading(false);if(r.ok)setData({...data,campaigns:[...data.campaigns,...r.data.campaigns.filter(c=>!data.campaigns.some(p=>p.id===c.id))],campaignsNextCursor:r.data.campaignsNextCursor});else{setError(r.code);denied(r.code);}}}>{t('More campaigns','更多活動')}</button>}
   {!data.items.length&&<p>{t('No public creators match these filters.','沒有符合篩選的公開創作者。')}</p>}
   {data.items.map(c=><article key={c.id} className="k-card"><h3>{c.name}</h3><p>@{c.handle}</p><p>{c.bio}</p><p>{[...c.niches,...c.languages,...c.audienceGeos,...c.platforms].join(' · ')}</p><p>{t('Published guides','已發布指南')} {c.guideCount}{c.lastGuideAt&&` · ${c.lastGuideAt}`}</p>
    <button type="button" className="k-btn" disabled={disabled} onClick={()=>void send({type:c.saved?'unsaveCreator':'saveCreator',id:c.id,reason:t('Owner shortlist','擁有人收藏名單')})}>{c.saved?t('Unsave creator','取消收藏創作者'):t('Save creator','收藏創作者')}</button>
    {c.saved&&<><label>{t('Private note','私人備註')}<textarea disabled={disabled} value={notes[c.id]??c.note??''} maxLength={2000} onChange={event=>setNotes({...notes,[c.id]:event.target.value})}/></label><button type="button" className="k-btn" disabled={disabled||!c.savedUpdatedAt} onClick={()=>void send({type:'setSavedNote',id:c.id,note:notes[c.id]??c.note??'',expectedUpdatedAt:c.savedUpdatedAt!,reason:t('Owner assessment','擁有人備註')})}>{t('Save private note','保存私人備註')}</button></>}
    <button type="button" className="k-btn primary" disabled={disabled||!data.quota.remaining||!data.campaigns.some(m=>m.id===campaignId)} onClick={()=>{const campaign=data.campaigns.find(m=>m.id===campaignId);if(campaign)void send({type:'inviteCreator',id:campaign.id,creatorId:c.id,expectedUpdatedAt:campaign.updatedAt,reason:t('Owner reviewed public profile','擁有人已核對公開檔案')});}}>{t('Invite to selected campaign','邀請參與所選活動')}</button>
   </article>)}
   {data.nextCursor&&<button type="button" className="k-btn" disabled={disabled} onClick={()=>void load({...query.current,after:data.nextCursor!},true)}>{t('Load more creators','載入更多創作者')}</button>}
   <button type="button" className="k-btn" disabled={disabled} onClick={()=>void load({...query.current,after:undefined,campaignsAfter:undefined})}>{t('Refresh saved status','重新整理已保存狀態')}</button>
  </>}
 </section>;
}
