'use client';
import type {ErrorCode} from '../../lib/contracts/capabilities';
import {safeReturnPath} from '../../lib/auth/return-path';

type Props = {
  locale: string;
  code: ErrorCode | string;
  requestId?: string;
  retryState: 'read' | 'immutable-command' | 'blocked';
  onRetry?: () => void;
  returnPath?: string;
  retryLabel?: string;
};

/** Describes recovery; the caller owns every retained intent and recovery read. */
export function WorkspaceServiceState({locale,code,requestId,retryState,onRetry,returnPath,retryLabel}:Props) {
  const language=locale==='zh-HK'?'zh-HK':'en';
  const t=(en:string,zh:string)=>language==='zh-HK'?zh:en;
  const auth=code==='AUTH_REQUIRED',forbidden=code==='FORBIDDEN';
  const uncertain=retryState==='immutable-command'&&!auth&&!forbidden;
  const message=auth?t('Your session has ended. Sign in to return to this task.','登入已失效，請重新登入以返回此工作。'):
    forbidden?t('Your account cannot access this work. Check your current role or contact support.','此帳戶未能存取這項工作。請核對目前權限或聯絡支援。'):
    uncertain?t('The result is not confirmed. Your original request and input are kept. Check the saved status before retrying the same request.','尚未確認結果，原本請求及輸入已保留。重試相同請求前會先核對已保存狀態。'):
    code==='CONFLICT'?t('This record changed. Your input is kept. Reload and compare the latest saved version before submitting again.','紀錄已有變更，輸入仍保留。請重新載入並核對最新已保存版本，再決定如何提交。'):
    code==='NOT_FOUND'?t('This work is unavailable or your account cannot access it.','此工作不存在或此帳戶未能存取。'):
    code==='INVALID'?t('Check the entered details and the current work status. Your input is kept.','請核對輸入資料及目前工作狀態，輸入仍保留。'):
    t('This service is temporarily unavailable. Try again when the connection is available.','服務暫時未能使用，請在連線恢復後重試。');
  const canRetry=Boolean(onRetry)&&retryState!=='blocked'&&!auth&&!forbidden&&
    (uncertain||['UNAVAILABLE','CONFLICT','NOT_FOUND'].includes(code));
  const next=safeReturnPath(returnPath,language);
  const safeReference=requestId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)?requestId:null;
  return <div className="k-card" role="alert" aria-label={t('Workspace service status','工作區服務狀態')} style={{overflowWrap:'anywhere'}}>
    <p>{message}</p>
    {safeReference&&<p className="k-muted">{t('Reference: ','參考編號：')}{safeReference}</p>}
    {auth&&<a className="k-btn primary" href={`/${language}/sign-in?next=${encodeURIComponent(next)}`}>{t('Sign in to continue','登入後繼續')}</a>}
    {canRetry&&<button className="k-btn" type="button" onClick={onRetry}>{retryLabel??(uncertain?t('Retry the same request','重試相同請求'):code==='CONFLICT'?t('Reload and compare','重新載入並核對'):t('Retry loading','重試載入'))}</button>}
  </div>;
}
