import type {PublicGuide} from './public-guide';
import Image from 'next/image';
import {guideStructuredData} from './guide-publication';
// Renders during SSR and hydration. React escapes authored text; every field is a public projection.
export function PublicGuideContent({guide}:{guide:PublicGuide}) {
 const author=guide.kind==='itinerary'?guide.creator.name:guide.publication?.author;
 const date=guide.kind==='itinerary'?guide.publishedAt:guide.publication?.publishedAt;
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:guideStructuredData(guide)}}/><article className="k-page"><h1>{guide.title}</h1>
  {author&&<p>{author}</p>}{date&&<time dateTime={date}>{date.slice(0,10)}</time>}
  {guide.publication?.coverUrl&&<figure style={{position:'relative',aspectRatio:'16 / 9',margin:'1rem 0'}}><Image src={guide.publication.coverUrl} alt={guide.title} fill sizes="(max-width: 768px) 100vw, 768px" style={{objectFit:'cover'}}/></figure>}
  {guide.kind==='summary'?<p>{guide.summary}</p>:<>
  {guide.days.map(day=><section key={day.id}><h2>{day.title}</h2>{day.stops.map(stop=><section key={stop.id}><h3>{stop.title}</h3><p>{stop.description}</p></section>)}</section>)}
 </>}</article></>;
}
