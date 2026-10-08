'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {merchantInvitations,type InvitationDirectory} from '../../lib/merchants/repository';
import {invitationLink,newInvitationToken} from '../../lib/merchants/invitations';
import {previewMemberAccess} from '../../lib/merchants/access';
type Pending={command:Record<string,unknown>;requestId:string;token?:string};
export function MerchantInvitations({actorId,merchantId,branches,locked,onDenied,onLockChange}:{actorId:string;merchantId:string;branches:{id:string;name:string}[];locked:boolean;onDenied:(code:string)=>void;onLockChange:(value:boolean)=>void}){
 const {t,locale}=useApp();
 const [directory,setDirectory]=useState<InvitationDirectory|null>(null),[email,setEmail]=useState(''),[label,setLabel]=useState(''),[role,setRole]=useState('clerk'),[branchIds,setBranchIds]=useState<string[]>([]),[reason,setReason]=useState(''),[revokeReason,setRevokeReason]=useState('');
 const [link,setLink]=useState(''),[expiry,setExpiry]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[valid,setValid]=useState(true);
 const epoch=useRef(0),reads=useRef(0),pending=useRef<Pending|null>(null);
 const disabled=locked||busy||unknown||loading;
 const formDisabled=disabled||directory===null;
 function clear(){pending.current=null;setDirectory(null);setEmail('');setLabel('');setRole('clerk');setBranchIds([]);setReason('');setRevokeReason('');setLink('');setExpiry('');setUnknown(false);setBusy(false);setLoading(false);}
 function denied(code:string){epoch.current++;reads.current++;clear();setValid(false);setError(code);onDenied(code);}
 async function load(after?:string){const own=epoch.current,read=++reads.current;setLoading(true);setDirectory(null);const r=await merchantInvitations.list(merchantId,after);if(own!==epoch.current||read!==reads.current)return;setLoading(false);if(!r.ok){setError(r.code);if(['FORBIDDEN','AUTH_REQUIRED'].includes(r.code))denied(r.code);return;}setDirectory(r.data);}
 useEffect(()=>{epoch.current++;reads.current++;clear();setValid(true);setError('');void load();const off=subscribeAccountInvalidation(next=>{if(next!==actorId){epoch.current++;reads.current++;clear();setValid(false);}});return()=>{epoch.current++;reads.current++;off();};},[actorId,merchantId]);
 useEffect(()=>{onLockChange(busy||unknown);return()=>onLockChange(false);},[busy,unknown,onLockChange]);
 const access=previewMemberAccess(role,true,branchIds,branches.map(b=>({...b,active:true})));
 const roleName=(value:string)=>value==='marketing'?t('Marketing','推廣'):value==='finance'?t('Finance','財務'):t('Branch clerk','分店店員');
 const statusName=(value:string)=>({pending:t('Pending','待接受'),accepted:t('Accepted','已接受'),revoked:t('Revoked','已撤銷'),invalidated:t('Invalidated by company access change','公司權限變更後失效'),expired:t('Expired','已過期')}[value]??t('Unavailable','不可用'));
 async function send(command?:Record<string,unknown>,token?:string){if(busy||locked)return;const own=epoch.current;
  pending.current??=command?{command,requestId:crypto.randomUUID(),token}:null;const p=pending.current;if(!p)return;
  setBusy(true);setError('');setLink('');setExpiry('');const r=await merchantInvitations.command(merchantId,p.command,p.requestId);if(own!==epoch.current)return;setBusy(false);
  if(!r.ok){setError(r.code);setUnknown(r.code==='UNAVAILABLE');if(r.code!=='UNAVAILABLE')pending.current=null;if(['FORBIDDEN','AUTH_REQUIRED'].includes(r.code))denied(r.code);return;}
  pending.current=null;setUnknown(false);setEmail('');setLabel('');setReason('');setRevokeReason('');
  if(p.token&&r.data.status==='pending'){setLink(invitationLink(window.location.origin,locale,p.token));setExpiry(r.data.expiresAt??'');}
  await load();
 }
 if(!valid)return null;
 return <section className="k-card" aria-label={t('Company invitations','公司邀請')}><h2>{t('Invite a company colleague','邀請公司同事')}</h2>
 <p>{t('Invite the colleague’s verified account email. They review the role and branches before accepting. Share the private link yourself; no email is sent here.','請填寫同事帳戶已驗證的電郵；對方接受前會查看角色及分店權限。請自行分享私人連結；此處不會寄出電郵。')}</p>
 {error&&<p role="alert">{error==='INVALID'?t('Check the invitation details or pending invitation limit.','請核對邀請資料或待接受邀請數目上限。'):t('Invitation services are unavailable or the result is uncertain. Retry the same request if offered.','邀請服務不可用，或結果尚未確認；如有重試按鈕，請重試相同請求。')}</p>}
 <form aria-label={t('Invitation form','邀請表格')} style={{display:'grid',gap:'1rem'}} onSubmit={e=>{e.preventDefault();if(formDisabled||!access.valid||!reason.trim())return;try{const token=newInvitationToken(crypto);void send({type:'create',id:crypto.randomUUID(),token,email:email.trim(),label:label.trim(),role,branchIds,reason:reason.trim()},token);}catch{setError('INVALID');}}}>
 <label>{t('Recipient email','收件人電郵')}<input aria-label={t('Recipient email','收件人電郵')} required type="email" maxLength={254} autoComplete="off" value={email} disabled={formDisabled} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box'}}/></label>
 <label>{t('Private invitation label','私人邀請名稱')}<input aria-label={t('Private invitation label','私人邀請名稱')} required maxLength={120} value={label} disabled={formDisabled} onChange={e=>setLabel(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box'}}/></label>
 <label>{t('Invitation role','邀請角色')}<select aria-label={t('Invitation role','邀請角色')} value={role} disabled={formDisabled} onChange={e=>setRole(e.target.value)}>{['marketing','clerk','finance'].map(value=><option key={value} value={value}>{roleName(value)}</option>)}</select></label>
 <fieldset disabled={formDisabled}><legend>{t('Invitation branches','邀請分店')}</legend>{branches.map(b=><label key={b.id} style={{display:'block'}}><input type="checkbox" checked={branchIds.includes(b.id)} onChange={e=>setBranchIds(e.target.checked?[...branchIds,b.id]:branchIds.filter(id=>id!==b.id))}/>{b.name}</label>)}</fieldset>
 <div><h3>{t('Invitation access preview','邀請權限預覽')}</h3><p>{roleName(role)} · {access.branchNames.join(', ')||t('No branches assigned','未分配分店')}</p><p>{role==='marketing'?t('Promotion management; no redemption or company finance.','管理推廣；不可核銷或審閱公司財務。'):role==='clerk'?t('Redemption only at assigned branches; no company finance.','只可在獲分配分店核銷；不可審閱公司財務。'):t('Recorded financial outcomes within assigned branches; no redemption or member management.','審閱獲分配分店內的已記錄財務結果；不可核銷或管理成員。')}</p></div>
 <label>{t('Invitation reason','邀請原因')}<textarea aria-label={t('Invitation reason','邀請原因')} required maxLength={2000} value={reason} disabled={formDisabled} onChange={e=>setReason(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box'}}/></label>
 <button className="k-btn" disabled={formDisabled||!email.trim()||!label.trim()||!reason.trim()||!access.valid}>{t('Create private invitation','建立私人邀請')}</button>
 <button className="k-btn" type="button" disabled={formDisabled} onClick={()=>{setEmail('');setLabel('');setReason('');setBranchIds([]);}}>{t('Cancel invitation edits','取消邀請修改')}</button></form>
 {unknown&&<button className="k-btn" disabled={busy||locked} onClick={()=>void send()}>{t('Retry invitation request','重試邀請請求')}</button>}
 {link&&<div><p role="status">{t('Invitation recorded on the server. Keep this private link until shared; it is not stored on this device.','邀請已記錄至伺服器。分享前請保留私人連結；本裝置不會儲存連結。')} {expiry}</p><label>{t('Private invitation link','私人邀請連結')}<textarea aria-label={t('Private invitation link','私人邀請連結')} readOnly value={link} style={{display:'block',width:'100%',boxSizing:'border-box'}}/></label><button className="k-btn" disabled={disabled} onClick={()=>{setLink('');setExpiry('');}}>{t('Clear private link','清除私人連結')}</button></div>}
 <h3>{t('Recorded invitations','已記錄邀請')}</h3>{loading&&<p role="status">{t('Loading invitations…','正在載入邀請…')}</p>}
 <button className="k-btn" disabled={disabled} onClick={()=>void load()}>{t('Refresh invitations','重新載入邀請')}</button>
 {directory&&<><label>{t('Invitation cancellation reason','撤銷邀請原因')}<input aria-label={t('Invitation cancellation reason','撤銷邀請原因')} maxLength={2000} value={revokeReason} disabled={disabled} onChange={e=>setRevokeReason(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box'}}/></label>{directory.invitations.map(invite=><article key={invite.id}><p>{invite.label} · {roleName(invite.role)} · {statusName(invite.status)} · {invite.expiresAt}</p>{invite.status==='pending'&&<button className="k-btn" disabled={disabled||!revokeReason.trim()} onClick={()=>void send({type:'revoke',id:invite.id,reason:revokeReason.trim()})}>{t('Revoke invitation','撤銷邀請')}: {invite.label}</button>}</article>)}{directory.nextCursor&&<button className="k-btn" disabled={disabled} onClick={()=>void load(directory.nextCursor!)}>{t('Next invitations','下一頁邀請')}</button>}</>}
 </section>;
}
