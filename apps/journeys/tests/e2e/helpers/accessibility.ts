import {expect,type Page,type TestInfo} from '@playwright/test';
import {resolve} from 'node:path';

export async function auditPage(page:Page,testInfo:TestInfo,state:string){
 if(!await page.evaluate(()=>Boolean((window as any).axe)))await page.addScriptTag({path:resolve('scripts/accessibility/node_modules/axe-core/axe.min.js')});
 const result=await page.evaluate(async()=>{
  const value=await (window as any).axe.run(document.querySelector('.k-app')??document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
  const project=(items:any[])=>items.map(item=>({id:item.id,impact:item.impact,help:item.help,nodes:item.nodes.map((node:any)=>({target:node.target,failureSummary:node.failureSummary,checks:[...(node.any??[]),...(node.all??[]),...(node.none??[])].map((check:any)=>({id:check.id,data:check.data,message:check.message,relatedTargets:check.relatedNodes?.map((related:any)=>related.target)}))}))}));
  const incompleteRendering=value.incomplete.flatMap((item:any)=>item.nodes.flatMap((node:any)=>node.target.map((selector:string)=>{
   const el=document.querySelector(selector) as HTMLElement|null;if(!el)return{selector,missing:true};const rect=el.getBoundingClientRect(),css=getComputedStyle(el);
   const backgrounds=[];for(let ancestor:HTMLElement|null=el;ancestor;ancestor=ancestor.parentElement){const style=getComputedStyle(ancestor);backgrounds.push({tag:ancestor.tagName,cls:ancestor.className,color:style.backgroundColor,image:style.backgroundImage});if(style.backgroundColor!=='rgba(0, 0, 0, 0)')break;}
   const textRange=document.createRange();textRange.selectNodeContents(el);const textRects=Array.from(textRange.getClientRects()).map(r=>({x:r.x,y:r.y,width:r.width,height:r.height}));
   return{selector,text:el.textContent,textRects,lineHeight:css.lineHeight,parentOverflow:getComputedStyle(el.parentElement!).overflow,scrollY,active:document.activeElement?.className,skip:Array.from(document.querySelectorAll<HTMLElement>('.k-skip')).map(skip=>{const r=skip.getBoundingClientRect(),c=getComputedStyle(skip);return{rect:{x:r.x,y:r.y,width:r.width,height:r.height},focus:skip===document.activeElement,font:c.fontSize,lineHeight:c.lineHeight,top:c.top};}),pointStacks:[0.1,0.5,0.9].flatMap(x=>[0.1,0.5,0.9].map(y=>({x:rect.x+rect.width*x,y:rect.y+rect.height*y,stack:document.elementsFromPoint(rect.x+rect.width*x,rect.y+rect.height*y).slice(0,3).map(e=>({tag:e.tagName,cls:e.className}))}))),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},textColor:css.color,fontSize:css.fontSize,backgrounds,centerStack:document.elementsFromPoint(rect.x+rect.width/2,rect.y+rect.height/2).slice(0,4).map(element=>({tag:element.tagName,cls:element.className}))};
  })));
  return{engine:value.testEngine,scope:'.k-app; document language/title checked separately',violations:project(value.violations),incomplete:project(value.incomplete),incompleteRendering,passes:value.passes.map((item:any)=>item.id)};
 });
 await testInfo.attach('axe-'+state,{body:Buffer.from(JSON.stringify(result,null,2)),contentType:'application/json'});
 if(result.incomplete.length)await testInfo.attach('manual-review-'+state,{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
 expect(result.violations,'Automated WCAG violations; incomplete checks remain manual-review evidence').toEqual([]);
 expect(result.incomplete,'Unresolved automated checks require review; raw diagnostics retained before failure').toEqual([]);
 return result;
}
export async function doubleText(page:Page,testInfo:TestInfo){
 const sizes=await page.evaluate(()=>{
  const main=document.querySelector('main')!,before=parseFloat(getComputedStyle(main).fontSize);
  const rows=Array.from(document.querySelectorAll<HTMLElement>('body,body *')).map(el=>({el,size:parseFloat(getComputedStyle(el).fontSize)})).filter(row=>Number.isFinite(row.size)&&row.size>0);
  for(const row of rows)row.el.style.fontSize=(row.size*2)+'px';
  return{mode:'computed-font-size x2; native Chromium rendering; not browser/physical/AT acceptance',before,after:parseFloat(getComputedStyle(main).fontSize)};
 });
 expect(sizes.after).toBeCloseTo(sizes.before*2);
 await testInfo.attach('text-resize',{body:Buffer.from(JSON.stringify(sizes)),contentType:'application/json'});
}
export async function assertReflow(page:Page){
 const value=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,boxes:Array.from(document.querySelectorAll<HTMLElement>('main,section,form,fieldset,label,input,textarea,select')).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);}).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width,minWidth:getComputedStyle(el).minWidth})),overflow:Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,button,legend,dd,li')).filter(el=>{
  const rect=el.getBoundingClientRect();return rect.width>0&&rect.height>0&&(rect.right>innerWidth+1||rect.left< -1||(el.clientWidth>0&&el.scrollWidth>el.clientWidth+1));
 }).slice(0,12).map(el=>({tag:el.tagName,text:el.textContent?.slice(0,90),width:el.clientWidth,scroll:el.scrollWidth}))}));
 expect(value.scrollWidth,JSON.stringify(value)).toBeLessThanOrEqual(value.width+1);
 expect(value.boxes,JSON.stringify(value)).toEqual([]);
 expect(value.overflow,JSON.stringify(value)).toEqual([]);
}

export async function keyboardFocus(page:Page,testInfo:TestInfo){
 const controls=page.locator('.k-app a[href],.k-app button:not([disabled]),.k-app input:not([disabled]),.k-app textarea:not([disabled]),.k-app select:not([disabled])');
 if(!await controls.count()){await testInfo.attach('keyboard-scope',{body:Buffer.from('Static reading component; full Next shell keyboard tested separately.'),contentType:'text/plain'});return;}
 await page.keyboard.press('Tab');
 const value=await page.evaluate(()=>{
  const el=document.activeElement as HTMLElement,style=(element:HTMLElement)=>{const css=getComputedStyle(element);return{outlineStyle:css.outlineStyle,outlineWidth:css.outlineWidth,outlineColor:css.outlineColor,boxShadow:css.boxShadow,borderColor:css.borderColor,borderWidth:css.borderWidth};};
  const focused=style(el),inApp=Boolean(document.querySelector('.k-app')?.contains(el)),visible=el.matches(':focus-visible');
  el.blur();const blurred=style(el);el.focus();
  return{tag:el.tagName,inApp,visible,focused,blurred};
 });
 await testInfo.attach('keyboard-focus',{body:Buffer.from(JSON.stringify(value)),contentType:'application/json'});
 expect(value.inApp&&value.visible).toBe(true);
 expect(['A','BUTTON','INPUT','TEXTAREA','SELECT']).toContain(value.tag);
 const outline=value.focused.outlineStyle!=='none'&&parseFloat(value.focused.outlineWidth)>0&&!['transparent','rgba(0, 0, 0, 0)'].includes(value.focused.outlineColor)&&(['outlineStyle','outlineWidth','outlineColor'] as const).some(key=>value.focused[key]!==value.blurred[key]);
 const shadow=value.focused.boxShadow!=='none'&&value.focused.boxShadow!==value.blurred.boxShadow;
 const border=parseFloat(value.focused.borderWidth)>0&&value.focused.borderColor!==value.blurred.borderColor;
 expect(outline||shadow||border,'Keyboard focus must have a rendered visual indicator').toBe(true);
}
