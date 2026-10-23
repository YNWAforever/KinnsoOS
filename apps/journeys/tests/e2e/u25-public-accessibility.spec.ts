import {test,expect} from '@playwright/test';
import {auditPage,doubleText,assertReflow,keyboardFocus} from './helpers/accessibility';

// Existing public-entry backend-disabled Next server; no account or DB fixture.
for(const locale of ['en','zh-HK'])for(const width of [320,640,1280])for(const path of ['','workspace','help','legal/privacy','for-business','credits']){
 test('PD15 public '+locale+' '+width+' '+(path||'home')+': real Next page accessibility and text resize',async({page},testInfo)=>{
  const writes:string[]=[];await page.setViewportSize({width,height:844});
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')&&!['GET','HEAD'].includes(request.method()))writes.push(request.method()+' '+new URL(request.url()).pathname);});
  await page.route('**/*',route=>{const url=new URL(route.request().url());return url.protocol.startsWith('http')&&url.origin!=='http://127.0.0.1:3496'?route.abort():route.continue();});
  const response=await page.goto('/'+locale+(path?'/'+path:''));expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);await expect(page.getByRole('heading',{level:1})).toBeVisible();expect(await page.title()).not.toBe('');
  const normal=await auditPage(page,testInfo,'normal');expect(normal.incomplete.filter((item:{id:string})=>item.id==='color-contrast'),'Public text contrast must be determinable').toEqual([]);await keyboardFocus(page,testInfo);await page.keyboard.press('Enter');await expect(page.locator('#k-main')).toBeFocused();
  await doubleText(page,testInfo);await assertReflow(page);await page.evaluate(()=>window.scrollTo(0,0));await expect(page.locator('.k-logo')).toBeInViewport({ratio:1});const resized=await auditPage(page,testInfo,'text-200');expect(resized.incomplete.filter((item:{id:string})=>item.id==='color-contrast'),'Resized public text contrast must be determinable').toEqual([]);
  expect(writes).toEqual([]);
 });
}
