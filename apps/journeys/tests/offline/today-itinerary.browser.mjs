import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {offlineTripHost,actorA} from '../helpers/offline-trip-host.mjs';
const {chromium,expect}=createRequire(import.meta.url)('@playwright/test');
const tripId='44444444-4444-4444-8444-444444444444';
const dayOne='55555555-5555-4555-8555-555555555555';
const dayTwo='66666666-6666-4666-8666-666666666666';
const placeId='77777777-7777-4777-8777-777777777777';
const stopId='88888888-8888-4888-8888-888888888888';
function snapshot() {
 return {id:tripId,title:'Synthetic saved trip',timezone:'Asia/Hong_Kong',startDate:'2026-10-18',
  destinationId:null,status:'planning',revision:7,media:[],days:[
   {id:dayOne,offset:0,title:'First day',stops:[]},
   {id:dayTwo,offset:1,title:'Harbour day',stops:[
    {id:'99999999-9999-4999-8999-999999999999',position:1,title:'Later stop',placeId:null,
     travellerNote:'private late note',startMinuteOfDay:660,durationMinutes:30,source:null},
    {id:stopId,position:0,title:'Morning stop',placeId,
     travellerNote:'private note never sent to maps',startMinuteOfDay:545,durationMinutes:45,source:null},
   ]},
  ]};
}
async function withPage(locale,run) {
 const host=await offlineTripHost();let browser;
 try{
  host.trips.set(tripId,{owner:actorA,value:snapshot()});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({baseURL:host.origin,timezoneId:'America/New_York',
   viewport:locale==='en'?{width:1280,height:900}:{width:390,height:844}});
  const external=[];
  await context.route('**/*',route=>{
   if(new URL(route.request().url()).origin===host.origin)return route.continue();
   external.push(route.request().url());return route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  await page.clock.install({time:new Date('2026-10-18T16:01:00Z')});
  await page.request.get('/__session?actor='+actorA);
  await page.route('**/api/trips/*/locations?*',route=>route.fulfill({
   status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{
    tripId,dayId:dayTwo,revision:7,places:[{placeId,name:'Canonical harbour',
     address:'Synthetic address',lat:22.3193,lng:114.1694,privateExtra:'never export'}],
   }}),
  }));
  await run({host,page,context,external});
  await context.close();
 }finally{await browser?.close();await host.close()}
}
test('NEXT-01 mocked transport / real React: saved trip reads today in the trip timezone without saving',{timeout:45000},async()=>{
 await withPage('en',async({host,page})=>{
  await page.goto('/en/trips/'+tripId+'#today');
  const today=page.getByRole('region',{name:"Today's itinerary",exact:true});
  await expect(today).toBeVisible({timeout:3000});
  await expect(today).toContainText('2026-10-19');
  await expect(today).toContainText('Asia/Hong_Kong');
  await expect(today.getByLabel('Day to read',{exact:true})).toHaveValue(dayTwo);
  await expect(today.locator('[data-stop-id]').first()).toHaveAttribute('data-stop-id',stopId);
  await expect(today).toContainText('09:05');
  await expect(today).toContainText('11:00');
  await page.reload();
  await expect(today.getByLabel('Day to read',{exact:true})).toHaveValue(dayTwo);
  assert.equal(host.requests.filter(row=>row.path.startsWith('/api/trips')&&row.method==='POST').length,0);
  assert.equal(host.trips.get(tripId).value.revision,7);
 });
});
test('NEXT-02 mocked transport / real React: undated, empty and midnight states never guess a day',{timeout:45000},async()=>{
 await withPage('zh-HK',async({host,page})=>{
  const value=host.trips.get(tripId).value;
  value.startDate=null;
  await page.goto('/zh-HK/trips/'+tripId+'#today');
  const today=page.getByRole('region',{name:'今日行程',exact:true});
  await expect(today).toBeVisible({timeout:3000});
  await expect(today.getByLabel('閱讀日期',{exact:true})).toHaveValue('');
  await expect(today).toContainText('未設定日期');
  await today.getByLabel('閱讀日期',{exact:true}).selectOption(dayOne);
  await expect(today).toContainText('這一天未有站點');
  value.startDate='2026-10-18';
  await page.reload();
  await expect(today.getByLabel('閱讀日期',{exact:true})).toHaveValue(dayTwo);
  await page.clock.setSystemTime(new Date('2026-10-19T16:01:00Z'));
  await page.clock.runFor(30000);
  await expect(today.getByLabel('閱讀日期',{exact:true})).toHaveValue('');
  await expect(today).toContainText('今日未有安排');
  assert.equal(host.requests.filter(row=>row.path.startsWith('/api/trips')&&row.method==='POST').length,0);
 });
});
test('NEXT-03 mocked transport / real React: explicit navigation uses canonical coordinates only',{timeout:45000},async()=>{
 await withPage('en',async({page,context,external})=>{
  await page.goto('/en/trips/'+tripId+'#today');
  const today=page.getByRole('region',{name:"Today's itinerary",exact:true});
  await expect(today).toBeVisible({timeout:3000});
  const stop=today.locator('[data-stop-id="'+stopId+'"]');
  const navigation=stop.getByRole('link',{name:'Open navigation',exact:true});
  await expect(navigation).toHaveAttribute('href','https://www.google.com/maps/dir/?api=1&destination=22.3193%2C114.1694');
  await expect(navigation).toHaveAttribute('rel','noopener noreferrer');
  await expect(today.locator('[data-stop-id]').nth(1)).toContainText('Location unavailable');
  const popup=context.waitForEvent('page');
  await navigation.click();const opened=await popup;
  await expect.poll(()=>external.length).toBe(1);
  await opened.close();
  assert.equal(new URL(external[0]).searchParams.get('destination'),'22.3193,114.1694');
  assert.equal(external[0].includes('private'),false);
  assert.equal(external[0].includes('Synthetic'),false);
 });
});
