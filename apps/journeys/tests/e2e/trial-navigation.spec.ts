import {test,expect} from '@playwright/test';

// No account fixture or database writes: exercise the actual server guard and browser links.
for(const locale of ['en','zh-HK','zh-hk']){
 const language=locale==='en'?'en':'zh-HK';
 test(`${locale}: private workspace entry stays on local sign-in with its return destination`,async({page,baseURL})=>{
  const external:string[]=[];
  page.on('request',request=>{if(new URL(request.url()).hostname==='remix-kinnso-web.vercel.app')external.push(request.url());});
  for(const path of ['studio','studio/guides/new','studio/missions/22222222-2222-4222-8222-222222222222','studio/offers','studio/receipts','merchant','merchants/dashboard/profile','ops','admin']){
   await page.goto(`/${locale}/${path}?tab=drafts&filter=new&filter=active`);
   const url=new URL(page.url());
   expect(url.origin).toBe(new URL(baseURL!).origin);
   expect(url.pathname).toBe(`/${language}/sign-in`);
   expect(url.searchParams.get('next')).toBe(`/${language}/${path}?tab=drafts&filter=new&filter=active`);
   await expect(page.getByRole('heading',{name:language==='en'?'Sign in to Kinnso':'登入 Kinnso',exact:true})).toBeVisible();
   await expect(page.getByRole('link',{name:language==='en'?'Create an account':'建立帳戶',exact:true})).toHaveAttribute('href',`/${language}/sign-up?${new URLSearchParams({next:`/${language}/${path}?tab=drafts&filter=new&filter=active`})}`);
  }
  expect(external).toEqual([]);
 });
 test(`${locale}: creator CTA reaches the local sign-in and demos remain separate`,async({page})=>{
  await page.goto(`/${locale}/workspace`);
  await expect(page.locator('a[href*="remix-kinnso-web.vercel.app"]')).toHaveCount(0);
  await page.locator(`main a[href="/${language}/studio"]`).click();
  await expect(page).toHaveURL(new RegExp(`/${language}/sign-in\\?`));
  expect(new URL(page.url()).searchParams.get('next')).toBe(`/${language}/studio`);
  await page.goto(`/${locale}/demo/studio`);
  expect(new URL(page.url()).pathname).toBe(`/${language}/demo/studio`);
  await expect(page.locator('.k-mode')).toContainText(language==='en'?'Demo — sample data':'示範 — 樣本資料');
 });
 test(`${locale}: lowercase auth links normalize their safe return paths`,async({page})=>{
  await page.goto(`/${locale}/sign-in?${new URLSearchParams({next:`/${locale}/studio?tab=drafts`})}`);
  await expect(page.getByRole('link',{name:language==='en'?'Cancel and return':'取消及返回',exact:true})).toHaveAttribute('href',`/${language}/studio?tab=drafts`);
  await page.goto(`/${locale}/sign-in?${new URLSearchParams({next:'https://remix-kinnso-web.vercel.app/en/studio'})}`);
  await expect(page.getByRole('link',{name:language==='en'?'Cancel and return':'取消及返回',exact:true})).toHaveAttribute('href',`/${language}/trips`);
 });
 test(`${locale}: invitation landing scrubs its private fragment before local sign-in`,async({page,baseURL})=>{
  const token='12'.repeat(32),requests:string[]=[];
  page.on('request',request=>requests.push(request.url()));
  const response=await page.goto(`/${locale}/merchant/invitation#invite=${token}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
  await expect(page.getByRole('heading',{name:language==='en'?'Company invitation':'公司邀請',exact:true})).toBeVisible();
  await expect.poll(()=>new URL(page.url()).hash).toBe('');
  await expect(page.getByRole('button',{name:language==='en'?'Review invitation':'查看邀請',exact:true})).toHaveCount(0);
  await page.getByRole('main').getByRole('link',{name:language==='en'?'Sign in to continue':'登入後繼續',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/${language}/sign-in\\?`));
  const signIn=new URL(page.url());
  expect(signIn.origin).toBe(new URL(baseURL!).origin);
  expect(signIn.pathname).toBe(`/${language}/sign-in`);
  expect(signIn.searchParams.get('next')).toBe(`/${language}/merchant/invitation`);
  expect(signIn.hash).toBe('');
  expect(requests.some(url=>url.includes(token))).toBe(false);
 });
}

for(const locale of ['en','zh-HK'])test(`${locale}: unavailable library, collections and demo business tools offer local next steps`,async({page})=>{
 await page.goto(`/${locale}/explore`);
 await expect(page.getByRole('heading',{name:locale==='en'?'Published content is not connected yet.':'正式內容尚未接通。',exact:true})).toBeVisible();
 await expect(page.locator('a[href*="remix-kinnso-web.vercel.app"]')).toHaveCount(0);
 for(const path of ['articles','sessions','merchants']){
  await page.goto(`/${locale}/${path}`);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('a[href*="remix-kinnso-web.vercel.app"]')).toHaveCount(0);
  await page.goto(`/${locale}/demo/${path}`);
  await expect(page.getByRole('heading',{name:locale==='en'?'This collection is not available in the trial':'試用期間暫未提供此內容集',exact:true})).toBeVisible();
  await expect(page.locator('a[href*="remix-kinnso-web.vercel.app"]')).toHaveCount(0);
 }
 await page.goto(`/${locale}/demo/merchants/dashboard/profile`);
 await page.getByRole('button',{name:locale==='en'?'Enter merchant demo':'進入商戶示範',exact:true}).click();
 await expect(page.getByRole('heading',{name:locale==='en'?'This business tool is not available in the trial':'試用期間暫未提供此業務工具',exact:true})).toBeVisible();
 await expect(page.locator('a[href*="remix-kinnso-web.vercel.app"]')).toHaveCount(0);
});

for(const locale of ['en','zh-HK','zh-hk'])test(`${locale}: creator entry works without JavaScript`,async({browser,baseURL})=>{
 const language=locale==='en'?'en':'zh-HK';
 const context=await browser.newContext({baseURL,javaScriptEnabled:false});
 try{
  const page=await context.newPage();
  await page.goto(`/${locale}/workspace`);
  await page.locator(`main a[href="/${language}/studio"]`).click();
  await expect(page).toHaveURL(new RegExp(`/${language}/sign-in\\?`));
  expect(new URL(page.url()).searchParams.get('next')).toBe(`/${language}/studio`);
  await expect(page.getByRole('heading',{name:language==='en'?'Sign in to Kinnso':'登入 Kinnso',exact:true})).toBeVisible();
 }finally{await context.close();}
});
