import type {PublicGuide} from './public-guide';
// Dedicated server component: React escapes content; no fixture, innerHTML or private source fields.
export function PublicGuideContent({guide}:{guide:PublicGuide}) {
 return <article className="k-page"><h1>{guide.title}</h1>{guide.kind==='summary'?<p>{guide.summary}</p>:<>
  <p>{guide.creator.name}</p><time dateTime={guide.publishedAt}>{guide.publishedAt.slice(0,10)}</time>
  {guide.days.map(day=><section key={day.id}><h2>{day.title}</h2>{day.stops.map(stop=><section key={stop.id}><h3>{stop.title}</h3><p>{stop.description}</p></section>)}</section>)}
 </>}</article>;
}
