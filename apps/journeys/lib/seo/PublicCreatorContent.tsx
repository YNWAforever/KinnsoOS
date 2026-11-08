import Link from 'next/link';
import type {PublicCreator} from './public-creator';
import {publicLabels} from './public-labels.ts';

export function PublicCreatorContent({creator,locale}:{creator:PublicCreator;locale:string}) {
 const labels=publicLabels(locale);if(!labels)throw Error('unsupported_public_language');
 const page=creator.page??1,profile=`/${locale}/c/${creator.handle}`;
 return <article className="k-page" aria-label={labels.creators.profileLabel}>
  <h1 lang="">{creator.name}</h1>
  {creator.bio&&<p lang="" style={{whiteSpace:'pre-wrap'}}>{creator.bio}</p>}
  <h2>{labels.creators.guidesHeading}</h2>
  {creator.guides.length?<ul>{creator.guides.map(guide=><li key={guide.id}><Link className="public-content-link" lang="" href={`/${locale}/g/${guide.id}`}>{guide.title}</Link></li>)}</ul>:<p>{labels.creators.guidesEmpty}</p>}
  {(page>1||creator.hasMore)&&<nav aria-label={labels.creators.guidesHeading}>
   {page>1&&<Link className="public-content-link" href={`${profile}?page=${page-1}`}>{labels.creators.previous}</Link>}
   {creator.hasMore&&page<10000&&<Link className="public-content-link" href={`${profile}?page=${page+1}`}>{labels.creators.next}</Link>}
  </nav>}
  <Link className="public-content-link" href={`/${locale}/explore`}>{locale==='en'?'Explore published guides':locale==='zh-HK'?'探索已發布攻略':labels.creators.guidesHeading}</Link>
 </article>;
}
