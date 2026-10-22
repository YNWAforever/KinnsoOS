import type {PublicGuide} from '../seo/public-guide';
export type GuideSourceSummary={kind:'summary'|'itinerary';authorName:string|null;version:number|null;publishedAt:string|null;dayCount:number|null;stopCount:number|null};
/** Projection only. Publication is not verification and UI locale is not author locale. */
export function describeGuideSource(guide:PublicGuide):GuideSourceSummary {
 const structured=guide.kind==='itinerary';
 const author=structured?guide.creator.name:guide.publication?.author;
 return {kind:guide.kind,authorName:author?.trim()?author:null,
  version:structured?guide.version:null,publishedAt:structured?guide.publishedAt:guide.publication?.publishedAt??null,
  dayCount:structured?guide.days.length:null,stopCount:structured?guide.days.reduce((count,day)=>count+day.stops.length,0):null};
}
