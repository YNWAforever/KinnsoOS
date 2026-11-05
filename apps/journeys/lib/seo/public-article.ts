import sanitizeHtml from 'sanitize-html';
import {authoredLanguage} from './public-language.ts';
import {backendTarget,type Environment} from '../contracts/capabilities.ts';
import {readPublicRows} from './public-http.ts';
export type ArticleBlock={id:string;type:string;title:string;subtitle:string;html:string;image:string|null;fields:{label:string;href:string|null}[];images:{url:string;description:string}[]};
export type PublicArticle={id:string;slug:string;category:string;locale:string;title:string;summary:string;metadataTitle:string;description:string;author:string|null;publishedAt:string;updatedAt:string|null;coverImage:string|null;shareImage:string|null;blocks:ArticleBlock[];faqs:{question:string;answer:string}[]};
const categories:Record<string,string>={destinations:'destination',dining:'dining',shopping:'shopping'};
const slugPattern=/^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.-]{0,199}$/u;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('article_schema');return value as Record<string,unknown>;}
function text(value:unknown):string{if(value==null)return '';if(typeof value!=='string'||value.length>200000)throw new Error('article_schema');return value;}
function date(value:unknown):string|null{if(value===null)return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('article_schema');return value;}
function link(value:unknown,image=false):string|null {
 const source=text(value);if(!source)return null;
 try{const url=new URL(source);if(url.username||url.password||!(image?url.origin==='https://cdn.kinnso.ai'&&!url.search&&!url.hash:['https:','http:','mailto:','tel:'].includes(url.protocol)))return null;return url.href;}catch{return null;}
}
// Reuse the mature apps/web/lib/articles/sanitize.ts allowlist, with CDN-only images.
function cleanHtml(value:unknown):string {
 return sanitizeHtml(text(value),{
  allowedTags:['p','br','span','div','strong','b','em','i','u','s','ul','ol','li','blockquote','hr','h2','h3','h4','h5','h6','a','img','figure','figcaption','table','thead','tbody','tr','th','td'],
  allowedAttributes:{a:['href','target','rel'],img:['src','alt','title','width','height','loading']},allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false,
  transformTags:{a:sanitizeHtml.simpleTransform('a',{rel:'noopener noreferrer nofollow'},true),img:(_tag,attributes)=>({tagName:'img',attribs:{...attributes,src:link(attributes.src,true)??'',loading:'lazy'}})},
  exclusiveFilter:frame=>frame.tag==='img'&&!frame.attribs.src,
 });
}
/** Same seven authored block kinds as the mature renderer. Project only fields that render. */
export function articleBlocks(content:unknown):ArticleBlock[] {
 let value=content;if(typeof value==='string'){if(value.length>1000000)throw new Error('article_schema');try{value=JSON.parse(value);}catch{throw new Error('article_schema');}}
 if(value===null)return [];if(!Array.isArray(value)||value.length>1000||JSON.stringify(value).length>1000000)throw new Error('article_schema');
 const result:ArticleBlock[]=[];
 for(const item of value){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;const r=record(item);
  if(typeof r.id!=='string'||typeof r.type!=='string'||!['text','number-box','offer-box','info-box','map','detail-box','multiple-image'].includes(r.type))continue;
  const block:ArticleBlock={id:text(r.id),type:r.type,title:text(r.title),subtitle:text(r.subtitle),html:cleanHtml(r.content),image:link(r.image,true),fields:[],images:[]};
  if(r.type==='detail-box'){
   for(const name of ['time','price','phone']){const label=text(r[name]);if(label)block.fields.push({label,href:null});}
   for(const name of ['address','website']){if(r[name]==null)continue;const field=record(r[name]);const label=text(field.label);if(label)block.fields.push({label,href:link(field.link)});}
  }
  if(r.type==='multiple-image'){
   if(r.images!=null&&!Array.isArray(r.images))throw new Error('article_schema');const images=(r.images??[]) as unknown[];if(images.length>100)throw new Error('article_schema');
   for(const image of images){const r=record(image),url=link(r.original??r.thumbnail,true);if(url)block.images.push({url,description:text(r.desc)});}
  }
  result.push(block);
 }
 return result;
}
export async function articleRows(url:URL,key:string,transport:typeof fetch,requestBody?:Record<string,unknown>):Promise<unknown[]> {
 return readPublicRows(url,key,transport,requestBody,{unavailableCode:'article_unavailable',schemaCode:'article_schema'});
}
/** Anonymous RLS read of one published article and its exact authored translation. No session, raw source dump or fallback language. */
export async function readPublicArticle(category:string,slug:string,locale:string,env:Environment,transport:typeof fetch=fetch):Promise<PublicArticle|null> {
 // Next's page and metadata params may reach this boundary encoded or decoded.
 // Decode once, then apply the same identifier allowlist (including no slash or percent).
 if(typeof slug!=='string')return null;
 try{slug=decodeURIComponent(slug);}catch{return null;}
 const authoredLocale=authoredLanguage(locale);
 if(!Object.hasOwn(categories,category)||typeof slug!=='string'||!slugPattern.test(slug)||!authoredLocale)return null;
 const target=backendTarget(env);if(!target)throw new Error('article_unconfigured');const now=new Date().toISOString();
 const url=new URL('/rest/v1/articles',target.origin);
 url.search=new URLSearchParams({select:'id,url,category,thumbnails,published_at,edit_at,authors,article_translations!inner(locale,title,summary,meta_title,meta_description,og_image,content)',url:'eq.'+slug,category:'eq.'+categories[category],'article_translations.locale':'eq.'+authoredLocale,published_at:'lte.'+now,deleted_at:'is.null',or:'(end_at.is.null,end_at.gte.'+now+')',limit:'1'}).toString();
 const articles=await articleRows(url,target.key,transport);if(articles.length>1)throw new Error('article_schema');if(!articles.length)return null;
 const article=record(articles[0]);if(typeof article.id!=='string'||!uuidPattern.test(article.id)||article.url!==slug||article.category!==categories[category]||!Array.isArray(article.article_translations)||article.article_translations.length>1)throw new Error('article_schema');
 if(!article.article_translations.length)return null;const translation=record(article.article_translations[0]);if(translation.locale!==authoredLocale)return null;
 const title=text(translation.title);if(!title.trim())return null;const publishedAt=date(article.published_at);if(!publishedAt||Date.parse(publishedAt)>Date.parse(now))throw new Error('article_schema');
 const blocks=articleBlocks(translation.content),summary=text(translation.summary),updatedAt=date(article.edit_at);
 if(article.thumbnails!=null&&(!Array.isArray(article.thumbnails)||article.thumbnails.length>100))throw new Error('article_schema');
 const coverImage=((article.thumbnails??[]) as unknown[]).map(value=>link(value,true)).find(Boolean)??null;
 const shareImage=link(translation.og_image,true)??coverImage;
 if(!Array.isArray(article.authors)||article.authors.length>100||article.authors.some(author=>typeof author!=='string'))throw new Error('article_schema');
 let author:string|null=null;
 const first=article.authors[0];if(first){if(!slugPattern.test(first))throw new Error('article_schema');const url=new URL('/rest/v1/article_authors',target.origin);url.search=new URLSearchParams({select:'name',slug:'eq.'+first,locale:'eq.'+authoredLocale,is_active:'eq.true',limit:'1'}).toString();const authors=await articleRows(url,target.key,transport);if(authors.length>1)throw new Error('article_schema');if(authors.length)author=text(record(authors[0]).name)||null;}
 const faqUrl=new URL('/rest/v1/article_faqs',target.origin);faqUrl.search=new URLSearchParams({select:'question,answer',article_id:'eq.'+article.id,locale:'eq.'+authoredLocale,order:'weight.desc',limit:'51'}).toString();
 const faqs=await articleRows(faqUrl,target.key,transport);if(faqs.length>50)throw new Error('article_schema');
 return {id:article.id,slug,category,locale:authoredLocale,title,summary,metadataTitle:text(translation.meta_title).trim()||title,description:text(translation.meta_description).trim()||summary,author,publishedAt,updatedAt,coverImage,shareImage,blocks,faqs:faqs.map(value=>{const faq=record(value);return {question:text(faq.question),answer:text(faq.answer)};})};
}
