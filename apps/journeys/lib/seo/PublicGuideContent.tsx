import {describeGuideSource} from '../guides/source-summary';
import type {PublicGuide} from './public-guide';
import Image from 'next/image';
import {guideStructuredData} from './guide-publication';
import Link from 'next/link';
import {publicLabels} from './public-labels.ts';
import {PublicGuideActions} from './PublicGuideActions.tsx';
// Renders during SSR and hydration. React escapes authored text; every field is a public projection.
// The public contract supplies no author language; lang="" prevents inheriting the UI locale.
export function PublicGuideContent({guide,locale='en',showActions=true}:{guide:PublicGuide;locale?:string;showActions?:boolean}) {
 const labels=publicLabels(locale);if(!labels)throw Error('unsupported_public_language');
 const source=describeGuideSource(guide),unknown=labels.guides.notRecorded;
 const summaryActions=guide.kind==='summary'&&showActions&&['en','zh-HK'].includes(locale);
 const t=(en:string,zh:string)=>locale==='en'?en:zh;
 const authorHandle=guide.kind==='itinerary'?guide.creator.handle:guide.publication?.authorHandle??null;
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:guideStructuredData(guide)}}/><article className="k-page" lang=""><h1>{guide.title}</h1>
  <aside className="k-card" lang={locale} aria-label={labels.guides.sourceHeading}>
   <h2>{labels.guides.sourceHeading}</h2>
   <p>{source.kind==='itinerary'?labels.guides.structuredItinerary:labels.guides.readingSummary}</p>
   <dl><dt>{labels.guides.author}</dt><dd>{authorHandle?<Link className="public-content-link" lang="" href={`/${locale}/c/${encodeURIComponent(authorHandle)}`}>{source.authorName??unknown}</Link>:source.authorName??unknown}</dd>
    <dt>{labels.guides.publishedVersion}</dt><dd>{source.version===null?unknown:`v${source.version}`}</dd>
    <dt>{labels.guides.publishedAt}</dt><dd>{source.publishedAt?<time dateTime={source.publishedAt}>{source.publishedAt}</time>:unknown}</dd>
    {source.kind==='itinerary'&&<><dt>{labels.guides.daysStops}</dt><dd>{source.dayCount} / {source.stopCount}</dd></>}
    <dt>{labels.guides.originalLanguage}</dt><dd>{unknown}</dd>
    <dt>{labels.guides.verificationDate}</dt><dd>{unknown}</dd>
   </dl>
   <p>{labels.guides.notice}</p>
  </aside>
  {guide.publication?.coverUrl&&<figure style={{position:'relative',aspectRatio:'16 / 9',margin:'1rem 0'}}><Image src={guide.publication.coverUrl} alt={guide.title} fill sizes="(max-width: 768px) 100vw, 768px" style={{objectFit:'cover'}}/></figure>}
  {guide.kind==='summary'?<p>{guide.summary}</p>:<>
  {guide.days.map(day=><section key={day.id}><h2>{day.title}</h2>{day.stops.map(stop=><section key={stop.id}><h3>{stop.title}</h3><p>{stop.description}</p></section>)}</section>)}
 </>}</article>{summaryActions&&<section className="k-page" lang={locale}>
  <p>{t('Guide text is shown as published by its author.','攻略原文依作者發布內容顯示。')}</p>
  <p>{t('Original language: not provided.','原文語言：來源未提供。')}</p>
  <p>{t('Last updated: not provided.','最後更新：來源未提供。')}</p>
  <p>{t('Opening hours: not provided. Confirm before travelling.','營業時間：來源未提供，出發前請核實。')}</p>
  <p>{t('This is a summary guide. It has no structured itinerary to apply.','這是摘要攻略，未提供可套用的結構化行程。')}</p>
  <p>{t('Use this as inspiration, then add your own days and stops. Nothing is copied automatically.','把這份攻略作為靈感，再自行加入日期和站點；內容不會自動複製。')}</p>
  <Link className="k-btn primary" href={`/${locale}/trips`}>{t('Build your own itinerary','建立自己的行程')}</Link>
 </section>}{showActions&&<PublicGuideActions guideId={guide.id} locale={locale}/>}</>;
}
