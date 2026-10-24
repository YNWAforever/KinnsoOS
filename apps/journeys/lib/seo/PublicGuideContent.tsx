import {describeGuideSource} from '../guides/source-summary';
import type {PublicGuide} from './public-guide';
import Image from 'next/image';
import {guideStructuredData} from './guide-publication';
// Renders during SSR and hydration. React escapes authored text; every field is a public projection.
// The public contract supplies no author language; lang="" prevents inheriting the UI locale.
export function PublicGuideContent({guide,locale='en'}:{guide:PublicGuide;locale?:'en'|'zh-HK'}) {
 const source=describeGuideSource(guide),t=(en:string,zh:string)=>locale==='zh-HK'?zh:en,unknown=t('Not recorded','未記錄');
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:guideStructuredData(guide)}}/><article className="k-page" lang=""><h1>{guide.title}</h1>
  <aside className="k-card" lang={locale} aria-label={t('Guide source','攻略來源')}>
   <h2>{t('Guide source','攻略來源')}</h2>
   <p>{source.kind==='itinerary'?t('Structured itinerary','結構化行程'):t('Reading summary — no structured itinerary','閱讀摘要 — 未提供結構化行程')}</p>
   <dl><dt>{t('Author','作者')}</dt><dd>{source.authorName??unknown}</dd>
    <dt>{t('Published version','發布版本')}</dt><dd>{source.version===null?unknown:`v${source.version}`}</dd>
    <dt>{t('Published at','發布時間')}</dt><dd>{source.publishedAt?<time dateTime={source.publishedAt}>{source.publishedAt}</time>:unknown}</dd>
    {source.kind==='itinerary'&&<><dt>{t('Days / stops','日數／站點')}</dt><dd>{source.dayCount} / {source.stopCount}</dd></>}
    <dt>{t('Original content language','內容原文語言')}</dt><dd>{unknown}</dd>
    <dt>{t('Place verification date','地點查核日期')}</dt><dd>{unknown}</dd>
   </dl>
   <p>{t('Publication time is not a verification date. Check current place facts and their sources before travel. Author content is not automatically translated.','發布時間不等於查核日期。出發前請核對最新地點資料及來源。作者內容不會自動翻譯。')}</p>
  </aside>
  {guide.publication?.coverUrl&&<figure style={{position:'relative',aspectRatio:'16 / 9',margin:'1rem 0'}}><Image src={guide.publication.coverUrl} alt={guide.title} fill sizes="(max-width: 768px) 100vw, 768px" style={{objectFit:'cover'}}/></figure>}
  {guide.kind==='summary'?<p>{guide.summary}</p>:<>
  {guide.days.map(day=><section key={day.id}><h2>{day.title}</h2>{day.stops.map(stop=><section key={stop.id}><h3>{stop.title}</h3><p>{stop.description}</p></section>)}</section>)}
 </>}</article></>;
}
