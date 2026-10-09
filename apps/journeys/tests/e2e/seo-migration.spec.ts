import {test,expect} from '@playwright/test';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();
test('migration robots and sitemap keep launch closed',async({request})=>{
 const robots=await request.get('/robots.txt');expect(robots.status()).toBe(200);expect(await robots.text()).toContain('Disallow: /');
 const sitemap=await request.get('/sitemap.xml');expect(sitemap.status()).toBe(200);expect(await sitemap.text()).not.toContain('<loc>');
 const html=await request.get('/en');expect(html.status()).toBe(200);expect(await html.text()).toMatch(/content="noindex, nofollow"/);
});
test('configured callback alias fails safely without a code and cannot redirect off site',async({request,baseURL})=>{
 const response=await request.get('/callback?next=https%3A%2F%2Fattacker.example%2F',{maxRedirects:0});
 expect(response.status()).toBe(307);expect(new URL(response.headers().location).origin).toBe(new URL(baseURL!).origin);
 expect(response.headers().location).toContain('/en/sign-in?error=failed');expect(response.headers()['cache-control']).toContain('no-store');
});
test('no JavaScript private route remains noindex',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false,baseURL});
 const page=await context.newPage();await page.goto('/en/sign-in');
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
 await context.close();
});

test('published summary with a legacy database UUID survives API, SSR and hydration while owner drafts remain absent',async({browser,baseURL,request})=>{
 const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const generated=randomUUID(),id=generated.slice(0,14)+'9'+generated.slice(15,19)+'5'+generated.slice(20);
 let actorId='';const draft=randomUUID(),title='Synthetic published cover guide';
 const author='Public source author <script>unsafe()</script>',date='2026-09-01T10:00:00Z',cover='https://cdn.kinnso.ai/synthetic-publication.png';
 const ok=async(p:PromiseLike<any>)=>{const r=await p;expect(r.error).toBeNull();return r.data;};
 try {
  actorId=(await ok(admin.auth.admin.createUser({email:'synthetic-publication-'+randomUUID()+'@example.test',password:'Synthetic!'+randomUUID(),email_confirm:true}))).user.id;
  await ok(admin.from('creators').update({status:'active',display_name:'Creator account',bio:'Private profile marker '+draft}).eq('id',actorId));
  const base={creator_id:actorId,creator_handle:'synthetic',creator_name:author,city:'Kyoto',cover_url:cover,summary:'Public summary remains a summary'};
  await ok(admin.from('guides').insert([{...base,id,slug:'synthetic-'+id,title,status:'published',published_at:date},{...base,id:draft,slug:'synthetic-'+draft,title:'Private draft marker '+draft,status:'draft',published_at:null}]));
  const hidden=await request.get('/api/guides/'+draft);expect(hidden.status()).toBe(404);expect(await hidden.text()).not.toContain('Private draft marker');
  const api=await request.get('/api/guides/'+id);expect(api.status()).toBe(200);const projected=(await api.json()).data;
  expect(projected.kind).toBe('summary');expect(projected).not.toHaveProperty('days');expect(projected.publication.author).toBe(author);expect(projected.publication.coverUrl).toBe(cover);
  for(const javaScriptEnabled of [false,true])for(const locale of ['en','zh-HK']) {
   const context=await browser.newContext({javaScriptEnabled,baseURL});
   try {
    // Deterministic synthetic pixels verify image wiring/layout only, not production CDN parity.
    await context.route('**/_next/image?*',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfWQAAAAASUVORK5CYII=','base64')}));
    const page=await context.newPage();const refreshed=javaScriptEnabled?page.waitForResponse(r=>r.url().endsWith('/api/guides/'+id)&&r.status()===200):null;
    const response=await page.goto('/'+locale+'/g/'+id);expect(response?.status()).toBe(200);if(refreshed)await refreshed;
    await expect(page.locator('article')).toHaveAttribute('lang','');await expect(page.locator('html')).toHaveAttribute('lang',locale);
    const languageNote=page.getByText(locale==='en'?'Original language: not provided.':'原文語言：來源未提供。',{exact:true});await expect(languageNote).toBeVisible();expect(await languageNote.evaluate(el=>el.closest('[lang]')?.getAttribute('lang'))).toBe(locale);
    await expect(page.locator('article').getByText(author,{exact:true})).toBeVisible();await expect(page.locator('article time')).toHaveAttribute('datetime',projected.publication.publishedAt);
    await expect(page.locator('meta[name="author"]')).toHaveAttribute('content',author);
    await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute('content',projected.publication.publishedAt);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content',cover);
    await expect(page.locator('article img')).toHaveAttribute('alt',title);await expect(page.locator('article figure')).toHaveCSS('aspect-ratio','16 / 9');
    await expect(page.locator('article script')).toHaveCount(0);await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
    const structured=page.locator('script[type="application/ld+json"]');await expect(structured).toHaveCount(1);
    const json=JSON.parse((await structured.textContent())!);expect(json).toEqual({'@context':'https://schema.org','@type':'CreativeWork',name:title,description:base.summary,creditText:author,datePublished:projected.publication.publishedAt,image:cover});
    expect(await structured.textContent()).not.toContain('<script>');expect(json).not.toHaveProperty('hasPart');
    await expect(page.getByRole('button',{name:'Apply published itinerary',exact:true})).toHaveCount(0);
    expect(await page.content()).not.toContain('Private profile marker');expect(await page.content()).not.toContain('Private draft marker');
   } finally {await context.close();}
  }
 } finally {if(actorId)await ok(admin.auth.admin.deleteUser(actorId));}
});
test('authored published guide renders without JavaScript; withdrawing versions removes structured adoption and preserves the published summary',async({browser,baseURL,request})=>{
 const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!),password='Synthetic!'+randomUUID();let actorId='';const id=randomUUID();
 const ok=async(p:PromiseLike<any>)=>{const r=await p;expect(r.error).toBeNull();return r.data;};
 try{
  const email='synthetic-seo-'+randomUUID()+'@example.test';actorId=(await ok(admin.auth.admin.createUser({email,password,email_confirm:true}))).user.id;
  await ok(admin.from('creators').update({status:'active',display_name:'Authored test creator'}).eq('id',actorId));
  const actor=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!);await ok(actor.auth.signInWithPassword({email,password}));
  const payload={title:'Published source title',city:'Kyoto',summary:'Authored source summary',content:{days:[{offset:0,title:'Authored source day',stops:[{title:'Authored source stop',description:'Published description <script>unsafe()</script>',placeId:null,startMinuteOfDay:600,durationMinutes:45}]}]}};
  await ok(actor.rpc('save_kinnso_guide_draft',{p_draft_id:id,p_expected_revision:0,p_request_id:randomUUID(),p_payload:payload}));
  await ok(actor.rpc('publish_kinnso_guide_draft',{p_draft_id:id,p_expected_revision:1,p_request_id:randomUUID()}));
  const context=await browser.newContext({javaScriptEnabled:false,baseURL});
  try{const page=await context.newPage();const response=await page.goto('/en/g/'+id);expect(response?.status()).toBe(200);await expect(page.locator('article')).toHaveAttribute('lang','');await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('heading',{name:payload.title,exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Authored source stop',exact:true})).toBeVisible();await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content',payload.title);await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);await expect(page.locator('article script')).toHaveCount(0);await expect(page.getByText('Published description <script>unsafe()</script>',{exact:true})).toBeVisible();
   const structured=page.locator('script[type="application/ld+json"]');await expect(structured).toHaveCount(1);const json=JSON.parse((await structured.textContent())!);
   expect(json.version).toBe(1);expect(json.name).toBe(payload.title);expect(json.creditText).toBe('Authored test creator');expect(json.hasPart).toEqual([{'@type':'CreativeWork',name:'Authored source day',position:1,hasPart:[{'@type':'CreativeWork',name:'Authored source stop',description:payload.content.days[0].stops[0].description,position:1}]}]);expect(await structured.textContent()).not.toContain('<script>');
  }finally{await context.close();}
  await ok(actor.rpc('withdraw_guide_versions',{p_guide_id:id}));
  const withdrawn=await request.get('/api/guides/'+id);expect(withdrawn.status()).toBe(200);
  const summary=(await withdrawn.json()).data;expect(summary.kind).toBe('summary');expect(summary.title).toBe(payload.title);expect(summary).not.toHaveProperty('days');
  const summaryContext=await browser.newContext({javaScriptEnabled:false,baseURL});
  try{const page=await summaryContext.newPage();await page.goto('/en/g/'+id);await expect(page.locator('article')).toHaveAttribute('lang','');await expect(page.getByRole('heading',{name:payload.title,exact:true})).toBeVisible();await expect(page.getByText(payload.summary,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Authored source stop',exact:true})).toHaveCount(0);await expect(page.getByText('This is a summary guide. It has no structured itinerary to apply.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Apply published itinerary',exact:true})).toHaveCount(0);
   const json=JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);expect(json.name).toBe(payload.title);expect(json.description).toBe(payload.summary);expect(json).not.toHaveProperty('hasPart');expect(json).not.toHaveProperty('version');
  }finally{await summaryContext.close();}
  // Missing content is rejected by the data API; a streamed Next page may carry its not-found state in HTML.
  const missing=await request.get('/api/guides/'+randomUUID());expect(missing.status()).toBe(404);expect((await missing.json()).code).toBe('NOT_FOUND');
 }finally{if(actorId)await ok(admin.auth.admin.deleteUser(actorId));}
});
