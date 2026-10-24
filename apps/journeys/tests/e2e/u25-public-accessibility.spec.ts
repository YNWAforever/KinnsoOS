import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {auditPage,doubleText,assertReflow,keyboardFocus} from './helpers/accessibility';

async function attachHeaderDiagnostics(page:Page,testInfo:TestInfo,state:'failure'|'baseline'){
 try {
  const geometry=await page.evaluate(async()=>{
   const logo=document.querySelector('.k-logo');
   const entry=logo?await new Promise<IntersectionObserverEntry|null>(resolve=>{
    const observer=new IntersectionObserver(([value])=>{clearTimeout(timer);observer.disconnect();resolve(value);},{threshold:1});
    const timer=setTimeout(()=>{observer.disconnect();resolve(null);},500);
    observer.observe(logo);
   }):null;
   const identify=(el:Element|null)=>el?{tag:el.tagName,id:el.id,cls:el.getAttribute('class')??''}:null;
   const properties=['display','position','top','right','bottom','left','z-index','box-sizing','width','height','min-width','min-height','max-width','max-height','overflow','overflow-x','overflow-y','overflow-anchor','align-items','align-self','align-content','justify-content','justify-self','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','grid-template-columns','grid-template-rows','gap','padding','margin','transform','zoom','contain','content-visibility','font-family','font-size','line-height','white-space','letter-spacing','scroll-behavior','scroll-margin','scroll-padding'];
   const box=(el:Element)=>{const css=getComputedStyle(el);return{...identify(el),rect:el.getBoundingClientRect().toJSON(),client:{width:el.clientWidth,height:el.clientHeight,left:el.clientLeft,top:el.clientTop},scroll:{width:el.scrollWidth,height:el.scrollHeight,left:el.scrollLeft,top:el.scrollTop},styles:Object.fromEntries(properties.map(property=>[property,css.getPropertyValue(property)]))};};
   const elements=new Set(document.querySelectorAll('html,body,.k-header,.k-header > *,.k-logo span,#k-main'));
   for(let el=logo?.parentElement;el;el=el.parentElement)elements.add(el);
   const visual=window.visualViewport;
   return{
    logo:logo?box(logo):null,
    intersection:entry?{isIntersecting:entry.isIntersecting,ratio:entry.intersectionRatio,boundingClientRect:entry.boundingClientRect.toJSON(),intersectionRect:entry.intersectionRect.toJSON(),rootBounds:entry.rootBounds?.toJSON()??null}:null,
    viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,visual:visual?{width:visual.width,height:visual.height,offsetLeft:visual.offsetLeft,offsetTop:visual.offsetTop,pageLeft:visual.pageLeft,pageTop:visual.pageTop,scale:visual.scale}:null},
    scroll:{x:scrollX,y:scrollY},
    document:{clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},
    fontsStatus:document.fonts.status,activeFocus:identify(document.activeElement),boxes:Array.from(elements,box),
   };
  });
  await testInfo.attach('public-header-'+state+'-geometry',{body:Buffer.from(JSON.stringify(geometry,null,2)),contentType:'application/json'});
 } catch { /* Diagnostic failures must not replace the assertion result. */ }
 if(state==='failure'){
  try { await testInfo.attach('public-header-failure-viewport',{body:await page.screenshot({fullPage:false}),contentType:'image/png'}); }
  catch { /* Preserve the original assertion even if screenshot capture fails. */ }
 }
}

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
   await attachHeaderDiagnostics(page,testInfo,'failure');throw error;
  }
  await attachHeaderDiagnostics(page,testInfo,'baseline');
  const resized=await auditPage(page,testInfo,'text-200');expect(resized.incomplete.filter((item:{id:string})=>item.id==='color-contrast'),'Resized public text contrast must be determinable').toEqual([]);
  expect(writes).toEqual([]);
 });
}
