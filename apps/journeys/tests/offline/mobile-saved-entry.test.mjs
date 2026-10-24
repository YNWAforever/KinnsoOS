import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {readFileSync,writeFileSync,mkdirSync,statfsSync} from 'node:fs';
import {freemem} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const app=process.env.KINNSO_OFFLINE_APP??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dependencies=process.env.KINNSO_OFFLINE_DEPENDENCY_APP??app;
const require=createRequire(path.join(dependencies,'package.json'));
const {build}=require('esbuild'),{chromium}=require('@playwright/test');
const evidence=process.env.KINNSO_OFFLINE_EVIDENCE;
const phase=process.env.KINNSO_OFFLINE_PHASE??'local';
const cases=[];let browser,render;
before(async()=>{
  const disk=statfsSync('C:/'),resource={utc:new Date().toISOString(),ramBytes:freemem(),
    diskBytes:disk.bavail*disk.bsize};
  if(evidence){mkdirSync(evidence,{recursive:true});
    writeFileSync(path.join(evidence,'resources-'+phase+'.json'),JSON.stringify(resource,null,2)+'\n',{flag:'wx'})}
  assert.ok(resource.ramBytes>=2*1024**3&&resource.diskBytes>=6*1024**3,'OFFLINE_RESOURCE_GATE');
  const entry=`import {createElement} from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {ConnectedHome} from ${JSON.stringify(path.join(app,'app/travel/ConnectedHome.tsx'))};
    import {AppContext} from ${JSON.stringify(path.join(app,'app/travel/ui.tsx'))};
    export const render=locale=>renderToStaticMarkup(createElement(AppContext.Provider,{
      value:{locale,t:(en,zh)=>locale==='en'?en:zh,href:p=>'/'+locale+(p?'/'+p:''),ready:true,store:{}}
    },createElement(ConnectedHome,{actorId:null})));`;
  const result=await build({stdin:{contents:entry,resolveDir:app,loader:'jsx'},bundle:true,
    platform:'node',format:'cjs',write:false,jsx:'automatic',
    alias:{react:path.dirname(require.resolve('react/package.json')),
      'react-dom':path.dirname(require.resolve('react-dom/package.json'))},
    nodePaths:[path.join(dependencies,'node_modules')],
    define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'offline-link',setup(builder){
      builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'offline'}));
      builder.onLoad({filter:/.*/,namespace:'offline'},()=>({resolveDir:dependencies,loader:'js',
        contents:"import {createElement} from 'react'; export default function Link({href,children,prefetch,...props}){return createElement('a',{...props,href},children)}"}));
    }}]});
  const module={exports:{}};
  new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);
  render=module.exports.render;
  browser=await chromium.launch({headless:true});
});
after(async()=>{
  if(browser)await browser.close();
  if(evidence)writeFileSync(path.join(evidence,'saved-entry-'+phase+'.json'),JSON.stringify({
    app,productionLifecycle:0,serverStarted:false,realAuthDbCalls:0,cases},null,2)+'\n',{flag:'wx'});
});
for(const [locale,width] of [['en',390],['zh-HK',390],['en',1280],['zh-HK',1280],['en',320],['zh-HK',650]])
  test('Saved is visible, keyboard reachable and follows its existing locale route: '+locale+' '+width,async()=>{
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage(),requests=[];
    const origin='https://saved-entry-offline.invalid';
    try{
      await context.route('**/*',route=>{
        const request=route.request(),url=new URL(request.url());
        requests.push({path:url.pathname,method:request.method(),sameOrigin:url.origin===origin});
        if(url.origin!==origin)return route.abort('blockedbyclient');
        if(url.pathname==='/'+locale)return route.fulfill({contentType:'text/html; charset=utf-8',
          body:'<!doctype html><html><meta charset="utf-8"><style>body{margin:0}'+
            readFileSync(path.join(app,'app/travel/workbench.css'),'utf8')+
            '</style><body><main class="k-app">'+render(locale)+'</main></body></html>'});
        if(url.pathname==='/'+locale+'/saved')return route.fulfill({contentType:'text/html; charset=utf-8',
          body:'<!doctype html><html><meta charset="utf-8"><h1 id="saved-entry">Saved offline route boundary</h1></html>'});
        return route.abort('blockedbyclient');
      });
      await page.goto(origin+'/'+locale);
      const link=page.getByRole('link',{name:locale==='en'?'Your saved routes':'我的收藏',exact:true});
      assert.equal(await link.count(),1,'SAVED_LINK_MUST_BE_VISIBLE_TO_ACCESSIBILITY');
      assert.equal(await link.isVisible(),true);
      const rect=await link.boundingBox();assert.ok(rect);
      if(width<=650)assert.ok(rect.height>=44,'MOBILE_SAVED_TOUCH_TARGET_AT_LEAST_44_PX');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=width,'NO_HORIZONTAL_OVERFLOW');
      await page.keyboard.press('Tab');
      assert.equal(await link.evaluate(element=>document.activeElement===element),true,'SAVED_LINK_IS_KEYBOARD_REACHABLE');
      if(evidence)await page.screenshot({path:path.join(evidence,'saved-'+phase+'-'+locale+'-'+width+'.png'),fullPage:true});
      await page.keyboard.press('Enter');
      await page.waitForURL(origin+'/'+locale+'/saved');
      assert.equal(await page.locator('#saved-entry').count(),1);
      assert.equal(requests.filter(row=>row.path.startsWith('/api/')).length,0);
      cases.push({locale,width,status:'PASS',rect,requests,realAuthDbCalls:0});
    }catch(error){
      if(evidence)await page.screenshot({path:path.join(evidence,'saved-'+phase+'-'+locale+'-'+width+'-failure.png'),fullPage:true});
      cases.push({locale,width,status:'FAIL',message:error.message,requests});
      throw error;
    }finally{await context.close()}
  });
