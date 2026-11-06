'use client';
import {useSearchParams} from 'next/navigation';
import {useRef,useState} from 'react';
import {parseOpsToken} from '../../lib/ops/team';
import {useApp} from './ui';

export function OpsInviteAcceptance({actorId,enabled}:{actorId:string|null;enabled:boolean}){
 const{locale,t}=useApp(),params=useSearchParams(),tokens=params.getAll('token'),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 let token='';
 try { if (tokens.length === 1) token=parseOpsToken(tokens[0]); } catch {}
 if(!enabled)return <section className="k-page"><h1>{t('Operations invitation','營運邀請')}</h1><p role="status">{t('Invitation acceptance is not connected yet.','邀請接受功能尚未接通。')}</p></section>;
 if(!token)return <section className="k-page"><h1>{t('Operations invitation','營運邀請')}</h1><p role="alert">{t('This invitation link is invalid or incomplete.','此邀請連結無效或不完整。')}</p></section>;
 if(!actorId)return <section className="k-page"><h1>{t('Operations invitation','營運邀請')}</h1><p>{t('Sign in with the email address that received this invitation.','請使用收到此邀請的電郵地址登入。')}</p><a className="k-btn primary" href={`/${locale}/sign-in?next=${encodeURIComponent('/'+locale+'/ops/accept-invite?token='+token)}`}>{t('Sign in to continue','登入後繼續')}</a></section>;
 async function accept(){if(busy||accepted||pending.current)return;pending.current=true;setBusy(true);setError('');try{const response=await fetch('/api/ops/invitations/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store'}),body=await response.json();if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');setAccepted(true);}catch(next){setError(next instanceof Error?next.message:'UNAVAILABLE');pending.current=false;}finally{setBusy(false);}}
 if(accepted)return <section className="k-page"><h1>{t('Operations invitation','營運邀請')}</h1><p role="status">{t('Invitation accepted. Your operations access is active.','邀請已接受，你的營運存取權已生效。')}</p><a className="k-btn primary" href={`/${locale}/ops?view=team`}>{t('Open operations team','開啟營運團隊')}</a></section>;
 return <section className="k-page"><h1>{t('Operations invitation','營運邀請')}</h1><div className="k-card"><p>{t('Accepting adds this signed-in account to the Kinnso operations team with the invited role.','接受後，此登入帳戶會以邀請角色加入 Kinnso 營運團隊。')}</p>{error&&<p role="alert">{t('Invitation could not be accepted: ','未能接受邀請：')}{error}</p>}<button className="k-btn primary" disabled={busy} onClick={()=>void accept()}>{busy?t('Accepting…','正在接受…'):t('Accept invitation','接受邀請')}</button></div></section>;
}
