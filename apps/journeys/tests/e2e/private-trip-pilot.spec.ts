import {test,expect,type Page,type Browser,type BrowserContext} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

const target=verifyTestTarget();
const planner='http://127.0.0.1:3481',web='http://127.0.0.1:3482';
const admin=createClient(target.apiOrigin,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const runId=randomUUID(),evidence=process.env.KINNSO_PILOT_EVIDENCE;
type Actor={id:string;email:string;password:string};
type Guide={id:string;slug:string;title:string};
const owned={runId,browserVersion:'',users:[] as Actor[],guides:[] as Guide[],guideIds:[] as string[],merchantId:randomUUID(),experienceId:randomUUID(),tripId:'',blockedExternal:[] as {host:string;path:string}[]};
let author:Actor,traveller:Actor,other:Actor,authorContext:BrowserContext,authorPage:Page;
const write=()=>{if(evidence)writeFileSync(path.join(evidence,'browser-fixtures-private.json'),JSON.stringify(owned,null,2)+'\n')};
const checked=<T,>(value:{data:T;error:unknown})=>{expect(value.error).toBeNull();return value.data};
async function actor(){
 const entry={id:'',email:`synthetic-private-trip-${runId}-${owned.users.length}@example.test`,password:'Pilot!'+randomUUID()};
 owned.users.push(entry);write();
 const result=await admin.auth.admin.createUser({email:entry.email,password:entry.password,email_confirm:true});
 expect(result.error).toBeNull();entry.id=result.data.user!.id;write();return entry;
}
async function context(browser:Browser,viewport={width:1280,height:900}){
 const result=await browser.newContext({viewport});
 await result.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)){
   owned.blockedExternal.push({host:url.hostname,path:url.pathname});write();return route.abort('blockedbyclient');
  }
  return route.continue();
 });
 return result;
}
async function signIn(page:Page,owner:Actor,next:string,origin=planner){
 await page.goto(origin+'/en/sign-in?next='+encodeURIComponent(next));
 await page.getByLabel(origin===web?'Email address':'Email',{exact:true}).fill(owner.email);
 await page.getByLabel('Password',{exact:true}).fill(owner.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL(origin+next);
}
async function snapshot(page:Page,id=owned.tripId){
 const response=await page.request.get(planner+'/api/trips/'+id);
 expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toContain('private, no-store');
 return (await response.json()).data;
}
async function creatorGuide(index:number){
 await authorPage.goto(planner+'/en/studio/guides/new');
 const editor=authorPage.getByTestId('creator-editor'),title=`Synthetic Kyoto pilot ${index} ${runId.slice(0,8)}`;
 await editor.getByLabel('Guide title',{exact:true}).fill(title);
 await editor.getByLabel('Destination',{exact:true}).fill('Kyoto');
 await editor.getByLabel('Summary',{exact:true}).fill('Synthetic authored route for isolated regression. This is not licensed pilot content.');
 await editor.getByLabel('Day title',{exact:true}).fill('Synthetic Kyoto day '+index);
 await editor.getByLabel('Stop title',{exact:true}).fill('Synthetic first stop '+index);
 await editor.getByLabel('Public description',{exact:true}).fill('Synthetic public instructions '+index);
 await editor.getByRole('button',{name:'Add stop',exact:true}).click();
 await editor.getByLabel('Stop title',{exact:true}).nth(1).fill('Synthetic second stop '+index);
 await editor.getByLabel('Public description',{exact:true}).nth(1).fill('Synthetic second public instructions '+index);
 await expect(editor.getByRole('button',{name:'Publish structured version',exact:true})).toBeEnabled();
 const published=authorPage.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/publish')&&response.request().method()==='POST');
 await editor.getByRole('button',{name:'Publish structured version',exact:true}).click();
 const response=await published;expect(response.status()).toBe(200);
 const data=(await response.json()).data,snapshot=data.snapshot;
 expect(snapshot.kind).toBe('itinerary');expect(snapshot.days[0].stops).toHaveLength(2);
 const id=snapshot.id;
 const row=checked(await admin.from('guides').select('id,slug,title').eq('id',id).eq('creator_id',author.id).single())!;
 owned.guides.push(row);write();
}
test.describe.serial('isolated private-trip pilot',()=>{
 test.beforeAll(async({browser})=>{
  test.setTimeout(120000);owned.browserVersion=browser.version();write();author=await actor();traveller=await actor();other=await actor();
  authorContext=await context(browser);authorPage=await authorContext.newPage();
  authorPage.on('request',request=>{
   const match=new URL(request.url()).pathname.match(/^\/api\/creator\/guides\/([0-9a-f-]{36})$/);
   if(request.method()==='PUT'&&match&&!owned.guideIds.includes(match[1])){owned.guideIds.push(match[1]);write()}
  });
  await signIn(authorPage,author,'/en/studio');
  const bio=authorPage.getByLabel('Bio',{exact:true});
  await expect(bio.or(authorPage.getByRole('link',{name:'Create guide',exact:true})).first()).toBeVisible();
  if(await bio.isVisible()){
   await bio.fill('Synthetic creator profile for isolated browser regression.');
   await authorPage.getByLabel('Interests (comma separated)',{exact:true}).fill('travel');
   await authorPage.getByLabel('Content themes (comma separated)',{exact:true}).fill('walking');
   await authorPage.getByLabel('Tone (comma separated)',{exact:true}).fill('practical');
   await authorPage.getByLabel('Languages (comma separated)',{exact:true}).fill('en');
   await authorPage.getByRole('checkbox',{name:'I have reviewed this profile and confirm publication.',exact:true}).check();
   await authorPage.getByRole('button',{name:'Confirm creator profile',exact:true}).click();
  }
  await expect(authorPage.getByRole('link',{name:'Create guide',exact:true})).toBeVisible();
  for(let index=1;index<=3;index++)await creatorGuide(index);
  const merchant=await actor();
  checked(await admin.from('merchant_profiles').insert({id:owned.merchantId,user_id:merchant.id,company_name:'Synthetic pilot merchant '+runId.slice(0,8),contact_email:merchant.email,slug:'synthetic-pilot-'+runId,status:'active'}));
  checked(await admin.from('experiences').insert({id:owned.experienceId,merchant_profile_id:owned.merchantId,slug:'synthetic-pilot-'+runId,title:'Synthetic pilot experience '+runId.slice(0,8),summary:'Synthetic local experience',city:'Kyoto',status:'published',published_at:new Date().toISOString(),price_amount:0,currency:'HKD'}));
 });
 test.afterAll(async()=>{
  await authorContext?.close();
  if(owned.experienceId)expect((await admin.from('experiences').delete().eq('id',owned.experienceId).eq('merchant_profile_id',owned.merchantId)).error).toBeNull();
  if(owned.merchantId)expect((await admin.from('merchant_profiles').delete().eq('id',owned.merchantId)).error).toBeNull();
  for(const id of owned.guideIds)expect((await admin.from('guides').delete().eq('id',id).eq('creator_id',author.id)).error).toBeNull();
  for(const row of owned.users)if(row.id)expect((await admin.auth.admin.deleteUser(row.id)).error).toBeNull();
  if(evidence)writeFileSync(path.join(evidence,'browser-cleanup.json'),JSON.stringify({at:new Date().toISOString(),runId,removedUserIds:owned.users.map(row=>row.id).filter(Boolean),removedGuideIds:owned.guideIds,merchantId:owned.merchantId,experienceId:owned.experienceId},null,2)+'\n');
 });

 test('search, bookmark, sign in, create a trip and return to explicit preview before adopting',async({browser})=>{
  const ctx=await context(browser),page=await ctx.newPage(),guide=owned.guides[0];
  try{
   await page.goto(planner+'/en/explore');
   await page.getByLabel('Destination or interest',{exact:true}).fill(guide.title);
   await page.getByRole('button',{name:'Find guides',exact:true}).click();
   await page.getByRole('link',{name:guide.title,exact:true}).click();
   await page.getByRole('button',{name:'Bookmark guide',exact:true}).click();
   await page.getByLabel('Email',{exact:true}).fill(traveller.email);await page.getByLabel('Password',{exact:true}).fill(traveller.password);
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible();
   await page.goto(planner+'/en/saved');await page.getByRole('link',{name:guide.title,exact:true}).click();
   await page.getByRole('link',{name:'Create a trip first',exact:true}).click();
   await page.waitForURL(url=>url.origin===planner&&url.pathname==='/en/trips'&&url.searchParams.has('next'));
   expect(new URL(page.url()).searchParams.get('next')).toContain('/en/g/'+guide.id+'?adopt=1');
   await page.getByLabel('Trip title',{exact:true}).fill('My synthetic Kyoto itinerary');
   await page.getByLabel('Start date (optional)',{exact:true}).fill('2026-11-01');
   await page.getByLabel('Time zone',{exact:true}).fill('Asia/Tokyo');
   await page.getByRole('button',{name:'Create trip',exact:true}).click();
   await expect(page.getByTestId('adoption-preview')).toBeVisible();
   await expect(page.getByTestId('adoption-preview')).toContainText('Synthetic first stop 1');
   const tripId=new URL(page.url()).searchParams.get('trip')!;owned.tripId=tripId;write();
   expect((await snapshot(page,tripId)).days).toHaveLength(0);
   await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();
   await page.waitForURL(planner+'/en/trips/'+tripId);
   await expect(page.getByLabel('Private note',{exact:true}).first()).toHaveValue('');
   await page.getByLabel('Start date (optional)',{exact:true}).fill('2026-11-03');
   await page.getByRole('button',{name:'Save trip details',exact:true}).click();
   await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
   await page.getByLabel('Stop title',{exact:true}).first().fill('My edited Kyoto stop');
   await page.getByLabel('Private note',{exact:true}).first().fill('My private Kyoto note');
   await page.getByRole('button',{name:'Save stop',exact:true}).first().click();
   await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
   const saved=await snapshot(page);expect(saved.days).toHaveLength(1);expect(saved.days[0].stops).toHaveLength(2);
   expect(saved.startDate).toBe('2026-11-03');expect(saved.days[0].stops[0].title).toBe('My edited Kyoto stop');expect(saved.days[0].stops[0].travellerNote).toBe('My private Kyoto note');
  }finally{if(!page.isClosed())await ctx.close()}
 });
 test('a fresh mobile browser session reads the complete edited trip and another owner is refused',async({browser})=>{
  const ctx=await context(browser,{width:375,height:812}),page=await ctx.newPage();
  try{
   await signIn(page,traveller,'/en/trips/'+owned.tripId);
   await expect(page.getByLabel('Start date (optional)',{exact:true})).toHaveValue('2026-11-03');
   await expect(page.getByLabel('Stop title',{exact:true}).first()).toHaveValue('My edited Kyoto stop');
   await expect(page.getByLabel('Private note',{exact:true}).first()).toHaveValue('My private Kyoto note');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
   if(evidence)await page.screenshot({path:path.join(evidence,'mobile-private-trip.png'),fullPage:true});
   await page.goto(planner+'/en/me');await page.getByRole('button',{name:'Sign out',exact:true}).click();
   await page.waitForURL(url=>url.pathname==='/en/sign-in');
   await signIn(page,other,'/en/trips');
   expect((await page.request.get(planner+'/api/trips/'+owned.tripId)).status()).toBe(404);
   const writeAttempt=await page.request.post(planner+'/api/trips/'+owned.tripId+'/commands',{headers:{Origin:planner},data:{expectedRevision:4,requestId:randomUUID(),command:{type:'patchTrip',patch:{title:'Forbidden change'}}}});
   expect(writeAttempt.status()).toBe(404);
   await expect(page.getByText('My private Kyoto note',{exact:true})).toHaveCount(0);
  }finally{if(!page.isClosed())await ctx.close()}
 });
 test('an adoption committed before a lost response survives reload and replays its original identity once',async({browser})=>{
  const ctx=await context(browser),page=await ctx.newPage(),guide=owned.guides[1],commands:Record<string,unknown>[]=[];
  try{
   await signIn(page,traveller,`/en/g/${guide.id}?adopt=1&trip=${owned.tripId}`);
   const before=await snapshot(page);
   let interrupted=false;
   await page.route('**/api/trips/'+owned.tripId+'/adopt',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    commands.push(route.request().postDataJSON());
    if(!interrupted){interrupted=true;const reply=await route.fetch();expect(reply.status()).toBe(200);return route.abort('connectionfailed')}
    return route.continue();
   });
   await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();
   await expect(page.getByRole('status',{name:'Guide action status'})).toContainText('Application was not confirmed');
   const committed=await snapshot(page);expect(committed.days).toHaveLength(before.days.length+1);
   await page.reload();await expect(page.getByRole('button',{name:'Retry original application',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Retry original application',exact:true}).click();
   await page.waitForURL(planner+'/en/trips/'+owned.tripId);
   expect(commands).toHaveLength(2);expect(commands[1]).toEqual(commands[0]);
   const restored=await snapshot(page);expect(restored.revision).toBe(committed.revision);expect(restored.days).toHaveLength(committed.days.length);
   expect(restored.days[0].stops[0].travellerNote).toBe('My private Kyoto note');
  }finally{if(!page.isClosed())await ctx.close()}
 });
 test('logout and author withdrawal retain the original receipt and all private copies',async({browser})=>{
  const ctx=await context(browser),page=await ctx.newPage(),guide=owned.guides[2],commands:Record<string,unknown>[]=[];
  try{
   await signIn(page,traveller,`/en/g/${guide.id}?adopt=1&trip=${owned.tripId}`);
   let interrupted=false;
   await page.route('**/api/trips/'+owned.tripId+'/adopt',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    commands.push(route.request().postDataJSON());
    if(!interrupted){interrupted=true;const response=await route.fetch();expect(response.status()).toBe(200);return route.abort('connectionfailed')}
    return route.continue();
   });
   await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();
   await expect(page.getByRole('status',{name:'Guide action status'})).toContainText('Application was not confirmed');
   const committed=await snapshot(page);
   await page.goto(planner+'/en/trips/'+owned.tripId);
   const copiedStop=committed.days.reduce((count:number,day:{stops:unknown[]})=>count+day.stops.length,0)-2;
   await page.getByLabel('Stop title',{exact:true}).nth(copiedStop).fill('My edited third-guide stop');
   await page.getByLabel('Private note',{exact:true}).nth(copiedStop).fill('My third-guide private note');
   await page.getByRole('button',{name:'Save stop',exact:true}).nth(copiedStop).click();
   await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
   await authorPage.goto(planner+'/en/studio/guides/'+guide.id+'/edit');
   await authorPage.getByRole('button',{name:'Withdraw adoption',exact:true}).click();
   await expect(authorPage.getByRole('status').filter({hasText:'New adoptions withdrawn'})).toBeVisible();
   await page.goto(planner+'/en/me');await page.getByRole('button',{name:'Sign out',exact:true}).click();
   await page.waitForURL(url=>url.pathname==='/en/sign-in');
   await signIn(page,traveller,'/en/trips');
   await page.getByRole('button',{name:'Retry original application',exact:true}).click();
   await page.waitForURL(planner+'/en/trips/'+owned.tripId);
   expect(commands).toHaveLength(2);expect(commands[1]).toEqual(commands[0]);
   const after=await snapshot(page);
   expect(after.days).toHaveLength(committed.days.length);expect(after.days.at(-1).stops[0].source.withdrawn).toBe(true);
   expect(after.days.at(-1).stops[0].title).toBe('My edited third-guide stop');
   expect(after.days.at(-1).stops[0].travellerNote).toBe('My third-guide private note');
   expect(after.days.at(-1).stops[0].sourceDescription).toBe('Synthetic public instructions 3');
   expect(after.days[0].stops[0].travellerNote).toBe('My private Kyoto note');
   const refused=await page.request.post(planner+'/api/trips/'+owned.tripId+'/adopt',{headers:{Origin:planner},data:{guideId:guide.id,version:1,expectedRevision:after.revision,requestId:randomUUID()}});
   expect(refused.status()).toBe(400);expect((await snapshot(page)).revision).toBe(after.revision);
  }finally{if(!page.isClosed())await ctx.close()}
 });
 test('the web saved guide opens the approved planner and source links reach experience and merchant with booking off',async({browser})=>{
  const ctx=await context(browser,{width:375,height:812}),page=await ctx.newPage(),guide=owned.guides[0],events:{phase:string}[]=[];
  try{
   await ctx.addInitScript(()=>{
    localStorage.setItem('kinnso.analytics.consent.v1','accepted');
    localStorage.setItem('kinnso.analytics.consent-version.v1','v1:'+(Date.now()+3600000));
    localStorage.setItem('kinnso.analytics.journey.v1',crypto.randomUUID());
   });
   page.on('request',request=>{if(new URL(request.url()).pathname==='/api/pilot'&&request.method()==='POST')events.push(request.postDataJSON())});
   await signIn(page,traveller,'/en/trips',web);
   const savedCard=page.locator('a[href="/en/g/'+guide.slug+'"]');
   await expect(savedCard).toBeVisible();
   await expect(page.getByRole('link',{name:guide.title,exact:true})).toHaveAttribute('href','/en/g/'+guide.slug);
   if(evidence)writeFileSync(path.join(evidence,'saved-card-accessibility.txt'),await savedCard.ariaSnapshot());
   await savedCard.getByRole('heading',{name:guide.title,exact:true}).click();
   await page.waitForURL(web+'/en/g/'+guide.slug);
   const plan=page.getByRole('link',{name:'Plan from this guide',exact:true});
   await expect(plan).toHaveAttribute('href',new RegExp('^'+planner+'/en/g/'+guide.id+'\\?adopt=1&flow='));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
   if(evidence)await page.screenshot({path:path.join(evidence,'mobile-web-guide.png'),fullPage:true});
   const experience=page.getByRole('link',{name:new RegExp('Synthetic pilot experience')});
   await experience.click();await page.waitForURL(new RegExp('/en/experiences/synthetic-pilot-'+runId));
   await expect(page.getByRole('button',{name:'Get notified when booking opens',exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:/book now/i})).toHaveCount(0);
   await expect(page.getByLabel('Choose a date',{exact:true})).toHaveCount(0);
   await expect.poll(()=>events.some(event=>event.phase==='experience_referral')).toBe(true);
   const merchant=page.getByRole('link',{name:'Synthetic pilot merchant '+runId.slice(0,8),exact:true});
   await expect(merchant).toHaveAttribute('href',new RegExp('/en/m/synthetic-pilot-'+runId+'\\?src=guide&guideSlug='));
   await merchant.click();await page.waitForURL(new RegExp('/en/m/synthetic-pilot-'+runId));
   await expect.poll(()=>events.some(event=>event.phase==='merchant_referral')).toBe(true);
   expect(events.some(event=>event.phase==='guide_viewed')).toBe(true);
   await page.goto(web+'/en/g/'+guide.slug);
   await page.getByRole('link',{name:'Plan from this guide',exact:true}).click();
   await page.waitForURL(new RegExp('^'+planner+'/en/g/'+guide.id+'\\?adopt=1'));
   await expect(page.getByRole('heading',{name:guide.title,exact:true})).toBeVisible();
   checked(await admin.from('experiences').update({status:'draft'}).eq('id',owned.experienceId).eq('merchant_profile_id',owned.merchantId));
   const missing=await page.request.get(web+'/en/experiences/synthetic-pilot-'+runId);expect(missing.status()).toBe(404);
   const guidePage=await page.request.get(web+'/en/g/'+guide.slug);expect(await guidePage.text()).not.toContain('/en/experiences/synthetic-pilot-'+runId);
  }finally{if(!page.isClosed())await ctx.close()}
 });
});
