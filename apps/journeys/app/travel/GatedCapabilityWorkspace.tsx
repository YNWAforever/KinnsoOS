'use client';
import Link from 'next/link';
import {useApp} from './ui';

type Kind='creator-offers'|'creator-scan'|'operations-settlements';
export function GatedCapabilityWorkspace({actorId,kind}:{actorId:string|null;kind:Kind}){
 const{locale,t}=useApp();
 const titles:Record<Kind,[string,string]>={
  'creator-offers':['Affiliate offers','聯盟優惠'],
  'creator-scan':['Creator scan and DNA','創作者掃描及 DNA'],
  'operations-settlements':['Settlement operations','結算營運'],
 };
 const details:Record<Kind,[string,string]>={
  'creator-offers':['Affiliate offer execution and partner tracking links remain disabled until provider credentials, pricing, retries and data-retention checks pass. Existing collaborations and earnings records remain available.','聯盟優惠執行及合作夥伴追蹤連結仍暫停，直至供應商憑證、價格、重試及資料保留檢查通過。現有合作及收益紀錄仍可使用。'],
  'creator-scan':['Paid AI scanning and media analysis remain disabled until a reviewed budget, provider contract and retry controls are enabled. This is not an empty scan result.','付費 AI 掃描及媒體分析仍暫停，直至經審核的預算、供應商合約及重試控制啟用。此處不會當作空白掃描結果。'],
  'operations-settlements':['Payout and settlement execution remains outside this release. Historical reconciliation is available separately; no zero balance or successful payment is inferred.','提款及結算執行不在此版本內。歷史對帳可另行查閱；此處不會推斷零結餘或成功付款。'],
 };
 const[en,zh]=titles[kind],[bodyEn,bodyZh]=details[kind],returnPath=kind==='operations-settlements'?'ops':'studio';
 return <section className="k-page"><p className="k-eyebrow">{t('CAPABILITY GATED','功能暫停啟用')}</p><h1>{t(en,zh)}</h1>{!actorId?<Link className="k-btn" href={`/${locale}/sign-in?next=${encodeURIComponent('/'+locale+'/'+returnPath)}`}>{t('Sign in to continue','登入後繼續')}</Link>:<div className="k-card" role="status"><p>{t(bodyEn,bodyZh)}</p><Link className="k-btn" href={`/${locale}/${returnPath}`}>{t('Return to workspace','返回工作區')}</Link></div>}</section>;
}
