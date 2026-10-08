'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {merchantTeam,type MerchantTeamDirectory} from '../../lib/merchants/repository';
import {previewMemberAccess,type AccessBranch} from '../../lib/merchants/access';

export function MerchantTeamAccess({actorId,merchantId,branches,refreshKey,locked,onSave,onDenied}:{actorId:string;merchantId:string;branches:AccessBranch[];refreshKey:number;locked:boolean;onSave:(command:Record<string,unknown>)=>Promise<void>;onDenied:(code:string)=>void}){
 const{t}=useApp();const[team,setTeam]=useState<MerchantTeamDirectory|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const[selected,setSelected]=useState(''),[role,setRole]=useState('clerk'),[active,setActive]=useState(true),[branchIds,setBranchIds]=useState<string[]>([]),[reason,setReason]=useState('');
 const generation=useRef(0),actor=useRef(actorId);actor.current=actorId;
 const roleLabel=(value:string)=>value==='marketing'?t('Marketing','推廣'):value==='finance'?t('Finance','財務'):t('Branch clerk','分店店員');
 function clear(){setSelected('');setRole('clerk');setActive(true);setBranchIds([]);setReason('');}
 async function load(after?:string){const own=++generation.current;setLoading(true);setTeam(null);setError('');clear();const result=await merchantTeam(merchantId,after);if(own!==generation.current)return;setLoading(false);if(!result.ok){setError(result.code);if(result.code==='FORBIDDEN'||result.code==='AUTH_REQUIRED')onDenied(result.code);return;}setTeam(result.data);}
 useEffect(()=>{void load();const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actor.current){generation.current++;setTeam(null);clear();setLoading(false);}});return()=>{generation.current++;unsubscribe();};},[actorId,merchantId,refreshKey]);
 const member=team?.members.find(m=>m.userId===selected);
 const available=[...branches,...(member?.branches??[]).filter(b=>!branches.some(x=>x.id===b.id))];
 const preview=previewMemberAccess(role,active,branchIds,available);
 function choose(id:string){const known=team?.members.find(m=>m.userId===id);setSelected(known?.userId??'');setRole(known?.role??'clerk');setActive(known?.active??true);setBranchIds(known?.branchIds??[]);setReason('');}
 return <div className="k-card"><h2>{t('Existing company team','目前公司成員')}</h2><p>{t('Only members already related to this company are listed. Invite a new colleague below when invitation services are connected.','只列出與目前公司已有關聯的成員；邀請服務接通後，可在下方邀請新同事。')}</p>
 {loading&&<p role="status">{t('Loading company team…','正在載入公司成員…')}</p>}{error&&<p role="alert">{t('Team directory is not connected or current access has changed. Refresh to check again.','成員清單尚未接通，或目前權限已變更；請重新載入核對。')}</p>}
 <button className="k-btn" disabled={locked||loading} onClick={()=>void load()}>{t('Refresh team','重新載入成員')}</button>
 {team&&<><label>{t('Existing team member','現有公司成員')}<select aria-label={t('Existing team member','現有公司成員')} value={selected} disabled={locked||loading} onChange={e=>choose(e.target.value)}><option value="">{t('Select a company member','選擇公司成員')}</option>{team.members.map(m=><option key={m.userId} value={m.userId}>{m.name} · {roleLabel(m.role)} · {m.active?t('Active','生效'):t('Inactive','未生效')} · {m.userId.slice(-8)}</option>)}</select></label>{team.members.length===0&&<p>{t('No existing team members on this page.','本頁沒有現有公司成員。')}</p>}{team.nextCursor&&<button className="k-btn" disabled={locked||loading} onClick={()=>void load(team.nextCursor!)}>{t('Next team members','下一頁成員')}</button>}
 {member&&<form onSubmit={e=>{e.preventDefault();if(preview.valid&&reason.trim())void onSave({type:'setMember',userId:member.userId,role,branchIds,active,reason:reason.trim()});}}>
 <label>{t('Organization role','組織角色')}<select aria-label={t('Organization role','組織角色')} value={role} disabled={locked} onChange={e=>setRole(e.target.value)}>{['marketing','clerk','finance'].map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
 <fieldset disabled={locked}><legend>{t('Assigned branches','獲分配分店')}</legend>{branches.map(b=><label key={b.id}><input type="checkbox" checked={branchIds.includes(b.id)} onChange={e=>setBranchIds(e.target.checked?[...branchIds,b.id]:branchIds.filter(id=>id!==b.id))}/>{b.name}</label>)}</fieldset>
 {preview.unavailableBranchIds.map(id=><p key={id}>{t('Unavailable assigned branch','已分配但不可用的分店')}: {available.find(b=>b.id===id)?.name??id.slice(-8)} <button className="k-btn" type="button" disabled={locked} onClick={()=>setBranchIds(branchIds.filter(value=>value!==id))}>{t('Remove unavailable branch','移除不可用分店')}</button></p>)}
 <label><input type="checkbox" checked={active} disabled={locked} onChange={e=>setActive(e.target.checked)}/>{t('Access active','權限生效')}</label>
 <div role="status"><h3>{t('Access preview','權限預覽')}</h3><p>{roleLabel(role)} · {preview.branchNames.join(', ')||t('No branches assigned','未分配分店')}</p><p>{!active?t('Access is inactive.','權限未生效。'):!preview.valid?t('Remove unavailable branch assignments before saving.','儲存前請移除不可用分店。'):preview.canPublish?t('Can publish and review company promotion briefs; cannot redeem or review financial records.','可發布及審核公司推廣簡報；不可核銷或審閱財務紀錄。'):preview.canRedeem?t('Can redeem and view outcomes only at the assigned branches; no company financial review.','只可在獲分配分店核銷及查看結果；不可審閱公司財務。'):preview.canReadFinance?t('Can review recorded financial outcomes within the assigned branches; cannot redeem or manage members.','可審閱獲分配分店內的已記錄財務結果；不可核銷或管理成員。'):t('No branch actions are assigned.','未分配分店操作。')}</p><p>{t('This is a preview. The server confirms current company and branch access when saving.','這是權限預覽；儲存時會由伺服器核對目前公司及分店權限。')}</p></div>
 <label>{t('Access change reason','權限變更原因')}<textarea required maxLength={2000} value={reason} disabled={locked} onChange={e=>setReason(e.target.value)}/></label>
 <button className="k-btn" disabled={locked||!preview.valid||!reason.trim()}>{t('Save team access','儲存成員權限')}</button><button className="k-btn" type="button" disabled={locked} onClick={clear}>{t('Cancel team edits','取消成員修改')}</button>
 </form>}</>}
 </div>;
}
