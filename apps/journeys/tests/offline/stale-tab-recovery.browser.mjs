import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {offlineTripHost,actorA,guideId} from '../helpers/offline-trip-host.mjs';

const require=createRequire(import.meta.url);
const {chromium,expect}=require('@playwright/test');
const evidence=process.env.KINNSO_STALE_TAB_EVIDENCE;

async function storedDraft(page,tripId){
 return page.evaluate(id=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('kinnso_account_cache_v1');
  request.onsuccess=()=>{
   const db=request.result;
   const rows=db.transaction('drafts').objectStore('drafts').getAll();
   rows.onsuccess=()=>{resolve(rows.result.find(row=>row.tripId===id)??null);db.close()};
   rows.onerror=()=>reject(rows.error);
  };
  request.onerror=()=>reject(request.error);
 }),tripId);
}

test('stale-tab same-page recovery preserves the original request, payload and CAS',{timeout:90000},async()=>{
 const host=await offlineTripHost();
 const external=[];
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({baseURL:host.origin,viewport:{width:1280,height:900}});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==host.origin){external.push(route.request().url());return route.abort()}return route.continue()});
  const page=await context.newPage();
  await page.request.get('/__session?actor='+actorA);

  const created=await page.request.post('/api/trips',{data:{
   requestId:randomUUID(),
   input:{title:'Synthetic stale-tab recovery',timezone:'UTC',startDate:null},
  }});
  expect(created.status()).toBe(201);
  const trip=(await created.json()).data;
  const adopted=await page.request.post('/api/trips/'+trip.id+'/adopt',{data:{
   guideId,version:1,expectedRevision:trip.revision,requestId:randomUUID(),
  }});
  expect(adopted.status()).toBe(200);
  const adoptedTrip=(await adopted.json()).data;
  const stopId=adoptedTrip.days[0].stops[0].id;

  const current=await context.newPage();
  const stale=await context.newPage();
  await Promise.all([current.goto('/en/trips/'+trip.id),stale.goto('/en/trips/'+trip.id)]);
  const currentNote=current.getByRole('textbox',{name:'Private note',exact:true});
  const staleNote=stale.getByRole('textbox',{name:'Private note',exact:true});
  await expect(currentNote).toHaveValue('');
  await expect(staleNote).toHaveValue('');
  await expect(stale.getByText('Revision '+adoptedTrip.revision,{exact:false})).toBeVisible();

  const newer='Synthetic committed by current tab',local='Synthetic kept by stale tab';
  await currentNote.fill(newer);
  await current.getByRole('button',{name:'Save stop',exact:true}).click();
  await expect(current.getByTestId('trip-save-state')).toContainText('Saved to your account');

  await staleNote.fill(local);
  const staleCommandResponse=stale.waitForResponse(response=>new URL(response.url()).pathname==='/api/trips/'+trip.id+'/commands'&&response.request().method()==='POST');
  await stale.getByRole('button',{name:'Save stop',exact:true}).click();
  const conflictResponse=await staleCommandResponse;
  const firstStaleCommand=host.requests.filter(row=>row.path==='/api/trips/'+trip.id+'/commands'&&row.method==='POST').at(-1);
  assert.equal(conflictResponse.status(),409,JSON.stringify({expectedRevision:firstStaleCommand?.body?.expectedRevision,requestId:firstStaleCommand?.body?.requestId,response:await conflictResponse.json()}));
  await expect(stale.getByTestId('trip-save-state')).toContainText('Conflict');
  await expect(staleNote).toHaveValue(local);

  const commandPath='/api/trips/'+trip.id+'/commands';
  const commandRequests=()=>host.requests.filter(row=>row.path===commandPath&&row.method==='POST');
  const original=commandRequests().at(-1);
  assert.ok(original);
  assert.equal(original.expectedActor,actorA);
  assert.equal(original.body.expectedRevision,adoptedTrip.revision);
  assert.equal(original.body.command.id,stopId);
  assert.equal(original.body.command.patch.travellerNote,local);
  const originalDraft=await storedDraft(stale,trip.id);
  assert.equal(originalDraft.requestId,original.body.requestId);
  assert.equal(originalDraft.baseRevision,original.body.expectedRevision);
  assert.deepEqual(originalDraft.command,original.body.command);
  if(evidence){await mkdir(evidence,{recursive:true});await stale.screenshot({path:evidence+'/conflict-before-load.png',fullPage:true})}

  const loaded=stale.waitForResponse(response=>new URL(response.url()).pathname==='/api/trips/'+trip.id&&response.request().method()==='GET'&&response.status()===200);
  await stale.getByRole('button',{name:'Load current version',exact:true}).click();
  await loaded;
  assert.equal(commandRequests().length,2);
  assert.equal(host.trips.get(trip.id).value.days[0].stops[0].travellerNote,newer);

  await stale.getByRole('button',{name:'Retry local draft with revision check',exact:true}).click();
  await expect(stale.getByTestId('trip-save-state')).toContainText('Conflict');
  const retried=commandRequests().at(-1);
  assert.equal(commandRequests().length,3);
  assert.equal(retried.expectedActor,actorA);
  assert.deepEqual(retried.body,original.body);
  assert.equal(host.trips.get(trip.id).value.days[0].stops[0].travellerNote,newer);
  const retainedDraft=await storedDraft(stale,trip.id);
  assert.equal(retainedDraft.requestId,originalDraft.requestId);
  assert.equal(retainedDraft.baseRevision,originalDraft.baseRevision);
  assert.deepEqual(retainedDraft.command,originalDraft.command);
  await expect(staleNote).toHaveValue(local);
  if(evidence)await stale.screenshot({path:evidence+'/conflict-after-original-retry.png',fullPage:true});

  await expect(stale.getByTestId('conflict-recovery')).toBeVisible();
  const beforeDiscard=commandRequests().length;
  await stale.getByRole('button',{name:'Discard local draft and use current version',exact:true}).click();
  await expect(stale.getByTestId('trip-save-state')).toContainText('Local draft discarded');
  await expect(staleNote).toHaveValue(newer);
  assert.equal(commandRequests().length,3);
  assert.equal(host.trips.get(trip.id).value.days[0].stops[0].travellerNote,newer);
  assert.equal(await storedDraft(stale,trip.id),null);
  assert.equal(commandRequests().length,beforeDiscard);
  if(evidence){
   await stale.screenshot({path:evidence+'/discarded-current-version.png',fullPage:true});
   await writeFile(evidence+'/RESULT.json',JSON.stringify({
    layer:'REAL_CHROMIUM_REAL_REACT_REAL_INDEXEDDB_MOCK_API_NOT_DB_OR_AUTH',
    actor:actorA,tripId:trip.id,originalRequest:original.body,
    retriedRequest:retried.body,sameIdentity:JSON.stringify(retried.body)===JSON.stringify(original.body),
    currentServerNote:host.trips.get(trip.id).value.days[0].stops[0].travellerNote,
    localDraftAfterDiscard:await storedDraft(stale,trip.id),postCountBeforeDiscard:beforeDiscard,
    postCountAfterDiscard:commandRequests().length,conflictCount:commandRequests().filter(row=>row.body.command.patch.travellerNote===local).length,
    browser:browser.version(),externalRequests:external,serverRows:host.trips.size,
   },null,2),'utf8');
  }
 }finally{
  await browser?.close();
  await host.close();
 }
});
