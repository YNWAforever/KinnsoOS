import {test,expect} from '@playwright/test';
import {PUBLIC_ENTRY_PATHS,resolvePublicEntry} from '../../app/integration/public-entry-registry';

// Public navigation only: no account, Auth fixture, database or mutation.
for(const locale of ['en','zh-HK']){
 const label=(en:string,zh:string)=>locale==='en'?en:zh;
 test(`U20 ${locale}: footer destinations survive client navigation and reload`,async({page})=>{
  await page.goto(`/${locale}/workspace`);
  for(const [link,en,zh,path] of [
   [label('Help','支援'),'Help & support','支援與協助','help'],
   [label('Privacy','私隱'),'Privacy information','私隱資訊','legal/privacy'],
   [label('For business','商戶合作'),'Work with Kinnso','與 Kinnso 合作','for-business'],
   [label('Credits & source','來源及授權'),'Credits & source','來源及授權','credits'],
  ]){
   await page.getByRole('contentinfo').getByRole('link',{name:link,exact:true}).click();
   await expect(page).toHaveURL(`/${locale}/${path}`);
   await expect(page.getByRole('heading',{level:1})).toHaveText(label(en,zh));
   await page.reload();
   await expect(page.getByRole('heading',{level:1})).toHaveText(label(en,zh));
   await expect(page.locator('main')).not.toContainText(label('About your data in this demo','關於此示範的資料'));
   await expect(page.locator('main a[href*="/legacy/"]')).toHaveCount(0);
  }
  await expect(page.getByRole('link',{name:label('Download corresponding source','下載對應原始碼'),exact:true})).toHaveAttribute('href','/source/kinnsoos-source.zip');
 });
 test(`U20 ${locale}: small-screen directory preserves native, legacy and demo destinations`,async({page})=>{
  await page.setViewportSize({width:320,height:844});
  await page.goto(`/${locale}/workspace`);
  await page.addStyleTag({content:'html{font-size:200%} .k-app{font-size:1rem}'});
  expect(await page.locator('.k-header-end').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.k-mode')!.getBoundingClientRect().top)).toBe(true);
  const main=page.locator('main');
  for(const path of ['studio','merchant','ops'])await expect(main.locator(`a[href="/${locale}/${path}"]`).first()).toBeVisible();
  for(const path of ['studio','merchants/dashboard','demo-lab'])await expect(main.locator(`a[href="/${locale}/demo/${path}"]`)).toBeVisible();
  const originalLocale=locale==='en'?'en':'zh-hk';
  for(const path of ['studio','merchants/dashboard','admin'])await expect(main.locator(`a[href="https://remix-kinnso-web.vercel.app/${originalLocale}/${path}"]`)).toBeVisible();
  const demo=main.locator(`a[href="/${locale}/demo/studio"]`);
  await demo.focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/${locale}/demo/studio`);
  await expect(page.locator('.k-mode')).toContainText(label('Demo — sample data','示範 — 樣本資料'));
 });
 test(`U20 ${locale}: unknown public page remains not found`,async({page})=>{
  const response=await page.goto(`/${locale}/legal/not-a-policy`);
  expect(response?.status()).toBe(404);
 });
}

// Each retained route exercises real Next routing and the actual public CTA.
for(const locale of ['en','zh-HK'] as const)for(const path of PUBLIC_ENTRY_PATHS.filter(path=>!['help','legal/privacy','for-business','credits'].includes(path))){
 test(`U20 ${locale} ${path}: direct, keyboard navigation, Back, reload and reflow without commands`,async({page})=>{
  const writes:string[]=[],privateReads:string[]=[];
  page.on('request',request=>{
   if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+new URL(request.url()).pathname);
   if(/\/api\/(creator|merchant|ops)(\/|$)/.test(new URL(request.url()).pathname))privateReads.push(request.url());
  });
  const entry=resolvePublicEntry(path,locale,{creator:false,merchant:false,support:false})!;
  await page.setViewportSize({width:320,height:844});
  const response=await page.goto(`/${locale}/${path}`);
  expect(response?.status()).toBe(200);
  const heading=page.getByRole('heading',{level:1});
  await expect(heading).toHaveText(entry.title);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await expect(page).toHaveTitle(new RegExp(entry.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
  await page.addStyleTag({content:'html{font-size:200%}.k-app{font-size:1rem}body:has(.k-app){overflow-x:visible}'});
  expect(await page.locator('.k-header-end').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.k-mode')!.getBoundingClientRect().top)).toBe(true);
  expect(await heading.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return Array.from(range.getClientRects()).every(rect=>rect.left>=0&&rect.right<=innerWidth);})).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const primary=page.locator('main .k-actions').getByRole('link',{name:entry.primary.label,exact:true}).first();
  await expect(primary).toHaveAttribute('href',entry.primary.href);
  await primary.focus();await expect(primary).toBeFocused();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(entry.primary.href);
  await page.goBack();await expect(heading).toHaveText(entry.title);
  await page.reload();await expect(heading).toHaveText(entry.title);
  expect(writes).toEqual([]);expect(privateReads).toEqual([]);
 });
}
