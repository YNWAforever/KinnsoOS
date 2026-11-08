'use client';
import Link from 'next/link';
import type {MatchCandidate} from '../../lib/discovery/contracts';
import {useApp} from '../travel/ui';
export function OfferMatchCard({value,runId,intentId,busy,onChoose}:{value:MatchCandidate&{choice?:string;choiceRevision?:number};runId:string;intentId:string;busy:boolean;onChoose:(choice:'saved'|'dismissed'|'cleared')=>void}){
 const {href}=useApp(),d=value.display;if(!d)return null;
 return <article className="cs-card ds-offer"><div className="ds-card-top"><span className="cs-chip">{value.eligibility==='eligible'?'符合已選條件':'還有資料待確認'}</span><span className="ds-score">{Math.round(value.score)}<small>/100 排序分數</small></span></div><h3>{d.title}</h3><p>{d.details}</p><p className="ds-price">{d.priceAmount===null?'價格未驗證':d.currency+' '+d.priceAmount}</p><p className="cs-note">適用：{d.validFrom} 至 {d.validUntil} · 已核對 {value.coverage}/5 項條件</p>
 <details><summary>為甚麼推薦？查看條款與缺口</summary><ul>{value.reasons.map(r=><li key={r}>{r}</li>)}</ul>{value.missing.map(r=><p key={r}>待確認：{r}</p>)}<p>{d.terms}</p><p className="cs-note">來源版本 {value.sourceRevision} · 最近核對：{new Date(value.checkedAt).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong'})}</p><p>排序分數不是成功機率。佣金、粉絲數及付款不影響排序。</p></details>
 <div className="cs-actions"><button className="k-btn" disabled={busy} onClick={()=>onChoose(value.choice==='saved'?'cleared':'saved')}>{value.choice==='saved'?'已收藏 · 取消收藏':'收藏這個配對'}</button><button className="k-btn" disabled={busy} onClick={()=>onChoose('dismissed')}>略過這個配對</button></div>
 {value.choice==='saved'&&<div className="ds-next">{value.grantVersions.some(g=>g.purpose==='private_brief')?<Link className="k-btn primary" href={href('workroom')+'?template=C1&matchRunId='+encodeURIComponent(runId)+'&publicationId='+encodeURIComponent(value.publicationId)}>用這個配對寫 guide</Link>:<p>創作用途尚未授權，請先請商戶核對。</p>}<Link href={href('workroom')+'?template=T1&discoveryIntentId='+encodeURIComponent(intentId)+'&publicationId='+encodeURIComponent(value.publicationId)}>交到 T1 行程預覽</Link></div>}
 {value.campaignId&&<Link href={href('studio/missions/'+value.campaignId)}>查看原合作與申請流程</Link>}
 </article>;
}
