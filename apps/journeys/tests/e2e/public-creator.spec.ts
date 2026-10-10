import {test,expect} from '@playwright/test';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();

test('real public creator SSR and hydration show bounded published guides; withdrawing the profile removes public content',async({browser,baseURL,request})=>{
 const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const handle='synthetic-public-'+randomUUID(),name='Authored public creator',bio='Public bio <script>unsafe()</script>\nAuthored second line',privateMarker='PRIVATE-'+randomUUID();
 let actorId='';const ok=async(p:PromiseLike<any>)=>{const r=await p;expect(r.error).toBeNull();return r.data;};
 try {
  actorId=(await ok(admin.auth.admin.createUser({email:handle+'@example.test',password:'Synthetic!'+randomUUID(),email_confirm:true}))).user.id;
  await ok(admin.from('creators').update({status:'active',display_name:name,handle,bio,public_profile:{niches:['Travel'],privateInput:privateMarker}}).eq('id',actorId));
  const guides=Array.from({length:8},(_,index)=>({id:randomUUID(),creator_id:actorId,creator_handle:handle,creator_name:name,city:'Kyoto',title:'Authored published guide '+index,summary:'Source summary '+index,slug:handle+'-'+index,status:'published',published_at:new Date(Date.UTC(2026,8,8-index)).toISOString()}));
  await ok(admin.from('guides').insert([...guides,{...guides[0],id:randomUUID(),slug:handle+'-draft',title:privateMarker,status:'draft',published_at:null}]));
  for(const javaScriptEnabled of [false,true]) {
   const context=await browser.newContext({javaScriptEnabled,baseURL});
   try {
    const page=await context.newPage();
    for(const locale of ['en','zh-HK']) {
     const response=await page.goto(`/${locale}/c/${handle}`);expect(response?.status()).toBe(200);
     await expect(page.locator('html')).toHaveAttribute('lang',locale);
     const profile=page.getByRole('article',{name:locale==='en'?'Public creator profile':'創作者公開檔案',exact:true});
     await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await expect(profile.locator('h1')).toHaveAttribute('lang','');
     await expect(profile.locator('p')).toHaveText(bio);await expect(profile.locator('p')).toHaveAttribute('lang','');
     await expect(profile.locator('h2')).toHaveText(locale==='en'?'Published guides':'已發布攻略');
     expect(await profile.locator('h2').evaluate(node=>node.closest('[lang]')?.getAttribute('lang'))).toBe(locale);
     const links=page.locator('article li a');await expect(links).toHaveCount(6);
     for(let index=0;index<6;index++){await expect(links.nth(index)).toHaveText(guides[index].title);await expect(links.nth(index)).toHaveAttribute('lang','');await expect(links.nth(index)).toHaveAttribute('href',`/${locale}/g/${guides[index].id}`);}
     const original=`https://remix-kinnso-web.vercel.app/${locale==='en'?'en':'zh-hk'}/c/${handle}`;
     await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',original);
     await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content','profile');
     await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content',bio);
     await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
     await expect(page.locator('link[hreflang]')).toHaveCount(0);await expect(page.locator('article > a')).toHaveAttribute('href',original);
     await expect(page.locator('article script')).toHaveCount(0);expect(await page.content()).not.toContain(privateMarker);expect(await page.content()).not.toContain('Authored published guide 6');
    }
    await page.locator('article li a').first().click();await expect(page.getByRole('heading',{name:guides[0].title,exact:true})).toBeVisible();
   } finally {await context.close();}
  }
  await ok(admin.from('creators').update({public_profile:null}).eq('id',actorId));
  const hidden=await request.get('/en/c/'+handle),hiddenHtml=await hidden.text();
  expect(hiddenHtml).not.toContain(name);expect(hiddenHtml).not.toContain('Source summary');expect(hiddenHtml).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
  const missing=await request.get('/en/c/synthetic-absent-'+randomUUID());expect(await missing.text()).not.toContain(name);
  await ok(admin.from('creators').update({public_profile:{niches:['Travel']},status:'suspended'}).eq('id',actorId));
  const suspended=await request.get('/zh-HK/c/'+handle);expect(await suspended.text()).not.toContain(name);
 } finally {if(actorId)await ok(admin.auth.admin.deleteUser(actorId));}
});
