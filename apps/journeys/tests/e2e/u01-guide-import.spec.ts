import {readFileSync} from 'node:fs';
import {test,expect,type Page} from '@playwright/test';import {loadEnvFile} from 'node:process';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);const ids:string[]=[];
let a:Awaited<ReturnType<typeof actor>>,b:typeof a,creator:typeof a,summaryId:string,guideId:string;
async function actor(author=false){const email=`synthetic-u01-${randomUUID()}@example.test`,password=`U01!${randomUUID()}`,result=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull();const id=result.data.user!.id;ids.push(id);if(author)expect((await admin.from('creators').update({status:'active',display_name:'Synthetic browser author'}).eq('id',id)).error).toBeNull();const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!);expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();return{id,email,password,client}}
async function guide(title:string){const result=await creator.client.from('guides').insert({creator_id:creator.id,creator_name:'Synthetic browser author',creator_handle:'synthetic',slug:'synthetic-'+randomUUID(),title,summary:'Summary is not an itinerary',cover_url:'',city:'Kyoto',status:'published',published_at:new Date().toISOString()}).select('id').single();expect(result.error).toBeNull();return result.data!.id}
test.beforeAll(async()=>{a=await actor();b=await actor();creator=await actor(true);summaryId=await guide('Synthetic summary only');guideId=await guide('Synthetic authored itinerary');expect((await creator.client.rpc('publish_guide_version',{p_guide_id:guideId,p_expected_version:0,p_request_id:randomUUID(),p_content:{days:[{offset:0,title:'Authored day',stops:[{title:'Authored source stop',description:'Public authored description',placeId:null,startMinuteOfDay:600,durationMinutes:30}]}]}})).error).toBeNull()});
test.afterAll(async()=>{for(const id of ids)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()});
async function signIn(page:Page){await page.getByLabel('Email').fill(a.email);await page.getByLabel('Password').fill(a.password);await page.getByRole('button',{name:'Sign in',exact:true}).click()}

async function openTrips(page:Page){
 await page.goto('/en/sign-in?next='+encodeURIComponent('/en/trips'));await signIn(page);await page.waitForURL('**/en/trips');
 await expect(page.getByLabel('Trip title',{exact:true})).toBeEnabled();
}
async function savedTrip(title:string){
 const result=await a.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title,timezone:'UTC'}});
 expect(result.error).toBeNull();return result.data as {id:string;title:string;revision:number};
}
async function holdTripReply(page:Page,path:string,method:string){
 let release!:()=>void,committed!:()=>void,delivered!:()=>void,createdId='',items:{id:string;title:string}[]=[];
 const held=new Promise<void>(resolve=>{release=resolve}),persisted=new Promise<void>(resolve=>{committed=resolve}),acknowledged=new Promise<void>(resolve=>{delivered=resolve});
 await page.route(path,async route=>{
  if(route.request().method()!==method)return route.continue();
  const response=await route.fetch();expect(response.ok()).toBe(true);
  if(method==='POST')createdId=(await response.json()).data.id;
  if(method==='GET')items=(await response.json()).data.items;
  committed();await held;await route.fulfill({response});delivered();
 });
 return{release,persisted,acknowledged,id:()=>createdId,items:()=>items};
}
async function settleReply(page:Page,held:Awaited<ReturnType<typeof holdTripReply>>,path:string,method:string){
 const response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method);
 held.release();await held.acknowledged;await (await response).finished();
 // Include any RSC navigation triggered by the completed response body, not only its headers.
 await page.waitForLoadState('networkidle');
 // Cross a browser render after delivery before checking the route and visible account state.
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}

