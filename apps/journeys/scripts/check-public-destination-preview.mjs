/** Local fixture UI checks only. Never database/provider/hosted-build acceptance. */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {access, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const app=path.join(root,'apps/journeys');
const require=createRequire(path.join(app,'package.json'));
const {chromium,expect}=require('@playwright/test');
const locales=['en','zh-HK','zh-tw','zh-cn','ja','ko','th'];
const destination={slug:'tokyo',name:'Tokyo',description:'Authored destination',hero_image_url:null,match_terms:['Tokyo','東京'],guide_count:'1',experience_count:'1',latest_published_at:'2026-01-01T00:00:00Z'};
const creatorId='11111111-1111-4111-8111-111111111111';
const merchantId='22222222-2222-4222-8222-222222222222';
const experienceId='33333333-3333-4333-8333-333333333333';
const sessionId='44444444-4444-4444-8444-444444444444';
const guideId='55555555-5555-4555-8555-555555555555';
const articleId='66666666-6666-4666-8666-666666666666';
const creator={id:creatorId,handle:'fixture-creator',display_name:'Authored creator',bio:'Authored creator bio',public_profile:{}};
const merchant={id:merchantId,slug:'fixture-merchant',company_name:'Authored merchant',tagline:'Authored tagline',city:'Tokyo',logo_url:null,website_url:'https://example.com/',created_at:'2026-01-01T00:00:00Z'};
const experience={id:experienceId,slug:'city-walk',title:'Authored experience',summary:'Authored experience summary',description:'Authored experience description',city:'Tokyo',price_amount:1200,currency:'JPY',duration_minutes:90,cover_url:null,published_at:'2026-01-01T00:00:00Z',saves_count:2,merchant_profile_id:merchantId};
const guideRow={id:guideId,title:'Authored guide',summary:'Authored guide summary',city:'Tokyo',cover_url:null,creator_handle:'fixture-creator',saves_count:1,published_at:'2026-01-01T00:00:00Z',creator_id:creatorId,creator_name:'Authored creator'};
const guide={kind:'summary',id:guideId,title:guideRow.title,summary:guideRow.summary,destinationId:null};
const sessionRow={id:sessionId,slug:'fixture-session',title:'Authored session',description:'Authored session description',type:'destination_briefing',starts_at:'2026-07-01T10:00:00Z',duration_minutes:45,replay_url:null,destination_tags:['Tokyo','東京'],status:'scheduled',host_creator_id:creatorId};
const article={id:articleId,url:'tokyo-story',slug:'tokyo-story',category:'destination',thumbnails:[],published_at:'2026-01-01T00:00:00Z',edit_at:null,authors:['fixture-author']};

function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const backend=createServer(async(req,res)=>{
 try{
  assert.equal(req.headers.authorization,undefined);
  const url=new URL(req.url,'http://fixture.invalid');
  if(url.pathname==='/rest/v1/destination_index'){
   if(url.searchParams.get('slug')==='eq.service-error')return json(res,{},503);
   if(url.searchParams.get('slug')==='eq.missing')return json(res,[]);
   return json(res,[destination]);
  }
  if(url.pathname==='/rest/v1/guides'){
   if(url.searchParams.get('id')==='eq.'+guideId)return json(res,[guideRow]);
   if(url.searchParams.get('creator_id')==='eq.'+creatorId)return json(res,[{id:guideId,title:guideRow.title}]);
   return json(res,[guideRow]);
  }
  if(url.pathname==='/rest/v1/rpc/kinnso_guide')return json(res,guide);
  if(url.pathname==='/rest/v1/experiences')return json(res,[experience]);
  if(url.pathname==='/rest/v1/merchant_public_profiles')return json(res,[merchant]);
  if(url.pathname==='/rest/v1/community_sessions'){
   if(url.searchParams.get('status')==='eq.ended')return json(res,[]);
   return json(res,[sessionRow]);
  }
  if(url.pathname==='/rest/v1/creators'){
   if(url.searchParams.get('handle'))return json(res,[creator]);
   return json(res,[creator]);
  }
  if(url.pathname==='/rest/v1/rpc/search_articles'){
   let body='';for await(const chunk of req)body+=chunk;
   const input=JSON.parse(body);
   return json(res,[{url:'tokyo-story',category:input.p_category,title:'Authored article',summary:'Authored summary',thumbnails:[],published_at:'2026-01-01T00:00:00Z',total_count:1}]);
  }
  if(url.pathname==='/rest/v1/articles'){
   const locale=url.searchParams.get('article_translations.locale')?.slice(3);
   if(!locale)return json(res,[]);
   return json(res,[{...article,category:url.searchParams.get('category')?.slice(3),article_translations:[{locale,title:'Authored article',summary:'Authored summary',content:[{id:'body',type:'text',title:'Authored section',content:'<p>Authored article body</p>'}],meta_title:null,meta_description:null,og_image:null}]}]);
  }
  if(url.pathname==='/rest/v1/article_authors')return json(res,[{slug:'fixture-author',name:'Fixture author'}]);
  if(url.pathname==='/rest/v1/article_faqs')return json(res,[]);
  json(res,{error:'Unexpected fixture request',path:url.pathname},500);
 }catch(error){json(res,{error:String(error)},500);}
});
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
const apiOrigin=`http://127.0.0.1:${backend.address().port}`;
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const appOrigin=`http://127.0.0.1:${port}`;
for(const origin of [apiOrigin,appOrigin])assert.equal(new URL(origin).hostname,'127.0.0.1');
const env={...process.env,NODE_ENV:'production',KINNSO_ENVIRONMENT:'local',KINNSO_SITE_URL:appOrigin,KINNSO_SUPABASE_URL:apiOrigin,KINNSO_APPROVED_SUPABASE_ORIGIN:apiOrigin,KINNSO_LEGACY_AUTH_ORIGIN:apiOrigin,KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',KINNSO_ENABLED_CAPABILITIES:'',KINNSO_SYNTHETIC_RUN:'true'};
for(const key of ['KINNSO_SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'])delete env[key];
const child=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:app,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs='',browser;child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
const output=path.join(root,'.local-private/single-origin/destinations-preview');await mkdir(output,{recursive:true});
const checks=[],blockedExternal=[];
try{
 let ready=false;for(let attempt=0;attempt<80;attempt++){
  if(child.exitCode!==null)throw Error('Preview exited before becoming ready');
  if(logs.includes('Ready in')){ready=true;break;}
  try{const response=await fetch(appOrigin+'/robots.txt');if(response.ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 assert.ok(ready,'Preview did not start');
 browser=await chromium.launch({headless:true,channel:process.env.KINNSO_BROWSER_CHANNEL??'msedge'});
 const axePath=path.join(app,'scripts/accessibility/node_modules/axe-core/axe.min.js');
 await access(axePath);
 for(const viewport of [{width:390,height:844},{width:1280,height:900}])for(const javaScriptEnabled of [false,true]){
  const context=await browser.newContext({javaScriptEnabled,viewport,baseURL:appOrigin});
  await context.route('**/*',route=>{
   const origin=new URL(route.request().url()).origin;
   if(origin===appOrigin||origin===apiOrigin)return route.continue();
   blockedExternal.push(route.request().url());
   return route.abort();
  });
  const page=await context.newPage();
  const auditCurrent=async()=>{
   if(!javaScriptEnabled)return;
   await page.addScriptTag({path:axePath});
   const audit=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
   assert.deepEqual(audit.violations.map(value=>value.id),[],JSON.stringify(audit.violations.map(value=>({id:value.id,nodes:value.nodes.map(node=>node.target)}))));
  };
  try{
   for(const locale of locales){
    const response=await page.goto(`/${locale}/destinations`);assert.equal(response?.status(),200);
    assert.equal(await page.locator('html').getAttribute('lang'),locale);
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    assert.equal(await page.locator(`a[href="/${locale}/destinations/tokyo"]`).count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await auditCurrent();
    await page.goto(`/${locale}/destinations/tokyo`);
    await expect(page.getByRole('heading',{name:'Tokyo',exact:true})).toBeVisible();
    for(const href of [`/${locale}/g/${guideId}`,`/${locale}/experiences/city-walk`,`/${locale}/articles/destinations/tokyo-story`,`/${locale}/sessions/fixture-session`])assert.equal(await page.locator(`a[href="${href}"]`).count(),1,href);
    await page.locator(`a[href="/${locale}/g/${guideId}"]`).focus();await expect(page.locator(`a[href="/${locale}/g/${guideId}"]`)).toBeFocused();
    await auditCurrent();
    await page.goto(`/${locale}/g/${guideId}`);await expect(page.getByRole('heading',{name:'Authored guide',exact:true})).toBeVisible();assert.equal(await page.locator(`a[href="/${locale}/c/fixture-creator"]`).count(),1);await auditCurrent();
    await page.goto(`/${locale}/experiences/city-walk`);await expect(page.getByRole('heading',{name:'Authored experience',exact:true})).toBeVisible();assert.equal(await page.locator(`a[href="/${locale}/m/fixture-merchant"]`).count(),2);await auditCurrent();
    await page.goto(`/${locale}/m/fixture-merchant`);await expect(page.getByRole('heading',{name:'Authored merchant',exact:true})).toBeVisible();assert.equal(await page.locator(`a[href="/${locale}/experiences/city-walk"]`).count(),1);await auditCurrent();
    await page.goto(`/${locale}/sessions/fixture-session`);await expect(page.getByRole('heading',{name:'Authored session',exact:true})).toBeVisible();assert.equal(await page.locator(`a[href="/${locale}/c/fixture-creator"]`).count(),1);await auditCurrent();
    await page.goto(`/${locale}/c/fixture-creator`);await expect(page.getByRole('heading',{name:'Authored creator',exact:true})).toBeVisible();await auditCurrent();
    await page.goto(`/${locale}/articles/destinations/tokyo-story`);await expect(page.getByRole('heading',{name:'Authored article',exact:true})).toBeVisible();assert.equal(await page.locator(`a[href="/${locale}/c/fixture-author"]`).count(),0);await auditCurrent();
    assert.equal(await page.locator('a[href*="remix-kinnso-web"]').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    checks.push({locale,javaScriptEnabled,viewportWidth:viewport.width,destination:true,related:true,attribution:true,canonicalLinks:true,mobileOverflow:false});
   }
   await page.goto('/ja/destinations/service-error');assert.equal(await page.getByRole('alert').count(),1);
   await page.goto('/ja/destinations/missing');assert.equal(await page.locator('main [role="alert"]').count(),0);
  }finally{await context.close();}
 }
 assert.deepEqual(blockedExternal,[]);
 await writeFile(path.join(output,'result.json'),JSON.stringify({kind:'LOCAL_FIXTURE_UI_ONLY',checks,blockedExternal,productionChanged:false},null,2));
 console.log(JSON.stringify({kind:'LOCAL_FIXTURE_UI_ONLY',passed:checks.length,productionChanged:false}));
}finally{
 await browser?.close();
 child.kill();
 await new Promise(resolve=>backend.close(resolve));
 await writeFile(path.join(output,'server.log'),logs);
}
