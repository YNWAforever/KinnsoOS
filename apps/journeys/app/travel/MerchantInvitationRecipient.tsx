'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {merchantInvitations,merchants,type InvitationPreview,type MerchantWorkspaceDTO} from '../../lib/merchants/repository';
import {invitationToken} from '../../lib/merchants/invitations';
export function MerchantInvitationRecipient({actorId,enabled}:{actorId:string|null;enabled:boolean}){
 const {t,locale}=useApp();const [valid,setValid]=useState(true),[token,setToken]=useState(''),[preview,setPreview]=useState<InvitationPreview|null>(null),[workspace,setWorkspace]=useState<MerchantWorkspaceDTO|null>(null),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState('');
 const epoch=useRef(0),pending=useRef<{token:string;requestId:string}|null>(null),initial=useRef<{actorId:string|null;enabled:boolean;token:string}|null>(null),live=useRef(true),activity=useRef(false);activity.current=busy||unknown;
 function clear(release=true){if(release)initial.current=null;activity.current=false;setToken('');setPreview(null);setWorkspace(null);pending.current=null;setBusy(false);setUnknown(false);}
 useEffect(()=>{epoch.current++;clear(false);live.current=true;setValid(true);setError('');
  // StrictMode may replay setup after the fragment has been scrubbed. This ref
  // belongs only to this mounted account; cancellation/denial clears it.
  if(!initial.current||initial.current.actorId!==actorId||initial.current.enabled!==enabled)initial.current={actorId,enabled,token:actorId&&enabled?invitationToken(window.location.hash)??'':''};
  window.history.replaceState(null,'',window.location.pathname);setToken(initial.current.token);
  function reopen(){const raw=invitationToken(window.location.hash);if(raw||window.location.hash.startsWith('#invite='))window.history.replaceState(null,'',window.location.pathname);if(!raw||!actorId||!enabled||!live.current||activity.current||pending.current)return;epoch.current++;clear();initial.current={actorId,enabled,token:raw};setToken(raw);setError('');}
  window.addEventListener('hashchange',reopen);
  const off=subscribeAccountInvalidation(next=>{if(next!==actorId){epoch.current++;live.current=false;clear();setValid(false);}});return()=>{epoch.current++;live.current=false;window.removeEventListener('hashchange',reopen);off();};},[actorId,enabled]);
 function fail(code:string){setError(code);if(['FORBIDDEN','AUTH_REQUIRED'].includes(code)){epoch.current++;live.current=false;clear();setValid(false);}}
 async function review(){if(busy||unknown||!token)return;const own=epoch.current;activity.current=true;setBusy(true);setError('');setPreview(null);const r=await merchantInvitations.preview(token);if(own!==epoch.current)return;activity.current=false;setBusy(false);if(!r.ok){fail(r.code);return;}setPreview(r.data);}
 async function accept(){if(busy||!token||(!preview&&!pending.current))return;const own=epoch.current;pending.current??={token,requestId:crypto.randomUUID()};const p=pending.current;activity.current=true;setBusy(true);setError('');
  const r=await merchantInvitations.accept(p.token,p.requestId);if(own!==epoch.current)return;
  if(!r.ok){activity.current=r.code==='UNAVAILABLE';setBusy(false);setUnknown(r.code==='UNAVAILABLE');if(r.code!=='UNAVAILABLE')pending.current=null;fail(r.code);return;}
  if(!r.data.merchantId){setBusy(false);setUnknown(true);setError('UNAVAILABLE');return;}
  const current=await merchants.workspace(r.data.merchantId);if(own!==epoch.current)return;setBusy(false);
  if(!current.ok){activity.current=current.code==='UNAVAILABLE';setUnknown(current.code==='UNAVAILABLE');fail(current.code);return;}
  pending.current=null;initial.current=null;activity.current=false;setUnknown(false);setToken('');setPreview(null);setWorkspace(current.data);
 }
 const roleName=(value:string)=>value==='marketing'?t('Marketing','推廣'):value==='finance'?t('Finance','財務'):value==='owner'?t('Owner','擁有人'):t('Branch clerk','分店店員');
 return <section className="k-page"><h1>{t('Company invitation','公司邀請')}</h1>
 {!actorId||!valid?<><p>{t('Sign in with the intended verified account, then reopen the private invitation link. Account changes clear the invitation.','請以指定的已驗證帳戶登入，再重新開啟私人邀請連結；切換帳戶會清除邀請。')}</p><Link href={`/${locale}/sign-in?next=/${locale}/merchant/invitation`}>{t('Sign in to continue','登入後繼續')}</Link></>:!enabled?<p>{t('Invitation services are not connected yet.','邀請服務尚未接通。')}</p>:<>
 {error&&<p role="alert">{error==='FORBIDDEN'?t('This invitation is unavailable for your current account.','此邀請不適用於目前帳戶。'):error==='CONFLICT'?t('Access already exists or this invitation was used. Ask the owner to review current access.','權限已存在或邀請已使用；請擁有人核對目前權限。'):t('Could not confirm this request. Retry if offered, or reopen the invitation.','未能確認請求；如有重試按鈕請重試，或重新開啟邀請。')}</p>}
 {token&&!preview&&!unknown&&<button className="k-btn" disabled={busy} onClick={()=>void review()}>{t('Review invitation','查看邀請')}</button>}
 {!token&&!workspace&&<p>{t('Reopen a valid private invitation link to review its scope.','請重新開啟有效的私人邀請連結，以查看權限。')}</p>}
 {preview&&<div className="k-card"><h2>{preview.name}</h2><p>{roleName(preview.role)} · {preview.branches.map(b=>b.name).join(', ')||t('No branches assigned','未分配分店')}</p><p>{t('Expires','到期時間')}: {preview.expiresAt}</p><p>{t('Accept only if the company, role and branches are correct. Existing access is never overwritten by an invitation.','請確認公司、角色及分店正確才接受；邀請不會覆寫現有權限。')}</p><button className="k-btn primary" disabled={busy||unknown} onClick={()=>void accept()}>{t('Accept invitation','接受邀請')}</button><button className="k-btn" disabled={busy||unknown} onClick={()=>clear()}>{t('Cancel invitation','取消邀請')}</button></div>}
 {unknown&&<button className="k-btn" disabled={busy} onClick={()=>void accept()}>{t('Retry invitation acceptance','重試接受邀請')}</button>}
 {workspace&&<div className="k-card"><p role="status">{t('Invitation accepted and current company access confirmed.','邀請已接受，並已核對目前公司權限。')}</p><p>{roleName(workspace.role)} · {workspace.branches.map(b=>b.name).join(', ')||t('No branches assigned','未分配分店')}</p><Link className="k-btn" href={`/${locale}/merchant`}>{t('Open merchant workspace','開啟商戶工作區')}</Link></div>}
 </>}
 {busy&&<p role="status">{t('Checking current access…','正在核對目前權限…')}</p>}
 </section>;
}
