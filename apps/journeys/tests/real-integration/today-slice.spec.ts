import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {openFixture} from './fixture.mjs';
import {expected} from './target.mjs';

let fixture:any;
let knownPlace:string,unknownPlace:string;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
 fixture=await openFixture();
 knownPlace=await fixture.rpc(fixture.actors.A,'upsert_place',{
  p_name:'Synthetic navigation '+fixture.runId,p_timezone:'Asia/Hong_Kong',
  p_formatted_address:'Synthetic canonical harbour address',p_country_code:'HK',
  p_lat:22.3193,p_lng:114.1694,p_provider:'manual',p_provider_place_id:'today-known-'+fixture.runId,
 });
 fixture.recordDiagnostic('TODAY_PLACES',{placeIds:[knownPlace]});
 unknownPlace=await fixture.rpc(fixture.actors.A,'upsert_place',{
  p_name:'Synthetic missing coordinates '+fixture.runId,p_timezone:'Asia/Hong_Kong',
  p_formatted_address:null,p_lat:null,p_lng:null,p_provider:'manual',
  p_provider_place_id:'today-unknown-'+fixture.runId,
 });
 fixture.recordDiagnostic('TODAY_PLACES',{placeIds:[knownPlace,unknownPlace]});
});
test.afterAll(async()=>{fixture?.write()});

