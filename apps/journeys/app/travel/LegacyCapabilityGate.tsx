import Link from 'next/link';
import type {GatedLegacyRoute} from './routes';

export function LegacyCapabilityGate({kind,locale}:{kind:GatedLegacyRoute;locale:string}){
 const chinese=locale==='zh-HK';
 const content=kind==='offer-claim'?{
  eyebrow:chinese?'功能暫停啟用':'CAPABILITY GATED',
  title:chinese?'旅客優惠領取暫停':'Traveller offer claims are disabled',
  body:chinese?'商戶優惠建立及管理計數仍然接通。旅客領取、確認頁及核銷碼在此版本暫停，直至重複提交、到期及中斷回應測試全部通過。':'Merchant offer creation and administrative counters remain connected. Traveller claim retrieval and redemption codes are disabled in this release until duplicate-submission, expiry and interrupted-response checks pass.',
 }:{
  eyebrow:chinese?'服務未在此版本提供':'SERVICE NOT AVAILABLE IN THIS RELEASE',
  title:chinese?'訂位確認暫停':'Booking confirmations are disabled',
  body:chinese?'訂位、付款、門票及服務提供者確認紀錄不在此版本內。本頁不構成訂位或付款完成證明。':'Booking, payments, tickets and provider confirmation records remain outside this release. This page is not proof of a reservation or a completed payment.',
 };
 return <section className="k-page"><p className="k-eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><div className="k-card" role="status"><p>{content.body}</p><div className="k-actions"><Link className="k-btn primary" href={`/${chinese?'zh-HK':'en'}/explore`}>{chinese?'探索攻略':'Explore guides'}</Link><Link className="k-btn" href={`/${chinese?'zh-HK':'en'}/support`}>{chinese?'開啟支援要求':'Open support requests'}</Link></div></div></section>;
}
