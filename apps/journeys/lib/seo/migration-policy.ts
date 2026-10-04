import type { Metadata } from 'next';

// K25 launch approval must change code deliberately; deployment/env cannot enable indexing.
export const migrationRobots = () => ({ index: false, follow: false } as const);
export const PUBLIC_ORIGIN = 'https://www.kinnso.ai';
const locales = ['en','zh-hk','zh-tw','zh-cn','ja','ko','th'];
export function publicUrl(value: string): string {
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.origin !== PUBLIC_ORIGIN || url.username || url.password || url.search || url.hash ||
      !locales.includes(parts[0]) || !['g','c','articles','m','experiences','sessions','destinations'].includes(parts[1]) ||
      parts.length < 3 || parts.some(part=> /[\\\x00-\x20<>"']/.test(decodeURIComponent(part)))) throw new Error('Invalid public content URL');
  return url.href;
}
export type PublicContentMetadata = {
  id: string; kind: 'guide'|'creator'|'article'; title: string; description: string;
  canonicalUrl: string; locales: Record<string,string>;
  author?: string; publishedAt?: string; updatedAt?: string;
  image?: {url:string;width:number;height:number;alt:string};
};
export function contentMetadata(content: PublicContentMetadata): Metadata {
  if (!content.id?.trim() || !content.title?.trim() || typeof content.description !== 'string' ||
      !['guide','creator','article'].includes(content.kind)) throw new Error('Invalid public content metadata');
  const canonical = publicUrl(content.canonicalUrl);
  const languages: Record<string,string> = {};
  for (const [locale,value] of Object.entries(content.locales)) {
    if (!locales.includes(locale)) throw new Error('Invalid content locale');
    const url = publicUrl(value);
    if (new URL(url).pathname.split('/')[1] !== locale) throw new Error('Locale URL mismatch');
    languages[locale] = url;
  }
  if (!Object.values(languages).includes(canonical)) throw new Error('Canonical content locale missing');
  languages['x-default'] = languages.en ?? Object.values(languages)[0];
  for (const date of [content.publishedAt,content.updatedAt]) if (date && !Number.isFinite(Date.parse(date))) throw new Error('Invalid content date');
  const images = content.image ? [checkedImage(content.image)] : [];
  return {title:content.title,description:content.description,robots:migrationRobots(),alternates:{canonical,languages},
    openGraph:{title:content.title,description:content.description,url:canonical,type:content.kind==='creator'?'profile':'article',images,
      ...(content.kind==='creator'?{}:{publishedTime:content.publishedAt,modifiedTime:content.updatedAt,authors:content.author?[content.author]:undefined})},
    twitter:{card:images.length?'summary_large_image':'summary',title:content.title,description:content.description,images},
    authors:content.author?[{name:content.author}]:undefined};
}
function checkedImage(image: NonNullable<PublicContentMetadata['image']>) {
  const url = new URL(image.url);
  if (url.origin !== 'https://cdn.kinnso.ai' || url.username || url.password || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width<1 || image.height<1) throw new Error('Invalid content image');
  return {...image,url:url.href};
}
