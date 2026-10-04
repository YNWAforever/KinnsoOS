import Link from 'next/link';
import type {PublicCreator} from './public-creator';

export function PublicCreatorContent({creator,locale}:{creator:PublicCreator;locale:'en'|'zh-HK'}) {
 const en=locale==='en';
 const original=`https://remix-kinnso-web.vercel.app/${en?'en':'zh-hk'}/c/${creator.handle}`;
 return <article className="k-page" aria-label={en?'Public creator profile':'創作者公開檔案'}>
  <h1>{creator.name}</h1>
  {creator.bio&&<p style={{whiteSpace:'pre-wrap'}}>{creator.bio}</p>}
  <h2>{en?'Published guides':'已發布攻略'}</h2>
  {creator.guides.length?<ul>{creator.guides.map(guide=><li key={guide.id}><Link href={`/${locale}/g/${guide.id}`}>{guide.title}</Link></li>)}</ul>:<p>{en?'No published guides yet.':'尚未有已發布攻略。'}</p>}
  <a href={original}>{creator.hasMore?(en?'View more on original profile':'在原站檔案查看更多'):(en?'View original profile':'查看原站檔案')}</a>
 </article>;
}
