import {backendTarget,type Environment} from '../contracts/capabilities.ts';
import {publicLanguage,authoredLanguage} from './public-language.ts';
import {articleRows} from './public-article.ts';
export const articleCategories={destinations:'destination',dining:'dining',shopping:'shopping'} as const;
export type ArticleCategory=keyof typeof articleCategories;
export type ArticleListQuery={page:number;q:string|null;region:string|null;tag:string|null};
export function articleListQuery(params:URLSearchParams):ArticleListQuery{
 for(const key of ['page','q','region','tag'])if(params.getAll(key).length>1)throw Error('article_query');
 const value=params.get('page')??'1';if(!/^[1-9][0-9]{0,4}$/.test(value)||Number(value)>10000)throw Error('article_query');
 const filter=(key:string,max:number)=>{const value=params.get(key);if(value!==null&&(value.length>max||/[\x00-\x1f\x7f]/.test(value)))throw Error('article_query');return value?.trim()||null;};
 return{page:Number(value),q:filter('q',200),region:filter('region',120),tag:filter('tag',120)};
}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('article_schema');return value as Record<string,unknown>;}
function text(value:unknown,max=20000):string{if(typeof value!=='string'||value.length>max)throw Error('article_schema');return value;}
function count(value:unknown):number{const number=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;if(typeof number!=='number'||!Number.isSafeInteger(number)||number<0)throw Error('article_schema');return number;}
function image(value:unknown):string|null{if(!Array.isArray(value)||value.length>100)throw Error('article_schema');for(const item of value){try{const url=new URL(text(item,2048));if(url.origin==='https://cdn.kinnso.ai'&&!url.username&&!url.password&&!url.search&&!url.hash)return url.href;}catch{}}return null;}
/** Anonymous invoker RPC retains publication RLS and the legacy search/filter semantics. */
export async function readArticleListing(locale:string,category:string,query:ArticleListQuery,env:Environment,transport:typeof fetch=fetch,perPage=12){
 const language=publicLanguage(locale);if(!language||!Object.hasOwn(articleCategories,category))return null;
 if(![6,12].includes(perPage))throw Error('article_query');
 const checked=articleListQuery(new URLSearchParams({page:String(query.page),q:query.q??'',region:query.region??'',tag:query.tag??''}));
 const target=backendTarget(env);if(!target)throw Error('article_unconfigured');
 const rows=await articleRows(new URL('/rest/v1/rpc/search_articles',target.origin),target.key,transport,{p_locale:authoredLanguage(language),p_category:articleCategories[category as ArticleCategory],p_q:checked.q,p_region:checked.region,p_tag:checked.tag,p_limit:perPage,p_offset:(checked.page-1)*perPage});
 if(rows.length>perPage)throw Error('article_schema');
 const total=rows.length?count(record(rows[0]).total_count):0,seen=new Set<string>();
 const items=rows.map(value=>{const row=record(value),slug=text(row.url,200),title=row.title===null?'':text(row.title),summary=row.summary===null?'':text(row.summary),publishedAt=text(row.published_at);
  if(!/^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.-]*$/u.test(slug)||row.category!==articleCategories[category as ArticleCategory]||count(row.total_count)!==total||seen.has(slug)||!Number.isFinite(Date.parse(publishedAt))||Date.parse(publishedAt)>Date.now())throw Error('article_schema');seen.add(slug);
  // The invoker RPC counts incomplete translations too. Preserve its page positions
  // without claiming an untitled row has a readable detail page.
  return{slug,title:title.trim()?title:slug,canOpen:!!title.trim(),summary,publishedAt,image:image(row.thumbnails),href:`/${language}/articles/${category}/${encodeURIComponent(slug)}`};
 });
 if(items.length&&total<(checked.page-1)*perPage+items.length)throw Error('article_schema');
 return{items,total,page:checked.page,perPage,query:checked};
}
export type ArticleListing=NonNullable<Awaited<ReturnType<typeof readArticleListing>>>;