test('late trip creation acknowledgement cannot replace a different open trip',async({page})=>{
 const target=await savedTrip('Synthetic creation navigation target '+randomUUID());await openTrips(page);
 await expect(page.getByRole('link',{name:target.title,exact:true})).toBeVisible();
 const held=await holdTripReply(page,'**/api/trips','POST'),title='Synthetic creation while leaving '+randomUUID();
 try{
  await page.getByLabel('Trip title',{exact:true}).fill(title);await page.getByRole('button',{name:'Create trip',exact:true}).click();await held.persisted;
  const created=(await a.client.rpc('get_trip_snapshot',{p_trip_id:held.id()})).data;expect(created.title).toBe(title);expect(created.revision).toBe(1);
  await page.getByRole('link',{name:target.title,exact:true}).click();await page.waitForURL('**/en/trips/'+target.id);await expect(page.getByRole('heading',{name:target.title,exact:true})).toBeVisible();
  await settleReply(page,held,'/api/trips','POST');
  await expect(page).toHaveURL(new RegExp('/en/trips/'+target.id+'$'));await expect(page.getByRole('button',{name:'Save trip details',exact:true})).toBeEnabled();
  await page.reload();await expect(page.getByRole('heading',{name:target.title,exact:true})).toBeVisible();
  const trips=await page.request.get('/api/trips');expect((await trips.json()).data.items.filter((t:{id:string})=>t.id===held.id())).toHaveLength(1);
  const edited=target.title+' edited';await page.getByLabel('Trip title',{exact:true}).fill(edited);await page.getByRole('button',{name:'Save trip details',exact:true}).click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
  const updated=(await a.client.rpc('get_trip_snapshot',{p_trip_id:target.id})).data;expect(updated.title).toBe(edited);expect(updated.revision).toBe(2);
 }finally{held.release()}
});

test('late trip deletion acknowledgement cannot close a different open trip',async({page})=>{
 const removed=await savedTrip('Synthetic deletion source '+randomUUID()),target=await savedTrip('Synthetic deletion navigation target '+randomUUID());await openTrips(page);
 await page.getByRole('link',{name:removed.title,exact:true}).click();await page.waitForURL('**/en/trips/'+removed.id);await expect(page.getByRole('button',{name:'Delete trip',exact:true})).toBeEnabled();
 const held=await holdTripReply(page,'**/api/trips/'+removed.id,'DELETE');page.once('dialog',dialog=>dialog.accept());
 try{
  await page.getByRole('button',{name:'Delete trip',exact:true}).click();await held.persisted;expect((await page.request.get('/api/trips/'+removed.id)).status()).toBe(404);
  await page.locator('#k-main').getByRole('link',{name:'My trips',exact:true}).click();await page.waitForURL('**/en/trips');
  await page.getByRole('link',{name:target.title,exact:true}).click();await page.waitForURL('**/en/trips/'+target.id);await expect(page.getByRole('heading',{name:target.title,exact:true})).toBeVisible();
  await settleReply(page,held,'/api/trips/'+removed.id,'DELETE');
  await expect(page).toHaveURL(new RegExp('/en/trips/'+target.id+'$'));await expect(page.getByRole('button',{name:'Save trip details',exact:true})).toBeEnabled();
  await page.reload();await expect(page.getByRole('heading',{name:target.title,exact:true})).toBeVisible();expect((await page.request.get('/api/trips/'+removed.id)).status()).toBe(404);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete trip',exact:true}).click();await page.waitForURL('**/en/trips');expect((await page.request.get('/api/trips/'+target.id)).status()).toBe(404);
 }finally{held.release()}
});

test('late trip creation acknowledgement cannot navigate an invalidated account tab',async({page})=>{
 await openTrips(page);const held=await holdTripReply(page,'**/api/trips','POST');let account:Page|null=null;
 try{
  await page.getByLabel('Trip title',{exact:true}).fill('Synthetic creation before local sign out');await page.getByRole('button',{name:'Create trip',exact:true}).click();await held.persisted;
  expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:held.id()})).data.id).toBe(held.id());
  account=await page.context().newPage();await account.goto('/en/me');await account.getByRole('button',{name:'Sign out',exact:true}).click();await account.waitForURL('**/en/sign-in');
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();await expect(page.getByLabel('Trip title',{exact:true})).toHaveCount(0);
  await settleReply(page,held,'/api/trips','POST');
  await expect(page).toHaveURL(/\/en\/trips$/);await expect(page.getByRole('link',{name:'Sign in',exact:true})).toHaveAttribute('href','/en/sign-in?next=%2Fen%2Ftrips');
  expect((await page.request.get('/api/trips/'+held.id())).status()).toBe(401);
 }finally{held.release();await account?.close()}
});

