import test from 'node:test';import assert from 'node:assert/strict';
import {readPublicArticle} from '../lib/seo/public-article.ts';
import {articlePageMetadata} from '../lib/seo/article-presentation.ts';
const env={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const id='11111111-1111-4111-8111-111111111111';
for(const locale of ['en','zh-HK','zh-tw','zh-cn','ja','ko','th'])test('published article preserves exact authored language: '+locale,async()=>{
 const authored=locale==='zh-HK'?'zh-hk':locale;let calls=0;
 const value=await readPublicArticle('destinations','authored',locale,env,async(url,options)=>{calls++;assert.equal(options.headers.Authorization,undefined);const u=new URL(url);
 if(u.pathname==='/rest/v1/articles'){assert.equal(u.searchParams.get('article_translations.locale'),'eq.'+authored);return Response.json([{id,url:'authored',category:'destination',thumbnails:[],published_at:'2026-01-01T00:00:00Z',edit_at:null,authors:[],article_translations:[{locale:authored,title:'Original '+authored,summary:'Summary',content:[],meta_title:null,meta_description:null,og_image:null}]}]);}
 assert.equal(u.searchParams.get('locale'),'eq.'+authored);return Response.json([]);
 });assert.equal(value?.locale,authored);assert.equal(value?.title,'Original '+authored);assert.equal(calls,2);assert.equal(articlePageMetadata(value).alternates.canonical,`https://kinnso-os.vercel.app/${locale}/articles/destinations/authored`);
});
test('unrecognized language makes no request and missing authored translation stays missing',async()=>{let calls=0;assert.equal(await readPublicArticle('destinations','authored','fr',env,async()=>{calls++;return Response.json([])}),null);assert.equal(calls,0);assert.equal(await readPublicArticle('destinations','authored','ja',env,async()=>Response.json([])),null);});
test('encoded public slugs resolve once, while separators and double encoding remain invalid',async()=>{
 const slug='เที่ยว';const result=await readPublicArticle('destinations',encodeURIComponent(slug),'th',env,async url=>{
  const u=new URL(url);if(u.pathname!=='/rest/v1/articles')return Response.json([]);assert.equal(u.searchParams.get('url'),'eq.'+slug);
  return Response.json([{id,url:slug,category:'destination',thumbnails:[],published_at:'2026-01-01T00:00:00Z',edit_at:null,authors:[],article_translations:[{locale:'th',title:'Authored Thai title',summary:'Summary',content:[],meta_title:null,meta_description:null,og_image:null}]}]);
 });assert.equal(result?.slug,slug);
 for(const input of ['%2fprivate','%252fprivate','%2e%2e','%ZZ'])assert.equal(await readPublicArticle('destinations',input,'th',env,async()=>{throw Error('must not fetch')}),null);
});