async function signIn(page:Page,locale:string,next:string,actor=fixture.actors.A){
 await page.goto(expected.appOrigin+'/'+locale+'/sign-in?next='+encodeURIComponent(next));
 await page.getByLabel(locale==='en'?'Email':'電郵',{exact:true}).fill(actor.email);
 const binding='credential_'+randomUUID().replaceAll('-','');let available=true;
 await page.exposeBinding(binding,({frame})=>{
  const url=new URL(frame.url());
  if(!available||url.origin!==expected.appOrigin||url.pathname!==`/${locale}/sign-in`)
   throw Error('CREDENTIAL_BINDING_CLOSED');
  available=false;return actor.credential;
 });
 await page.evaluate(async name=>{
  const input=document.querySelector('input[type="password"]') as HTMLInputElement|null;
  if(!input)throw Error('SIGN_IN_CONTROL_MISSING');
  const read=(window as unknown as Record<string,()=>Promise<string>>)[name];
  input.value=await read();input.dispatchEvent(new Event('input',{bubbles:true}));
 },binding);
 await page.getByRole('button',{name:locale==='en'?'Sign in':'登入',exact:true}).click();
 await page.waitForURL(expected.appOrigin+next);
}
async function contextFor(browser:Browser,viewport:{width:number;height:number}){
 const context=await browser.newContext({baseURL:expected.appOrigin,viewport,
  timezoneId:'America/New_York',serviceWorkers:'block'});
 const maps:string[]=[];
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if([expected.appOrigin,expected.apiOrigin].includes(url.origin))return route.continue();
  if(url.origin==='https://www.google.com'&&url.pathname==='/maps/dir/')maps.push(url.href);
  return route.abort('blockedbyclient');
 });
 return{context,maps};
}
async function addDay(snapshot:any,offset:number,title:string,stops:boolean){
 const dayId=randomUUID(),requestId=randomUUID();
 fixture.registerRequest('A',requestId,'edit');
 snapshot=await fixture.rpc(fixture.actors.A,'apply_trip_command',{
  p_trip_id:snapshot.id,p_expected_revision:snapshot.revision,p_request_id:requestId,
  p_command:{type:'addDay',id:dayId,offset,title},
 });
 const ids:string[]=[];
 if(stops)for(const [position,placeId] of [knownPlace,unknownPlace].entries()){
  const id=randomUUID(),request=randomUUID();ids.push(id);
  fixture.registerRequest('A',request,'edit');
  snapshot=await fixture.rpc(fixture.actors.A,'apply_trip_command',{
   p_trip_id:snapshot.id,p_expected_revision:snapshot.revision,p_request_id:request,
   p_command:{type:'addStop',id,dayId,position,input:{
    title:position===0?'Synthetic morning stop':'Synthetic later stop',placeId,
    travellerNote:'Synthetic private note never sent to navigation',
    startMinuteOfDay:position===0?545:660,durationMinutes:30,
   }},
  });
 }
 return{snapshot,dayId,ids};
}
for(const locale of ['en','zh-HK'])for(const [size,viewport] of Object.entries({
 desktop:{width:1280,height:900},mobile:{width:390,height:844},
})){
 test(`real isolated target TODAY_SLICE_4 ${locale}/${size}`,async({browser})=>{
  const text=(en:string,zh:string)=>locale==='en'?en:zh;
  const title='Synthetic today '+locale+' '+size;
  const created=await fixture.create(fixture.actors.A,{title,timezone:'Asia/Hong_Kong',startDate:'2026-10-18'});
  const first=await addDay(created.value,0,'Synthetic first day',false);
  const second=await addDay(first.snapshot,1,'Synthetic harbour day',true);
  const undated=await fixture.create(fixture.actors.A,{title:'Synthetic undated '+locale+' '+size,
   timezone:'Asia/Hong_Kong',startDate:null});
  const empty=await addDay(undated.value,0,'Synthetic empty day',false);
  const privateBefore=await fixture.snapshot(fixture.actors.A,created.value.id);
  let context:BrowserContext|undefined;
  const posts:string[]=[];
  const track=(page:Page)=>page.on('request',request=>{
   if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/trips'))
    posts.push(new URL(request.url()).pathname);
  });
  try{
   const initial=await contextFor(browser,viewport);context=initial.context;
   let page=await context.newPage();track(page);
   await page.clock.install({time:new Date('2026-10-18T16:01:00Z')});
   await signIn(page,locale,`/${locale}/trips`);
   const row=page.locator('li').filter({has:page.getByRole('link',{name:title,exact:true})});
   await row.getByRole('link',{name:text("Today's itinerary",'今日行程'),exact:true}).click();
   const today=page.getByRole('region',{name:text("Today's itinerary",'今日行程'),exact:true});
   await expect(today).toBeVisible();
   await expect(today.getByLabel(text('Day to read','閱讀日期'),{exact:true})).toHaveValue(second.dayId);
   await expect(today).toContainText('2026-10-19');
   await expect(today).toContainText('Asia/Hong_Kong');
   await expect(today.locator('[data-stop-id]').first()).toHaveAttribute('data-stop-id',second.ids[0]);
   await expect(today).toContainText('09:05');
   await expect(today).toContainText('11:00');
   await expect(today).toContainText('Synthetic canonical harbour address');
   await page.reload();
   await expect(today.getByLabel(text('Day to read','閱讀日期'),{exact:true})).toHaveValue(second.dayId);
   await fixture.screenshot(page,'today-read-'+locale.toLowerCase()+'-'+size);

   const link=today.locator('[data-stop-id="'+second.ids[0]+'"]')
    .getByRole('link',{name:text('Open navigation','開啟導航'),exact:true});
   const destination='https://www.google.com/maps/dir/?api=1&destination=22.3193%2C114.1694';
   await expect(link).toHaveAttribute('href',destination);
   await expect(link).toHaveAttribute('rel','noopener noreferrer');
   await expect(today.locator('[data-stop-id="'+second.ids[1]+'"]')).toContainText(text('Location unavailable','地點資料未能提供'));
   const popupPromise=context.waitForEvent('page');await link.click();
   const popup=await popupPromise;
   await expect.poll(()=>initial.maps.length).toBe(1);
   expect(initial.maps[0]).toBe(destination);await popup.close();
   await fixture.screenshot(page,'today-navigation-'+locale.toLowerCase()+'-'+size);

   const response=await page.request.get(`/api/trips/${created.value.id}/locations?day=${second.dayId}`);
   expect(response.status()).toBe(200);
   expect(response.headers()['cache-control']).toBe('private, no-store');
   const body=await response.json();
   expect(body.data.revision).toBe(second.snapshot.revision);
   for(const place of body.data.places)
    expect(Object.keys(place).sort()).toEqual(['address','lat','lng','name','placeId']);
   const foreign=await contextFor(browser,viewport);
   let foreignStatus=0;
   try{
    const anonymous=await foreign.context.request.get(`/api/trips/${created.value.id}/locations?day=${second.dayId}`);
    expect(anonymous.status()).toBe(401);
    const foreignPage=await foreign.context.newPage();
    await foreignPage.clock.install({time:new Date('2026-10-18T16:01:00Z')});
    await signIn(foreignPage,locale,`/${locale}/trips`,fixture.actors.B);
    const denied=await foreign.context.request.get(`/api/trips/${created.value.id}/locations?day=${second.dayId}`);
    foreignStatus=denied.status();
    expect(foreignStatus).toBe(404);
    expect((await denied.json()).code).toBe('NOT_FOUND');
   }finally{await foreign.context.close()}
   const other=await fixture.actors.B.client.rpc('get_trip_snapshot',{p_trip_id:created.value.id});
   expect(other.error).not.toBeNull();
   const foreignRows=await fixture.actors.B.client.from('trip_stops').select('id').eq('trip_id',created.value.id);
   expect(foreignRows.error).toBeNull();expect(foreignRows.data).toEqual([]);

   await page.goto(`/${locale}/trips/${undated.value.id}#today`);
   const undatedRegion=page.getByRole('region',{name:text("Today's itinerary",'今日行程'),exact:true});
   await expect(undatedRegion.getByLabel(text('Day to read','閱讀日期'),{exact:true})).toHaveValue('');
   await expect(undatedRegion).toContainText(text('Dates are not set','未設定日期'));
   await undatedRegion.getByLabel(text('Day to read','閱讀日期'),{exact:true}).selectOption(empty.dayId);
   await expect(undatedRegion).toContainText(text('There are no stops on this day','這一天未有站點'));
   await fixture.screenshot(page,'today-undated-'+locale.toLowerCase()+'-'+size);

   await context.close();context=undefined;
   const reopened=await contextFor(browser,viewport);context=reopened.context;
   page=await context.newPage();track(page);
   await page.clock.install({time:new Date('2026-10-18T16:01:00Z')});
   await signIn(page,locale,`/${locale}/trips/${created.value.id}`);
   const restored=page.getByRole('region',{name:text("Today's itinerary",'今日行程'),exact:true});
   await expect(restored.getByLabel(text('Day to read','閱讀日期'),{exact:true})).toHaveValue(second.dayId);
   await expect(restored).toContainText('Synthetic canonical harbour address');
   await page.clock.setSystemTime(new Date('2026-10-18T15:59:00Z'));
   await page.clock.runFor(30000);
   await expect(restored.getByLabel(text('Day to read','閱讀日期'),{exact:true})).toHaveValue(first.dayId);
   await page.clock.setSystemTime(new Date('2026-10-18T16:01:00Z'));
   await page.clock.runFor(30000);
   await expect(restored.getByLabel(text('Day to read','閱讀日期'),{exact:true})).toHaveValue(second.dayId);
   expect(posts).toHaveLength(0);
   expect(await fixture.snapshot(fixture.actors.A,created.value.id)).toEqual(privateBefore);
   fixture.recordDiagnostic('TODAY_SLICE_CELL',{cell:locale+'/'+size,NEXT01:'PASS',NEXT02:'PASS',NEXT03:'PASS',
    savingPostCount:posts.length,correctTripTimezone:true,reloadAndRelogin:true,
    canonicalDestination:destination,externalProviderBlockedAfterHandoff:true,
    onlyAllowlistedPlaceFields:true,missingCoordinatesHonest:true,foreignApiStatus:foreignStatus,foreignRlsRows:0,
    remoteSnapshotUnchanged:true,canonicalPlaceIds:[knownPlace,unknownPlace]});
  }catch(error){throw fixture.safeFailure('TODAY_'+locale.replaceAll('-','_')+'_'+size,error)}
  finally{await context?.close()}
 });
}
