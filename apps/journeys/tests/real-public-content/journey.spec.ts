import{test,expect,type Browser,type Page}from '@playwright/test';
import{openPublicFixture}from './fixture.mjs';

let fixture:Awaited<ReturnType<typeof openPublicFixture>>;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{fixture=await openPublicFixture()});
test.afterAll(async()=>{await fixture?.cleanup()});

async function signIn(page:Page,actor:{email:string;password:string},next:string){
 await page.goto(`/en/sign-in?next=${encodeURIComponent(next)}`);
 await page.getByLabel('Email',{exact:true}).fill(actor.email);
 await page.getByLabel('Password',{exact:true}).fill(actor.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL('**'+next);
}

async function journey(browser:Browser,locale:string,viewport:{width:number;height:number},javaScriptEnabled:boolean){
 const context=await browser.newContext({baseURL:process.env.KINNSO_PUBLIC_IT_APP_ORIGIN,viewport,javaScriptEnabled,serviceWorkers:'block'});
 const external:string[]=[];
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin===process.env.KINNSO_PUBLIC_IT_APP_ORIGIN||url.origin===process.env.KINNSO_PUBLIC_IT_API_ORIGIN)return route.continue();
  external.push(url.origin);return route.abort();
 });
 const page=await context.newPage();
 try{
  const prefix=encodeURIComponent('Synthetic Public');
  await page.goto(`/${locale}/destinations`);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await expect(page.locator(`a[href="/${locale}/destinations/tokyo"]`)).toBeVisible();
  await page.goto(`/${locale}/destinations/tokyo`);
  await expect(page.getByRole('heading',{name:'Tokyo',exact:true})).toBeVisible();
  for(const href of [`/${locale}/g/${fixture.ids.guides.published}`,`/${locale}/experiences/${fixture.ids.experienceSlug}`,`/${locale}/articles/destinations/${fixture.ids.articleSlug}`,`/${locale}/sessions/${fixture.ids.sessionSlug}`])await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
  await page.goto(`/${locale}/g/${fixture.ids.guides.published}`);
  await expect(page.getByRole('heading',{name:'Synthetic Public Guide',exact:true})).toBeVisible();
  await expect(page.locator(`a[href="/${locale}/c/${fixture.creator.handle}"]`)).toBeVisible();
  await page.goto(`/${locale}/experiences/${fixture.ids.experienceSlug}`);
  await expect(page.getByRole('heading',{name:'Synthetic Public Experience',exact:true})).toBeVisible();
  await expect(page.locator(`a[href="/${locale}/m/${fixture.merchant.slug}"]`)).toHaveCount(2);
  await page.goto(`/${locale}/m/${fixture.merchant.slug}`);
  await expect(page.getByRole('heading',{name:'Synthetic Public Host',exact:true})).toBeVisible();
  await page.goto(`/${locale}/sessions/${fixture.ids.sessionSlug}`);
  await expect(page.getByRole('heading',{name:'Synthetic Public Session',exact:true})).toBeVisible();
  await page.goto(`/${locale}/c/${fixture.creator.handle}`);
  await expect(page.getByRole('heading',{name:fixture.creator.display_name,exact:true})).toBeVisible();
  await page.goto(`/${locale}/articles/destinations/${fixture.ids.articleSlug}`);
  await expect(page.getByRole('heading',{name:/Synthetic Public Article/,exact:false})).toBeVisible();
  await expect(page.locator(`a[href="/${locale}/c/${fixture.ids.articleAuthor}"]`)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await page.locator('a[href*="remix-kinnso-web"]').count()).toBe(0);
  expect(external).toEqual([]);
 }finally{await context.close()}
}

for(const locale of ['en','zh-HK','zh-tw','zh-cn','ja','ko','th']){
 test(`real isolated target PUBLIC_CONTENT_8 ${locale}`,async({browser})=>{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}])for(const javaScriptEnabled of [false,true])await journey(browser,locale,viewport,javaScriptEnabled);
 });
}

test('real isolated target PUBLIC_CONTENT_8 withdrawal, suspension and bookmark isolation',async({browser})=>{
 const actors=fixture.actors as Record<'A'|'B',{id:string;email:string;password:string}>;
 const guidePath=`/en/g/${fixture.ids.guides.published}`;
 const contextA=await browser.newContext({baseURL:process.env.KINNSO_PUBLIC_IT_APP_ORIGIN});
 const contextB=await browser.newContext({baseURL:process.env.KINNSO_PUBLIC_IT_APP_ORIGIN});
 try{
  const pageA=await contextA.newPage(),pageB=await contextB.newPage();
  await signIn(pageA,actors.A,guidePath);
  try{
   await expect(pageA.getByRole('button',{name:'Bookmark guide',exact:true})).toBeVisible({timeout:20000});
  }catch(error){
   const state=await pageA.locator('body').innerText();
   await test.info().attach('bookmark-state-before-save',{body:state,contentType:'text/plain'});
   console.log(state);
   throw error;
  }
  await pageA.getByRole('button',{name:'Bookmark guide',exact:true}).click();
  await expect(pageA.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible();
  await pageA.reload();await expect(pageA.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible({timeout:20000});
  await signIn(pageB,actors.B,guidePath);
  await expect(pageB.getByRole('button',{name:'Bookmark guide',exact:true})).toBeVisible({timeout:20000});
  const ownerBookmarks=await fixture.admin.from('guide_saves').select('guide_id,traveler_user_id').eq('guide_id',fixture.ids.guides.published);
  expect(ownerBookmarks.error).toBeNull();
  expect(ownerBookmarks.data).toEqual([{guide_id:fixture.ids.guides.published,traveler_user_id:actors.A.id}]);
 }finally{await contextA.close();await contextB.close()}
 const updates=await Promise.all([
  fixture.admin.from('guides').update({status:'draft'}).eq('id',fixture.ids.guides.published),
  fixture.admin.from('experiences').update({status:'paused'}).eq('id',fixture.ids.experiences.published),
  fixture.admin.from('merchant_profiles').update({status:'suspended'}).eq('id',fixture.merchant.id),
  fixture.admin.from('creators').update({status:'suspended'}).eq('id',fixture.creator.id),
  fixture.admin.from('community_sessions').update({status:'cancelled'}).eq('id',fixture.ids.sessions.published),
  fixture.admin.from('articles').update({end_at:new Date(Date.now()-60_000).toISOString()}).eq('id',fixture.ids.article),
 ]);
 expect(updates.every(result=>result.error===null)).toBe(true);
 const request=await browser.newContext({baseURL:process.env.KINNSO_PUBLIC_IT_APP_ORIGIN});
 try{
  const page=await request.newPage();
  for(const path of [guidePath,`/en/experiences/${fixture.ids.experienceSlug}`,`/en/m/${fixture.merchant.slug}`,`/en/c/${fixture.creator.handle}`,`/en/sessions/${fixture.ids.sessionSlug}`,`/en/articles/destinations/${fixture.ids.articleSlug}`]){
   const response=await page.goto(path);
   expect(response?.status()).toBe(404);
   expect(await response?.text()).not.toContain('Must stay hidden');
  }
 }finally{await request.close()}
});
