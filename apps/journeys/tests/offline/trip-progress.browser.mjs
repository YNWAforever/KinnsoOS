import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {progressHost,actorA,actorB,tripId,stops} from '../helpers/progress-host.mjs';
const {chromium,expect}=createRequire(import.meta.url)('@playwright/test');
const evidence=process.env.KINNSO_PROGRESS_MOCK_EVIDENCE;
const text=(locale,en,zh)=>locale==='en'?en:zh;
const region=(page,locale)=>page.getByRole('region',{name:text(locale,'Trip progress','行程進度'),exact:true});
const row=(page,id)=>page.locator('[data-stop-id="'+id+'"]');
async function capture(page,name){
 if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:evidence+'/'+name+'.png',fullPage:true})}
}
for(const locale of ['en','zh-HK'])for(const size of ['desktop','mobile']){
 test(`PROGRESS_CASE1 ${locale}/${size}: visited, skipped, undo and navigation keep the saved order`,{timeout:60000},async()=>{
  const server=await progressHost();let browser;
  try{
   browser=await chromium.launch({headless:true});const session=await server.connect(browser,locale,size);
   const {page,context,external}=session;
   await expect(region(page,locale)).toBeVisible({timeout:3000});
   await expect(row(page,stops[0])).toHaveAttribute('aria-current','step');
   const postsBefore=server.calls.filter(call=>call.method==='POST').length;
   const popup=context.waitForEvent('page');
   await row(page,stops[0]).getByRole('link',{name:text(locale,'Open navigation','開啟導航'),exact:true}).click();
   const opened=await popup;await expect.poll(()=>external.length).toBe(1);await opened.close();
   assert.equal(new URL(external[0]).searchParams.get('destination'),'22.3193,114.1694');
   assert.equal(server.calls.filter(call=>call.method==='POST').length,postsBefore);
   await row(page,stops[0]).getByRole('button',{name:text(locale,'Visited','已到訪'),exact:true}).click();
   await expect(row(page,stops[1])).toHaveAttribute('aria-current','step');
   await row(page,stops[1]).getByRole('button',{name:text(locale,'Skip','略過'),exact:true}).click();
   await expect(row(page,stops[2])).toHaveAttribute('aria-current','step');
   await expect(region(page,locale)).toContainText('2 / 3');
   await row(page,stops[0]).getByRole('button',{name:text(locale,'Undo','撤銷'),exact:true}).click();
   await expect(row(page,stops[0])).toHaveAttribute('aria-current','step');
   await expect(region(page,locale)).toContainText('1 / 3');
   assert.equal(server.host.requests.filter(call=>call.path.startsWith('/api/trips')&&call.method==='POST').length,0);
   assert.equal(server.host.trips.get(tripId).value.revision,7);
   assert.equal(server.host.trips.get(tripId).value.days[0].stops[0].travellerNote,'Original private note');
   await capture(page,'mock-progress-next-'+locale+'-'+size);
   await context.close();
  }finally{await browser?.close();await server.close()}
 });
 test(`PROGRESS_CASE2 ${locale}/${size}: reopen, denied owner, failed saves, same-key retry and stale progress`,{timeout:90000},async()=>{
  const server=await progressHost();let browser;
  try{
   browser=await chromium.launch({headless:true});let session=await server.connect(browser,locale,size);
   let {page}=session;
   await expect(region(page,locale)).toBeVisible({timeout:3000});
   const stale=await session.context.newPage();
   await stale.clock.install({time:new Date('2026-10-19T04:00:00Z')});
   await stale.goto('/'+locale+'/trips/'+tripId);
   await expect(region(stale,locale)).toContainText('0 / 3');
   server.faults.after=true;
   await row(page,stops[0]).getByRole('button',{name:text(locale,'Visited','已到訪'),exact:true}).click();
   await expect(region(page,locale)).toContainText(text(locale,'not confirmed','未能確認'));
   await expect(region(page,locale)).toContainText('0 / 3');
   const original=structuredClone(server.calls.filter(call=>call.method==='POST').at(-1).body);
   await region(page,locale).getByRole('button',{name:text(locale,'Retry original progress update','重試原進度操作'),exact:true}).click();
   await expect(region(page,locale)).toContainText('1 / 3');
   assert.deepEqual(server.calls.filter(call=>call.method==='POST').at(-1).body,original);
   assert.equal(server.snapshot(actorA).progressRevision,1);
   await row(stale,stops[1]).getByRole('button',{name:text(locale,'Skip','略過'),exact:true}).click();
   await expect(region(stale,locale)).toContainText(text(locale,'changed in another tab','其他分頁'));
   const conflict=structuredClone(server.calls.filter(call=>call.method==='POST').at(-1).body);
   await region(stale,locale).getByRole('button',{name:text(locale,'Load latest progress','載入最新進度'),exact:true}).click();
   await expect(region(stale,locale)).toContainText('1 / 3');
   await region(stale,locale).getByRole('button',{name:text(locale,'Retry original progress update','重試原進度操作'),exact:true}).click();
   await expect(region(stale,locale)).toContainText(text(locale,'changed in another tab','其他分頁'));
   assert.deepEqual(server.calls.filter(call=>call.method==='POST').at(-1).body,conflict);
   const beforeDiscard=server.calls.filter(call=>call.method==='POST').length;
   server.faults.read=true;
   await region(stale,locale).getByRole('button',{name:text(locale,'Dismiss pending update and use latest progress','放棄待確認操作並使用最新進度'),exact:true}).click();
   await expect(region(stale,locale)).toContainText(text(locale,'could not be loaded','未能載入進度'));
   await expect(region(stale,locale).getByRole('button',{name:text(locale,'Retry original progress update','重試原進度操作'),exact:true})).toBeVisible();
   await region(stale,locale).getByRole('button',{name:text(locale,'Dismiss pending update and use latest progress','放棄待確認操作並使用最新進度'),exact:true}).click();
   await expect(region(stale,locale).getByRole('button',{name:text(locale,'Retry original progress update','重試原進度操作'),exact:true})).toHaveCount(0);
   assert.equal(server.calls.filter(call=>call.method==='POST').length,beforeDiscard);
   await session.context.close();
   session=await server.connect(browser,locale,size);page=session.page;
   await expect(region(page,locale)).toContainText('1 / 3');
   await expect(row(page,stops[0]).getByRole('button',{name:text(locale,'Undo','撤銷'),exact:true})).toBeVisible();
   const denied=await server.connect(browser,locale,size,actorB);
   const foreign=await denied.page.evaluate(async id=>{
    const read=await fetch('/api/trips/'+id+'/progress');
    const write=await fetch('/api/trips/'+id+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({requestId:crypto.randomUUID(),expectedTripRevision:7,expectedProgressRevision:1,stopId:'33333333-3333-4333-8333-333333333333',state:'skipped'})});
    return[read.status,write.status];
   },tripId);
   assert.deepEqual(foreign,[404,404]);assert.equal(server.snapshot(actorA).progressRevision,1);
   await denied.context.close();
   server.faults.before=true;
   await row(page,stops[1]).getByRole('button',{name:text(locale,'Skip','略過'),exact:true}).click();
   await expect(region(page,locale)).toContainText(text(locale,'not confirmed','未能確認'));
   await expect(region(page,locale)).toContainText('1 / 3');
   await capture(page,'mock-progress-recovery-'+locale+'-'+size);
   await session.context.close();
  }finally{await browser?.close();await server.close()}
 });
 test(`PROGRESS_CASE3 ${locale}/${size}: completed day, undo, stable IDs, removed stops and empty day`,{timeout:60000},async()=>{
  const server=await progressHost();let browser;
  try{
   browser=await chromium.launch({headless:true});const {page,context}=await server.connect(browser,locale,size);
   await expect(region(page,locale)).toBeVisible({timeout:3000});
   await row(page,stops[0]).getByRole('button',{name:text(locale,'Visited','已到訪'),exact:true}).dblclick();
   await expect(region(page,locale)).toContainText('1 / 3');
   assert.equal(server.calls.filter(call=>call.method==='POST').length,1);
   const trip=server.host.trips.get(tripId).value;
   trip.days[0].stops.reverse().forEach((stop,position)=>{stop.position=position});trip.revision++;
   await page.reload();
   await expect(row(page,stops[2])).toHaveAttribute('aria-current','step');
   await expect(row(page,stops[0]).getByRole('button',{name:text(locale,'Undo','撤銷'),exact:true})).toBeVisible();
   for(const id of [stops[2],stops[1]]){
    await row(page,id).getByRole('button',{name:text(locale,'Skip','略過'),exact:true}).click();
    await expect(row(page,id).getByRole('button',{name:text(locale,'Undo','撤銷'),exact:true})).toBeVisible();
   }
   await expect(region(page,locale)).toContainText('3 / 3');
   await expect(region(page,locale)).toContainText(text(locale,'Day complete','這一天已完成'));
   await expect(page.locator('[aria-current="step"][data-stop-id]')).toHaveCount(0);
   await capture(page,'mock-progress-complete-'+locale+'-'+size);
   await row(page,stops[1]).getByRole('button',{name:text(locale,'Undo','撤銷'),exact:true}).click();
   await expect(row(page,stops[1])).toHaveAttribute('aria-current','step');
   trip.days[0].stops=trip.days[0].stops.filter(stop=>stop.id!==stops[0]);trip.revision++;
   await page.reload();
   await expect(region(page,locale)).toContainText('1 / 2');
   await expect(row(page,stops[0])).toHaveCount(0);
   trip.days[0].stops=[];trip.revision++;
   await page.reload();
   await expect(region(page,locale)).toContainText('0 / 0');
   await expect(region(page,locale)).not.toContainText(text(locale,'Day complete','這一天已完成'));
   await expect(region(page,locale).getByRole('button',{name:text(locale,'Visited','已到訪'),exact:true})).toHaveCount(0);
   await context.close();
  }finally{await browser?.close();await server.close()}
 });
}
test('PROGRESS_REMOVED_TRIP en/mobile: a missing saved trip clears its previously confirmed next stop',{timeout:45000},async()=>{
 const server=await progressHost();let browser;
 try{
  browser=await chromium.launch({headless:true});const {page,context}=await server.connect(browser,'en','mobile');
  await expect(row(page,stops[0])).toHaveAttribute('aria-current','step');
  server.host.trips.delete(tripId);
  await region(page,'en').getByRole('button',{name:'Load latest progress',exact:true}).click();
  await expect(region(page,'en')).toContainText('no longer available');
  await expect(page.locator('[aria-current="step"][data-stop-id]')).toHaveCount(0);
  assert.equal(server.calls.filter(call=>call.method==='POST').length,0);
  await context.close();
 }finally{await browser?.close();await server.close()}
});
test.after(async()=>{
 if(evidence){await mkdir(evidence,{recursive:true});await writeFile(evidence+'/LAYER.json',JSON.stringify({layer:'REAL_REACT_CHROMIUM_MOCKED_AUTH_AND_API',
  realPersistenceVerified:false,realRlsVerified:false},null,2)+'\n')}
});
