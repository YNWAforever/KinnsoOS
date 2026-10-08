import {test,expect} from '@playwright/test';

const examples = [
 {initial:'en',other:'zh-HK',path:'explore',query:'?q=Kyoto&page=2'},
 {initial:'zh-HK',other:'en',path:'explore',query:'?q=Kyoto&page=2'},
 {initial:'en',other:'zh-HK',path:'g/kyoto-slow-days',query:'?view=steps&page=2'},
 {initial:'zh-HK',other:'en',path:'g/kyoto-slow-days',query:'?view=steps&page=2'},
] as const;

for(const example of examples)test('explicit demo locale keeps route and query '+example.initial+' '+example.path,async({page})=>{
 const {initial,other,path,query}=example;
 const accountRequests:string[]=[];
 await page.route('**/api/**',route=>{
  accountRequests.push(new URL(route.request().url()).pathname);
  return route.abort('blockedbyclient');
 });
 await page.goto('/'+initial+'/demo/'+path+query);
 await expect(page.locator('.k-mode')).toContainText(initial==='en'?'Demo — sample data, saved on this device':'示範 — 樣本資料，儲存於此裝置');
 await expect(page.locator('html')).toHaveAttribute('lang',initial);
 const language=page.locator('.k-language');
 // Removing the explicit-demo segment sends these sample routes to account services.
 await expect(language).toHaveAttribute('href','/'+other+'/demo/'+path+query);
 await language.focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL('/'+other+'/demo/'+path+query);
 await expect(page.locator('.k-mode')).toContainText(other==='en'?'Demo — sample data, saved on this device':'示範 — 樣本資料，儲存於此裝置');
 await expect(page.locator('html')).toHaveAttribute('lang',other);
 if(path.startsWith('g/'))await expect(page.getByRole('heading',{name:other==='en'?'A little slower, in Kyoto':'京都，慢一點剛剛好',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:other==='en'?'Main navigation':'主導航',exact:true}).getByRole('link').first()).toHaveAttribute('href','/'+other+'/demo/explore');
 await page.goBack();
 await expect(page).toHaveURL('/'+initial+'/demo/'+path+query);
 await expect(page.locator('.k-mode')).toContainText(initial==='en'?'Demo — sample data, saved on this device':'示範 — 樣本資料，儲存於此裝置');
 await expect(page.locator('html')).toHaveAttribute('lang',initial);
 await page.goForward();
 await expect(page).toHaveURL('/'+other+'/demo/'+path+query);
 await expect(page.locator('html')).toHaveAttribute('lang',other);
 await expect(page.locator('.k-mode')).toContainText(other==='en'?'Demo — sample data, saved on this device':'示範 — 樣本資料，儲存於此裝置');
 expect(accountRequests).toEqual([]);
});

// These checks use only the labelled, existing demo data. No Auth/database fixture is created.
// Connected-language routes are covered separately by content-first-wave.spec.ts.
