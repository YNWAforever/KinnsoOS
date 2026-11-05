/** Local fixture UI checks only. Never database/provider acceptance. Starts its own anonymous backend and browser. */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url)),app=path.join(root,'apps/journeys');
const require=createRequire(path.join(app,'package.json')),{chromium,expect}=require('@playwright/test');
const locales=['en','zh-HK','zh-tw','zh-cn','ja','ko','th'],known=new Set(locales.map(l=>l==='zh-HK'?'zh-hk':l));
const categories={destination:'destinations',dining:'dining',shopping:'shopping'};
let calls=0;const observed=[];
const backend=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture.invalid');let rows=[];calls++;observed.push(url.pathname+url.search);
 try{
  assert.equal(req.headers.authorization,undefined);
  if(url.pathname==='/rest/v1/rpc/search_articles'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('fixture request too large');}const input=JSON.parse(body);
   assert.ok(known.has(input.p_locale));assert.ok(Object.hasOwn(categories,input.p_category));
   rows=Array.from({length:13},(_,index)=>({url:input.p_locale==='th'&&index===12?'เที่ยว':'published-'+index,category:input.p_category,title:input.p_category==='shopping'&&index===0?null:'Authored '+input.p_locale+' '+index,summary:'Synthetic article summary',thumbnails:[],published_at:'2026-01-01T00:00:00Z',total_count:13})).slice(input.p_offset,input.p_offset+input.p_limit);
  }else if(url.pathname==='/rest/v1/articles'){
   const locale=url.searchParams.get('article_translations.locale')?.slice(3),slug=url.searchParams.get('url')?.slice(3);
   if(known.has(locale)&&(/^published-\d+$/.test(slug??'')||locale==='th'&&slug==='เที่ยว'))rows=[{id:'11111111-1111-4111-8111-111111111111',url:slug,category:url.searchParams.get('category')?.slice(3),thumbnails:[],published_at:'2026-01-01T00:00:00Z',edit_at:null,authors:[],article_translations:[{locale,title:'Authored '+locale+' '+(slug==='เที่ยว'?'12':slug.split('-')[1]),summary:'Synthetic article summary',content:[{id:'body',type:'text',title:'Authored section',content:'<p>Durable fixture body <strong>important</strong></p>'}],meta_title:null,meta_description:null,og_image:null}]}];
  }else if(url.pathname==='/rest/v1/article_faqs')rows=[{question:'Fixture question',answer:'Fixture answer'}];
  else throw Error('Unexpected fixture request: '+url.pathname);
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(rows));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(error)}));}
});
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
const apiOrigin=`http://127.0.0.1:${backend.address().port}`;
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const appOrigin=`http://127.0.0.1:${port}`;
const env={...process.env,NODE_ENV:'production',KINNSO_ENVIRONMENT:'local',KINNSO_SITE_URL:appOrigin,KINNSO_SUPABASE_URL:apiOrigin,KINNSO_APPROVED_SUPABASE_ORIGIN:apiOrigin,KINNSO_LEGACY_AUTH_ORIGIN:apiOrigin,KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',KINNSO_ENABLED_CAPABILITIES:'',KINNSO_SYNTHETIC_RUN:'true'};
for(const key of ['KINNSO_SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'])delete env[key];
const child=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:app,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs='',browser;child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const output=path.join(root,'.local-private/single-origin/articles-preview');await mkdir(output,{recursive:true});
const checks=[];
try{
 let ready=false;for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('Preview exited');try{const r=await fetch(appOrigin+'/robots.txt');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Preview did not start');
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:390,height:844},{width:1280,height:900}])for(const javaScriptEnabled of [false,true]){
  const context=await browser.newContext({javaScriptEnabled,viewport}),page=await context.newPage();
  for(const locale of locales){
   const authored=locale==='zh-HK'?'zh-hk':locale,detailSlug=locale==='th'?encodeURIComponent('เที่ยว'):'published-12';
   await page.goto(`${appOrigin}/${locale}/articles`);assert.equal(await page.locator('html').getAttribute('lang'),locale);
   assert.equal(await page.locator(`a[href="/${locale}/articles/dining"]`).count(),2);assert.equal(await page.locator(`a[href="/${locale}/articles/shopping/published-0"]`).count(),0);
   await page.goto(`${appOrigin}/${locale}/articles/destinations?q=tea&region=tokyo`);
   await expect(page.locator('main li')).toHaveCount(12);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.getByRole('searchbox').focus();await expect(page.getByRole('searchbox')).toBeFocused();await page.locator('a[href*="page=2"]').focus();await page.keyboard.press('Enter');await expect(page.locator('main li')).toHaveCount(1);
   assert.ok(page.url().includes('q=tea'));assert.ok(page.url().includes('region=tokyo'));
   await page.locator('main li a').click();try{await expect(page.locator('article h1')).toHaveText('Authored '+authored+' 12');}catch(error){await writeFile(path.join(output,'failure.json'),JSON.stringify({locale,javaScriptEnabled,url:page.url(),observed:observed.slice(-5),body:await page.locator('body').innerText(),html:await page.content()},null,2));throw error;}
   assert.equal(await page.locator('article strong').innerText(),'important');assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),`https://kinnso-os.vercel.app/${locale}/articles/destinations/${detailSlug}`);
   assert.ok((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'));
   assert.equal(await page.locator('a[href*="remix-kinnso-web"]').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   checks.push({locale,javaScriptEnabled,viewportWidth:viewport.width,hub:true,pagination:true,detail:true,canonical:true,mobileOverflow:false});
  }
  await page.goto(`${appOrigin}/ja/articles/destinations/missing`);assert.equal(await page.locator('article h1').count(),0);
  await page.goto(`${appOrigin}/ja/articles/destinations?page=2&page=3`);assert.equal(await page.locator('main li').count(),0);
  await context.close();
 }
 await writeFile(path.join(output,'result.json'),JSON.stringify({kind:'LOCAL_FIXTURE_UI_ONLY',checks,requests:calls,productionChanged:false},null,2));
 console.log(JSON.stringify({kind:'LOCAL_FIXTURE_UI_ONLY',passed:checks.length,productionChanged:false}));
}finally{await browser?.close();child.kill();await new Promise(resolve=>backend.close(resolve));await writeFile(path.join(output,'server.log'),logs);}