test('late trip pagination cannot append the previous account trips',async({page})=>{
 test.setTimeout(90000);
 const marker='Synthetic previous account '+randomUUID();
 for(let i=0;i<22;i++)await savedTrip(marker+' '+i);
 const result=await b.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic current account '+randomUUID(),timezone:'UTC'}});expect(result.error).toBeNull();const other=result.data;
 await openTrips(page);await expect(page.getByRole('button',{name:'More trips',exact:true})).toBeVisible();
 const held=await holdTripReply(page,'**/api/trips?after=*','GET');let account:Page|null=null;
 try{
  await page.getByRole('button',{name:'More trips',exact:true}).click();await held.persisted;
  expect(held.items().some(item=>item.title.startsWith(marker))).toBe(true);
  account=await page.context().newPage();await account.goto('/en/me');await account.getByRole('button',{name:'Sign out',exact:true}).click();await account.waitForURL('**/en/sign-in');
  await account.goto('/en/sign-in?next='+encodeURIComponent('/en/trips'));await account.getByLabel('Email').fill(b.email);await account.getByLabel('Password').fill(b.password);await account.getByRole('button',{name:'Sign in',exact:true}).click();await account.waitForURL('**/en/trips');
  await expect(account.getByRole('link',{name:other.title,exact:true})).toBeVisible();
  await page.bringToFront();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('link',{name:other.title,exact:true})).toBeVisible();
  expect((await (await page.request.get('/api/session')).json()).data.id).toBe(b.id);
  await settleReply(page,held,'/api/trips','GET');
  await expect(page.getByRole('link',{name:new RegExp('^'+marker)})).toHaveCount(0);await expect(page.getByRole('link',{name:other.title,exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('link',{name:other.title,exact:true})).toBeVisible();await expect(page.getByRole('link',{name:new RegExp('^'+marker)})).toHaveCount(0);
 }finally{held.release();await account?.close()}
});

test('superseded offline snapshot read cannot overwrite a fresh server load',async({page})=>{
 const trip=await savedTrip('Synthetic old offline snapshot '+randomUUID());await openTrips(page);
 await page.getByRole('link',{name:trip.title,exact:true}).click();await expect(page.getByRole('heading',{name:trip.title,exact:true})).toBeVisible();
 const key=a.id+':'+trip.id;
 await expect.poll(()=>page.evaluate(key=>new Promise<number>((resolve,reject)=>{
  const opening=indexedDB.open('kinnso_account_cache_v1',2);opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{const db=opening.result,read=db.transaction('snapshots').objectStore('snapshots').get(key);read.onsuccess=()=>{resolve(read.result?.snapshot.revision??0);db.close()};read.onerror=()=>reject(read.error)};
 }),key)).toBe(1);
 await page.evaluate(key=>{
  const originalGet=IDBObjectStore.prototype.get,success=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'onsuccess')!;
  const state={revision:0,release:()=>{},restore:()=>{IDBObjectStore.prototype.get=originalGet}};let captured=false;
  (window as unknown as {snapshotReadHold:typeof state}).snapshotReadHold=state;
  IDBObjectStore.prototype.get=function(query){
   const request=originalGet.call(this,query);
   if(this.name==='snapshots'&&query===key&&!captured){
    captured=true;
    // Hold delivery of a real IndexedDB result; never replace its stored snapshot.
    Object.defineProperty(request,'onsuccess',{configurable:true,get:()=>success.get!.call(request),set:handler=>success.set!.call(request,(event:Event)=>{state.revision=request.result?.snapshot.revision??0;state.release=()=>{state.release=()=>{};handler?.call(request,event)}})});
   }
   return request;
  };
 },key);
 try{
  await page.context().setOffline(true);await page.getByRole('button',{name:'Load current version',exact:true}).click();
  await page.waitForFunction(()=>(window as unknown as {snapshotReadHold:{revision:number}}).snapshotReadHold.revision===1);
  const title='Synthetic fresh server load '+randomUUID(),updated=await a.client.rpc('apply_trip_command',{p_trip_id:trip.id,p_expected_revision:1,p_request_id:randomUUID(),p_command:{type:'patchTrip',patch:{title}}});expect(updated.error).toBeNull();expect(updated.data.revision).toBe(2);
  await page.context().setOffline(false);await page.getByRole('button',{name:'Load current version',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await page.evaluate(()=>(window as unknown as {snapshotReadHold:{release:()=>void}}).snapshotReadHold.release());await page.waitForLoadState('networkidle');await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.getByLabel('Trip title',{exact:true})).toHaveValue(title);await expect(page.getByTestId('trip-save-state')).not.toContainText('Offline');
  expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:trip.id})).data.revision).toBe(2);
 }finally{await page.context().setOffline(false);await page.evaluate(()=>{const state=(window as unknown as {snapshotReadHold:{release:()=>void;restore:()=>void}}).snapshotReadHold;state.release();state.restore()})}
});
test('anonymous bookmark returns once; summary never offers invented itinerary',async({page})=>{test.setTimeout(90000);await page.goto('/en/g/'+summaryId);await expect(page.getByText('This is a summary guide. It has no structured itinerary to apply.')).toBeVisible({timeout:15000});await expect(page.getByRole('button',{name:'Apply published itinerary',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Bookmark guide',exact:true}).click();await page.waitForURL('**/sign-in?*');await signIn(page);await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible({timeout:20000});await page.reload();await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible();const saved=await a.client.from('guide_saves').select('id').eq('guide_id',summaryId);expect(saved.data).toHaveLength(1);expect((await b.client.from('guide_saves').select('id').eq('guide_id',summaryId)).data).toHaveLength(0)});
test('guest edits import once, original stays, server adoption has real source, second context conflicts without losing input',async({page,browser})=>{test.setTimeout(150000);await page.goto('/en/g/'+guideId);await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();await page.getByLabel('Draft stop title',{exact:true}).fill('Personal device stop');await page.getByLabel('Draft private note',{exact:true}).fill('Synthetic private draft');await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('It is not synced to an account.');await page.getByRole('link',{name:'Sign in to review import',exact:true}).click();await signIn(page);await page.waitForURL('**/en/trips');await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic authored itinerary',exact:true}).click();const imported=page.waitForResponse(r=>r.url().endsWith('/api/trips/import')&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirm import to this account',exact:true}).click();const first=(await (await imported).json()).data;expect(first.days[0].stops[0].source).toBeNull();const replay=page.waitForResponse(r=>r.url().endsWith('/api/trips/import')&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirm import to this account',exact:true}).click();expect((await (await replay).json()).data.id).toBe(first.id);
 const retained=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{const request=indexedDB.open('kinnso_guest_drafts_v1');request.onsuccess=()=>{const db=request.result,r=db.transaction('trips').objectStore('trips').count();r.onsuccess=()=>{resolve(r.result);db.close()};r.onerror=()=>reject(r.error)}}));expect(retained).toBe(1);
 await page.goto('/en/g/'+guideId);await page.getByLabel('Apply to a trip',{exact:true}).selectOption(first.id);await page.getByRole('button',{name:'Apply published itinerary',exact:true}).click();await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();await page.waitForURL('**/en/trips/'+first.id);await expect(page.getByLabel('Private note',{exact:true}).first()).toHaveValue('Synthetic private draft');const snapshot=(await a.client.rpc('get_trip_snapshot',{p_trip_id:first.id})).data;expect(snapshot.days[1].stops[0].source.guideVersion).toBe(1);expect((await b.client.rpc('get_trip_snapshot',{p_trip_id:first.id})).error?.message).toContain('trip_not_found');
 await expect(page.getByText('Creator instructions: Public authored description')).toBeVisible();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download private trip for offline reading',exact:true}).click();const downloaded=JSON.parse(readFileSync((await (await downloading).path())!,'utf8'));expect(downloaded.snapshot.days[1].stops[0].sourceDescription).toBe('Public authored description');expect(downloaded.snapshot.days[0].stops[0].travellerNote).toBe('Synthetic private draft');
 const context=await browser.newContext(),other=await context.newPage();await other.goto('/en/sign-in?next='+encodeURIComponent('/en/trips/'+first.id));await signIn(other);await expect(other.getByLabel('Private note',{exact:true}).first()).toHaveValue('Synthetic private draft');await page.getByLabel('Private note',{exact:true}).first().fill('First context committed');await page.getByRole('button',{name:'Save stop',exact:true}).first().click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');await other.getByLabel('Private note',{exact:true}).first().fill('Second context uncommitted');await other.getByRole('button',{name:'Save stop',exact:true}).first().click();await expect(other.getByTestId('trip-save-state')).toContainText('Conflict.');await expect(other.getByLabel('Private note',{exact:true}).first()).toHaveValue('Second context uncommitted');expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:first.id})).data.days[0].stops[0].travellerNote).toBe('First context committed');await context.close();
 await page.context().setOffline(true);await page.getByLabel('Private note',{exact:true}).first().fill('Synthetic offline draft');await page.getByRole('button',{name:'Save stop',exact:true}).first().click();await expect(page.getByTestId('trip-save-state')).toContainText('local draft is not synced');await page.context().setOffline(false);await page.getByRole('button',{name:'Retry local draft with revision check',exact:true}).click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:first.id})).data.days[0].stops[0].travellerNote).toBe('Synthetic offline draft');
});
test('published v2 is reviewed before appending; conflict requires review and lost response replays once',async({page})=>{
 test.setTimeout(150000);
 const id=await guide('Synthetic version comparison');
 const content=(title:string)=>({days:[{offset:0,title:'Authored version day',stops:[{title,description:'Instructions '+title,placeId:null,startMinuteOfDay:600,durationMinutes:30}]}]});
 expect((await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:content('Version one')})).error).toBeNull();
 let trip=(await a.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic version review trip',timezone:'UTC'}})).data;
 trip=(await a.client.rpc('adopt_guide_to_trip',{p_guide_id:id,p_version:1,p_trip_id:trip.id,p_expected_revision:trip.revision,p_request_id:randomUUID()})).data;
 const tripId=trip.id,stopId=trip.days[0].stops[0].id;
 trip=(await a.client.rpc('apply_trip_command',{p_trip_id:tripId,p_expected_revision:trip.revision,p_request_id:randomUUID(),p_command:{type:'updateStop',id:stopId,patch:{travellerNote:'My version-one private note'}}})).data;
 expect((await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:1,p_request_id:randomUUID(),p_content:content('Version two')})).error).toBeNull();
 await page.goto('/en/sign-in?next='+encodeURIComponent('/en/g/'+id));await signIn(page);await page.waitForURL('**/en/g/'+id);
 await page.getByLabel('Apply to a trip',{exact:true}).selectOption(tripId);await page.getByRole('button',{name:'Apply published itinerary',exact:true}).click();
 const preview=page.getByTestId('adoption-preview');await expect(preview).toContainText('Existing source versions: v1');await expect(preview).toContainText('Published version: v2');await expect(preview).toContainText('Days: 1 → 2');await expect(preview).toContainText('Private notes retained: 1');expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:tripId})).data.revision).toBe(trip.revision);
 trip=(await a.client.rpc('apply_trip_command',{p_trip_id:tripId,p_expected_revision:trip.revision,p_request_id:randomUUID(),p_command:{type:'patchTrip',patch:{title:'Changed before confirmation'}}})).data;
 await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();await expect(page.getByRole('status')).toContainText('Trip changed. Review the current version before applying.');await expect(preview).toHaveCount(0);
 await page.getByRole('button',{name:'Apply published itinerary',exact:true}).click();await expect(preview).toContainText('Changed before confirmation');
 let committedRevision=0;const requests:string[]=[];const path='**/api/trips/'+tripId+'/adopt';
 await page.route(path,async route=>{requests.push(route.request().postDataJSON().requestId);const response=await route.fetch();committedRevision=(await response.json()).data.revision;await route.abort('failed')});
 await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();await expect(page.getByRole('status')).toContainText('Application was not confirmed.');await page.unroute(path);
 const retry=page.waitForRequest(r=>r.url().endsWith('/api/trips/'+tripId+'/adopt'));await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();expect((await retry).postDataJSON().requestId).toBe(requests[0]);await page.waitForURL('**/en/trips/'+tripId);
 await expect(page.getByLabel('Private note',{exact:true}).first()).toHaveValue('My version-one private note');await page.reload();const result=(await a.client.rpc('get_trip_snapshot',{p_trip_id:tripId})).data;expect(result.revision).toBe(committedRevision);expect(result.days).toHaveLength(2);expect(result.days[0].stops[0].source.guideVersion).toBe(1);expect(result.days[1].stops[0].source.guideVersion).toBe(2);expect(result.days[0].stops[0].travellerNote).toBe('My version-one private note');
});
