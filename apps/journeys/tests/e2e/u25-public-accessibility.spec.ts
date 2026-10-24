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
  // Normalize only audit scrolling before keyboard focus; retain all layout and contrast gates.
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';});
  const normal=await auditPage(page,testInfo,'normal');expect(normal.incomplete.filter((item:{id:string})=>item.id==='color-contrast'),'Public text contrast must be determinable').toEqual([]);await keyboardFocus(page,testInfo);await page.keyboard.press('Enter');await expect(page.locator('#k-main')).toBeFocused();
  await doubleText(page,testInfo);await assertReflow(page);await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));window.scrollTo({top:0,left:0,behavior:'instant'});});
  await expect.poll(()=>page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual({x:0,y:0});try { await expect(page.locator('.k-logo')).toBeInViewport({ratio:1}); } catch(error) {
   const geometry=await page.evaluate(()=>({scrollX,scrollY,viewport:{width:innerWidth,height:innerHeight},behavior:getComputedStyle(document.documentElement).scrollBehavior,boxes:Array.from(document.querySelectorAll<HTMLElement>('html,body,.k-app,.k-header,.k-logo,#k-main')).map(el=>({tag:el.tagName,cls:el.className,rect:el.getBoundingClientRect().toJSON(),font:getComputedStyle(el).fontSize,lineHeight:getComputedStyle(el).lineHeight,height:getComputedStyle(el).height,overflow:getComputedStyle(el).overflow}))}));
   console.log('PUBLIC_A11Y_FAILURE_GEOMETRY',JSON.stringify(geometry));await testInfo.attach('public-header-failure-geometry',{body:Buffer.from(JSON.stringify(geometry,null,2)),contentType:'application/json'});throw error;
  }const resized=await auditPage(page,testInfo,'text-200');expect(resized.incomplete.filter((item:{id:string})=>item.id==='color-contrast'),'Resized public text contrast must be determinable').toEqual([]);
  expect(writes).toEqual([]);
 });
}
