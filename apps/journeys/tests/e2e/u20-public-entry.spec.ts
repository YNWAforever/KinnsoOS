import {test,expect} from '@playwright/test';

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
