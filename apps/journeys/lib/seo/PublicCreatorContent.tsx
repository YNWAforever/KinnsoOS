import Link from 'next/link';
import type {PublicCreator} from './public-creator';

export function PublicCreatorContent({creator,locale}:{creator:PublicCreator;locale:'en'|'zh-HK'}) {
 const en=locale==='en';
 const page=creator.page??1,profile=`/${locale}/c/${creator.handle}`;
 return <article className="k-page" aria-label={en?'Public creator profile':'創作者公開檔案'}>
  <h1 lang="">{creator.name}</h1>
  {creator.bio&&<p lang="" style={{whiteSpace:'pre-wrap'}}>{creator.bio}</p>}
  <h2>{en?'Published guides':'已發布攻略'}</h2>
  {creator.guides.length?<ul>{creator.guides.map(guide=><li key={guide.id}><Link lang="" href={`/${locale}/g/${guide.id}`}>{guide.title}</Link></li>)}</ul>:<p>{en?'No published guides yet.':'尚未有已發布攻略。'}</p>}
  {(page>1||creator.hasMore)&&<nav aria-label={en?'Published guide pages':'已發布攻略分頁'}>
   {page>1&&<Link href={`${profile}?page=${page-1}`}>{en?'Previous':'上一頁'}</Link>}
   {creator.hasMore&&page<10000&&<Link href={`${profile}?page=${page+1}`}>{en?'Next':'下一頁'}</Link>}
  </nav>}
 </article>;
}
