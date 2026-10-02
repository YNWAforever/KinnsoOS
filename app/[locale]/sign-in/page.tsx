import Link from 'next/link';
import { notFound } from 'next/navigation';
import { signIn } from './actions';
import { safeReturnPath } from '../../../lib/auth/return-path';
import { backendTarget } from '../../../lib/contracts/capabilities';
export const metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export default async function SignInPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; error?: string;notice?:string }>;
}) {
  const { locale } = await params;
  if (!['en', 'zh-HK'].includes(locale)) notFound();
  const { next, error,notice } = await searchParams;
  const target = backendTarget(process.env);
  const t = (en: string, zh: string) => locale === 'en' ? en : zh;
  return <main className="k-page" style={{ maxWidth: 560, margin: 'auto' }}>
    <Link className="k-logo" href={`/${locale}`}>kinnso<span>✳</span></Link>
    <h1>{t('Sign in to Kinnso', '登入 Kinnso')}</h1>
    <p>{t('Use your existing Kinnso account. Each site keeps its own login cookie.', '使用現有 Kinnso 帳戶。兩個網站分別保存登入 cookie。')}</p>
    {notice==='cleanup-failed'&&<p role="alert">{t('Signed out, but device copies could not be cleared. Clear this site’s data on a shared device.','已登出，但未能清除裝置副本。如使用共用裝置，請清除此網站資料。')}</p>}
    {!target ? <p role="alert">{t('Account service is unavailable.', '帳戶服務暫未接通。')}</p> :
      <form action={signIn} className="k-form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={safeReturnPath(next, locale)} />
        <label>{t('Email', '電郵')}<input name="email" type="email" autoComplete="email" required /></label>
        <label>{t('Password', '密碼')}<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert">{t('Sign in could not be completed. Your task is kept; try again.', '未能登入，原有任務已保留，請重試。')}</p>}
        <button className="k-btn primary" type="submit">{t('Sign in', '登入')}</button>
      </form>}
    <p><Link href={safeReturnPath(next, locale)}>{t('Cancel and return', '取消及返回')}</Link></p>
  </main>;
}
