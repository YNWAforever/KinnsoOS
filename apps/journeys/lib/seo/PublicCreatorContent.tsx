import Link from 'next/link';
import type {PublicCreator} from './public-creator';

export function PublicCreatorContent({creator,locale}:{creator:PublicCreator;locale:'en'|'zh-HK'}) {
 const en=locale==='en';
 return <article className="k-page" aria-label={en?'Public creator profile':'創作者公開檔案'}>
  <h1 lang="">{creator.name}</h1>
  {creator.bio&&<p lang="" style={{whiteSpace:'pre-wrap'}}>{creator.bio}</p>}
  <h2>{en?'Published guides':'已發布攻略'}</h2>
  {creator.guides.length?<ul>{creator.guides.map(guide=><li key={guide.id}><Link lang="" href={`/${locale}/g/${guide.id}`}>{guide.title}</Link></li>)}</ul>:<p>{en?'No published guides yet.':'尚未有已發布攻略。'}</p>}
  <Link href={`/${locale}/explore`}>{en?'Explore published guides':'探索已發布攻略'}</Link>
 </article>;
}
