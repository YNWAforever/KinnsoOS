import type {Metadata} from 'next';
import type {PublicArticle} from './public-article';
import {publicUrl} from './migration-policy.ts';
export function articleCanonical(article:PublicArticle):string {
 return publicUrl(`https://remix-kinnso-web.vercel.app/${article.locale}/articles/${article.category}/${encodeURIComponent(article.slug)}`);
}
export function articlePageMetadata(article:PublicArticle):Metadata {
 const canonical=articleCanonical(article);
 // Only one authored translation was read; a translated shell is not evidence of alternatives.
 return {title:article.metadataTitle,description:article.description,robots:{index:false,follow:false},alternates:{canonical},authors:article.author?[{name:article.author}]:undefined,
  openGraph:{type:'article',url:canonical,title:article.metadataTitle,description:article.description,publishedTime:article.publishedAt,modifiedTime:article.updatedAt??undefined,authors:article.author?[article.author]:undefined,images:article.shareImage?[{url:article.shareImage,alt:article.title}]:undefined},
  twitter:{card:article.shareImage?'summary_large_image':'summary',title:article.metadataTitle,description:article.description,images:article.shareImage?[article.shareImage]:undefined}};
}
export function articleStructuredData(article:PublicArticle):string {
 const data={'@context':'https://schema.org','@type':'Article',url:articleCanonical(article),headline:article.title,description:article.description,inLanguage:article.locale,datePublished:article.publishedAt,
  ...(article.updatedAt?{dateModified:article.updatedAt}:{}),...(article.author?{creditText:article.author}:{}),...(article.coverImage?{image:[article.coverImage]}:{}),
 };
 return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
}
