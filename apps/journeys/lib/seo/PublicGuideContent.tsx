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
 </>}</article>{showActions&&<PublicGuideActions guideId={guide.id} locale={locale}/>}</>;
}
