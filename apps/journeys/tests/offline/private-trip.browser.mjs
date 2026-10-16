import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {offlineTripHost,actorA,actorB,guideId} from '../helpers/offline-trip-host.mjs';
const require=createRequire(import.meta.url);
const {chromium,expect}=require('@playwright/test');
const evidence=process.env.KINNSO_OFFLINE_EVIDENCE;
for(const locale of ['en','zh-HK'])test(`real Chromium / production React / mocked API: saved guide to durable private trip (${locale})`,{timeout:60000},async()=>{
 const host=await offlineTripHost();let browser,page;
 const errors=[],external=[];
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({baseURL:host.origin,viewport:locale==='en'?{width:1280,height:900}:{width:390,height:844}});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==host.origin){external.push(route.request().url());return route.abort()}return route.continue()});
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.request.get('/__session?actor='+actorA);
  await page.goto('/'+locale+'/saved');await page.getByRole('link',{name:host.guide.title,exact:true}).click();
  await page.getByRole('link',{name:locale==='en'?'Create a new trip and apply':'建立新行程並採用',exact:true}).click();
  const title=page.getByLabel(locale==='en'?'Trip title':'行程標題',{exact:true});
  await expect(title).toHaveValue(host.guide.title);
  let loseCreate=true;
  await page.route('**/api/trips',async route=>{if(loseCreate&&route.request().method()==='POST'){loseCreate=false;await route.fetch();await route.abort('failed')}else await route.continue()});
  const create=page.getByRole('button',{name:locale==='en'?'Create trip':'建立行程',exact:true});
  await create.focus();await page.keyboard.press('Enter');
  await expect(page.getByTestId('trip-save-state')).toContainText(locale==='en'?'unconfirmed':'尚未確認');
  assert.equal(host.trips.size,1);
  await page.reload();await page.getByRole('button',{name:locale==='en'?'Check original trip creation':'核對原建立行程操作',exact:true}).click();
  await expect(page.getByTestId('adoption-preview')).toContainText('Synthetic authored stop');
  assert.equal(host.requests.filter(r=>r.path==='/api/trips'&&r.method==='POST').length,1);
  if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:evidence+'/preview-'+locale+'.png',fullPage:true})}
  await page.getByRole('button',{name:locale==='en'?'Cancel preview':'取消預覽',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByTestId('adoption-preview')).toHaveCount(0);
  assert.equal([...host.trips.values()][0].value.days.length,0);
  await expect(page.locator('body')).toContainText(locale==='en'?'empty trip was created':'空白行程已建立');
  await page.goBack();await page.getByRole('button',{name:locale==='en'?'Check original trip creation':'核對原建立行程操作',exact:true}).click();
  await expect(page.getByTestId('adoption-preview')).toBeVisible();assert.equal(host.trips.size,1);
  await page.getByRole('button',{name:locale==='en'?'Apply published itinerary':'套用已發布行程',exact:true}).click();
  host.faults.refuseAdopt=true;
  await page.getByRole('button',{name:locale==='en'?'Confirm apply to this trip':'確認套用至此行程',exact:true}).click();
  await expect(page.getByRole('status',{name:locale==='en'?'Guide action status':'攻略操作狀態',exact:true})).toContainText(locale==='en'?'not confirmed':'未確認套用');
  await page.reload();let loseAdopt=true;
  await page.route('**/api/trips/*/adopt',async route=>{if(loseAdopt){loseAdopt=false;await route.fetch();await route.abort('failed')}else await route.continue()});
  await page.getByRole('button',{name:locale==='en'?'Retry original application':'重試原套用操作',exact:true}).click();
  await expect(page.getByRole('status',{name:locale==='en'?'Guide action status':'攻略操作狀態',exact:true})).toContainText(locale==='en'?'not confirmed':'未確認套用');
  await page.reload();await page.getByRole('button',{name:locale==='en'?'Retry original application':'重試原套用操作',exact:true}).click();
  const tripId=[...host.trips.keys()][0];await page.waitForURL('**/'+locale+'/trips/'+tripId);
  const note=page.getByRole('textbox',{name:locale==='en'?'Private note':'私人筆記',exact:true});
  await expect(note).toHaveValue('');
  await page.getByLabel(locale==='en'?'Stop title':'站點名稱',{exact:true}).fill('Synthetic traveller changed stop');
  await note.fill('Synthetic private traveller note');
  await page.getByRole('button',{name:locale==='en'?'Save stop':'保存站點',exact:true}).click();
  await expect(page.getByTestId('trip-save-state')).toContainText(locale==='en'?'Saved to your account':'已保存至你的帳戶');
  await page.reload();await expect(note).toHaveValue('Synthetic private traveller note');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile/desktop must not overflow horizontally');
  assert.equal([...host.trips.values()][0].value.days.length,1);
  const adopts=host.requests.filter(r=>r.path.endsWith('/adopt'));
  assert.equal(new Set(adopts.map(r=>r.body.requestId)).size,1);
  assert.ok(adopts.every(r=>r.expectedActor===actorA));
  if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:evidence+'/private-trip-'+locale+'.png',fullPage:true})}
  await context.close();
  const fresh=await browser.newContext({baseURL:host.origin,viewport:{width:390,height:844}});
  const other=await fresh.newPage();await other.request.get('/__session?actor='+actorA);
  host.faults.withdrawn=true;
  await other.goto('/'+locale+'/trips/'+tripId);await expect(other.getByRole('textbox',{name:locale==='en'?'Private note':'私人筆記',exact:true})).toHaveValue('Synthetic private traveller note');
  await other.request.get('/__session?actor='+actorB);await other.reload();
  await expect(other.getByRole('textbox',{name:locale==='en'?'Private note':'私人筆記',exact:true})).toHaveCount(0);
  await expect(other.locator('body')).not.toContainText('Synthetic private traveller note');
  await fresh.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  if(evidence)await writeFile(evidence+'/requests-'+locale+'.json',JSON.stringify({layer:'MOCK_API_REAL_CHROMIUM_NOT_DB_OR_HOSTED',requests:host.requests,tripCount:host.trips.size,browser:browser.version(),external},null,2));
 }catch(error){
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(evidence+'/failure-'+locale+'-'+Date.now()+'.json',JSON.stringify({error:String(error),errors,requests:host.requests,body:await page?.locator('body').innerText().catch(()=>null)},null,2))}
  throw error;
 }finally{await browser?.close();await host.close()}
});
