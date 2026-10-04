import {test,expect} from '@playwright/test';
import {loadEnvFile} from 'node:process';
import {randomUUID,randomInt} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();
test('published article has real rich content without JS, survives hydration, and hides expired/deleted/missing translations',async({browser,baseURL,request})=>{
 const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!),id=randomUUID(),slug='synthetic-article-'+randomUUID(),author='synthetic-author-'+randomUUID();
 const title='Authored local article',body='Real durable rich article body',marker='PRIVATE-'+randomUUID();
 const ok=async(p:PromiseLike<any>)=>{const r=await p;expect(r.error).toBeNull();return r.data;};
 try {
  await ok(admin.from('articles').insert({id,legacy_post_id:-randomInt(1,2147483647),url:slug,slug,category:'destination',thumbnails:['https://cdn.kinnso.ai/synthetic-cover.jpg'],published_at:'2026-01-02T00:00:00Z',edit_at:'2026-01-03T00:00:00Z',authors:[author],source:marker}));
  await ok(admin.from('article_translations').insert(['en','zh-hk'].map(locale=>({article_id:id,locale,title:title+' '+locale,summary:'Real authored summary',content:[{id:'authored',type:'text',title:'Real section',content:`<p>${body} <strong>important</strong><script>${marker}</script><a href="javascript:bad()">unsafe link</a></p>`,privateInput:marker},{id:'numbered',type:'number-box',title:'Numbered section',content:'<ul><li>Authored list item</li></ul>'},{id:'detail',type:'detail-box',title:'Real details',time:'10:00',website:{label:'Original information',link:'https://example.com'}}]}))));
  await ok(admin.from('article_authors').insert(['en','zh-hk'].map(locale=>({slug:author,locale,name:'Real author',bio:marker}))));
  await ok(admin.from('article_faqs').insert({article_id:id,locale:'en',question:'Authored question',answer:'Authored answer',weight:1}));
  for(const javaScriptEnabled of [false,true]) {
   const context=await browser.newContext({javaScriptEnabled,baseURL});
   await context.route('https://cdn.kinnso.ai/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9Z1sAAAAASUVORK5CYII=','base64')}));
   try {const page=await context.newPage();for(const locale of ['en','zh-HK']) {
    const response=await page.goto(`/${locale}/articles/destinations/${slug}`);expect(response?.status()).toBe(200);
    const authored=locale==='en'?'en':'zh-hk';await expect(page.getByRole('heading',{level:1,name:title+' '+authored,exact:true})).toBeVisible();
    await expect(page.getByText(body,{exact:false})).toBeVisible();await expect(page.locator('article strong')).toHaveText('important');await expect(page.getByText('Authored list item',{exact:true})).toBeVisible();
    await expect(page.locator('article')).toHaveAttribute('lang',locale==='en'?'en':'zh-Hant-HK');
    await expect(page.locator('article script')).toHaveCount(0);await expect(page.locator('article a[href^="javascript:"]')).toHaveCount(0);expect(await page.content()).not.toContain(marker);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',`https://remix-kinnso-web.vercel.app/${authored}/articles/destinations/${slug}`);
    await expect(page.locator('link[hreflang]')).toHaveCount(0);await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
    await expect(page.locator('article img')).toHaveAttribute('src','https://cdn.kinnso.ai/synthetic-cover.jpg');await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content','https://cdn.kinnso.ai/synthetic-cover.jpg');await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');
    const data=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent()??'{}');expect(data.headline).toBe(title+' '+authored);expect(data.inLanguage).toBe(authored);expect(data.creditText).toBe('Real author');expect(data.dateModified).toBe('2026-01-03T00:00:00+00:00');
   }}finally{await context.close();}
  }
  const hidden=async(locale='en')=>{const response=await request.get(`/${locale}/articles/destinations/${slug}`);const html=await response.text();expect(html).not.toContain(body);expect(html).toContain('NEXT_HTTP_ERROR_FALLBACK;404');};
  await ok(admin.from('article_translations').delete().eq('article_id',id).eq('locale','zh-hk'));await hidden('zh-HK');
  await ok(admin.from('articles').update({published_at:'2099-01-01T00:00:00Z'}).eq('id',id));await hidden();
  await ok(admin.from('articles').update({published_at:'2026-01-02T00:00:00Z',end_at:'2026-01-01T00:00:00Z'}).eq('id',id));await hidden();
  await ok(admin.from('articles').update({end_at:null,deleted_at:new Date().toISOString()}).eq('id',id));await hidden();
 }finally{await ok(admin.from('articles').delete().eq('id',id));await ok(admin.from('article_authors').delete().eq('slug',author));}
});
