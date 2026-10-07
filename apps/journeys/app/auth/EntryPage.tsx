import Link from 'next/link';
import {notFound} from 'next/navigation';
import {backendTarget} from '../../lib/contracts/capabilities';
import {parseAuthIntent,authPath,type AuthEntry} from '../../lib/auth/auth-intent';
import {AuthSubmit,AuthError} from './AuthSubmit';
import {currentRecovery} from '../../lib/auth/recovery';
import {recoveryConfigured} from '../../lib/auth/recovery-proof';
import {restartRecovery} from '../[locale]/forgot-password/actions';
export type EntryProps={params:Promise<{locale:string}>;searchParams:Promise<{next?:string;error?:string;sent?:string}>};
export async function EntryPage({params,searchParams,entry,action}:{params:EntryProps['params'];searchParams:EntryProps['searchParams'];entry:Exclude<AuthEntry,'sign-in'>;action:(form:FormData)=>Promise<void>}){
 const {locale}=await params;if(!['en','zh-HK'].includes(locale))notFound();
 const query=await searchParams;
 const intent=parseAuthIntent(new URLSearchParams({next:query.next??'',flow:entry==='sign-up'?'sign-up':'recovery'}),locale);
 const t=(en:string,zh:string)=>locale==='en'?en:zh;
 const recovery=entry==='reset-password'?await currentRecovery():null;
 const ready=backendTarget(process.env)&&(entry==='sign-up'||recoveryConfigured(process.env.KINNSO_AUTH_RECOVERY_SECRET));
 const invalid=entry==='reset-password'&&(!recovery||recovery.proof.locale!==locale);
 const title=entry==='sign-up'?t('Create your Kinnso account','建立 Kinnso 帳戶'):entry==='forgot-password'?t('Recover your password','復原密碼'):t('Choose a new password','設定新密碼');
 const next=recovery?.proof.next??intent.next;
 return <main className="k-page" style={{maxWidth:560,margin:'auto'}}><Link className="k-logo" href={`/${locale}`}>kinnso<span>✳</span></Link><h1>{title}</h1>
  <p>{t('Your original task is kept. Device drafts are imported only after your preview and confirmation.','原有任務會保留，裝置草稿只會在你預覽及確認後匯入。')}</p>
  {query.sent==='1'?<p role="status">{entry==='sign-up'?t('If confirmation is needed and a message arrives, open it in this browser. Delivery has not been confirmed. You can sign in or try again.','如需確認及收到郵件，請在此瀏覽器開啟。郵件送達尚未確認，你可以登入或重試。'):t('If this address has an account and a recovery message arrives, open it in this browser. Delivery has not been confirmed. You can request another link.','如電郵對應帳戶並收到復原郵件，請在此瀏覽器開啟。郵件送達尚未確認，你可以再次索取連結。')}</p>:null}
  {!ready?<p role="alert">{t('This account service is unavailable. Your task is kept; retry later.','此帳戶服務暫未接通，原有任務已保留，請稍後重試。')}</p>:invalid?<><AuthError message={t('This recovery link is invalid, expired or already used. Request a new link.','復原連結無效、已過期或已使用，請索取新連結。')}/><Link href={authPath(intent,'forgot-password')}>{t('Request a new link','索取新連結')}</Link></>:<form action={action} className="k-form">
   <input type="hidden" name="locale" value={locale}/><input type="hidden" name="next" value={next}/>
   {entry!=='reset-password'&&<label>{t('Email','電郵')}<input name="email" type="email" autoComplete="email" maxLength={254} required aria-describedby={query.error?'auth-error':undefined}/></label>}
   {entry!=='forgot-password'&&<><label>{t('New password','新密碼')}<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={1024} required aria-describedby={query.error?'auth-error password-policy':'password-policy'}/></label><label>{t('Confirm password','確認密碼')}<input name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={1024} required aria-describedby={query.error?'auth-error':undefined}/></label><p id="password-policy">{t('Use at least 8 characters. Your account service may require a stronger password.','請使用至少 8 個字元，帳戶服務可能要求更強的密碼。')}</p></>}
   {query.error&&<AuthError message={query.error==='active'?t('Sign out before starting another recovery or account. Your device drafts are kept.','開始另一復原或建立帳戶前請先登出，裝置草稿會保留。'):t('Could not complete this request. Check your input and retry; your task is kept.','未能完成請求，請檢查輸入並重試，原有任務已保留。')}/>}
   <AuthSubmit label={entry==='sign-up'?t('Create account','建立帳戶'):entry==='forgot-password'?t('Request recovery link','索取復原連結'):t('Save new password','保存新密碼')} busyLabel={t('Please wait…','請稍候…')}/>
  </form>}
  {query.error==='active'&&<form action={restartRecovery}><input type="hidden" name="locale" value={locale}/><input type="hidden" name="next" value={intent.next}/><AuthSubmit label={t('Sign out and request a new link','登出及索取新連結')} busyLabel={t('Please wait…','請稍候…')}/></form>}
  <p><Link href={authPath({...intent,next},'sign-in')}>{t('Return to sign in','返回登入')}</Link></p><p><Link href={next}>{t('Cancel and return','取消及返回')}</Link></p>
 </main>;
}
