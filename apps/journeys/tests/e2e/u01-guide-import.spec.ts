import {readFileSync} from 'node:fs';
import {test,expect,type Page} from '@playwright/test';import {loadEnvFile} from 'node:process';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);const ids:string[]=[];
let a:Awaited<ReturnType<typeof actor>>,b:typeof a,creator:typeof a,summaryId:string,guideId:string;
async function actor(author=false){const email=`synthetic-u01-${randomUUID()}@example.test`,password=`U01!${randomUUID()}`,result=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull();const id=result.data.user!.id;ids.push(id);if(author)expect((await admin.from('creators').update({status:'active',display_name:'Synthetic browser author'}).eq('id',id)).error).toBeNull();const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!);expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();return{id,email,password,client}}
async function guide(title:string){const result=await creator.client.from('guides').insert({creator_id:creator.id,creator_name:'Synthetic browser author',creator_handle:'synthetic',slug:'synthetic-'+randomUUID(),title,summary:'Summary is not an itinerary',cover_url:'',city:'Kyoto',status:'published',published_at:new Date().toISOString()}).select('id').single();expect(result.error).toBeNull();return result.data!.id}
test.beforeAll(async()=>{a=await actor();b=await actor();creator=await actor(true);summaryId=await guide('Synthetic summary only');guideId=await guide('Synthetic authored itinerary');expect((await creator.client.rpc('publish_guide_version',{p_guide_id:guideId,p_expected_version:0,p_request_id:randomUUID(),p_content:{days:[{offset:0,title:'Authored day',stops:[{title:'Authored source stop',description:'Public authored description',placeId:null,startMinuteOfDay:600,durationMinutes:30}]}]}})).error).toBeNull()});
test.afterAll(async()=>{for(const id of ids)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()});
async function signIn(page:Page,owner=a){await page.getByLabel('Email').fill(owner.email);await page.getByLabel('Password').fill(owner.password);await page.getByRole('button',{name:'Sign in',exact:true}).click()}

async function openTrips(page:Page,owner=a){
 await page.goto('/en/sign-in?next='+encodeURIComponent('/en/trips'));await signIn(page,owner);await page.waitForURL('**/en/trips');
 await expect(page.getByLabel('Trip title',{exact:true})).toBeEnabled();
}
async function savedTrip(title:string,owner=a){
 const result=await owner.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title,timezone:'UTC'}});
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
 // Pagination fixtures must not push later adoption fixtures out of their first page.
 const previous=await actor(),current=await actor();
 const marker='Synthetic previous account '+randomUUID();
 for(let i=0;i<22;i++)await savedTrip(marker+' '+i,previous);
 const result=await current.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic current account '+randomUUID(),timezone:'UTC'}});expect(result.error).toBeNull();const other=result.data;
 await openTrips(page,previous);await expect(page.getByRole('button',{name:'More trips',exact:true})).toBeVisible();
 const held=await holdTripReply(page,'**/api/trips?after=*','GET');let account:Page|null=null;
 try{
  await page.getByRole('button',{name:'More trips',exact:true}).click();await held.persisted;
  expect(held.items().some(item=>item.title.startsWith(marker))).toBe(true);
  account=await page.context().newPage();await account.goto('/en/me');await account.getByRole('button',{name:'Sign out',exact:true}).click();await account.waitForURL('**/en/sign-in');
  await account.goto('/en/sign-in?next='+encodeURIComponent('/en/trips'));await signIn(account,current);await account.waitForURL('**/en/trips');
  await expect(account.getByRole('link',{name:other.title,exact:true})).toBeVisible();
  await page.bringToFront();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('link',{name:other.title,exact:true})).toBeVisible();
  expect((await (await page.request.get('/api/session')).json()).data.id).toBe(current.id);
  await settleReply(page,held,'/api/trips','GET');
  await expect(page.getByRole('link',{name:new RegExp('^'+marker)})).toHaveCount(0);await expect(page.getByRole('link',{name:other.title,exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('link',{name:other.title,exact:true})).toBeVisible();await expect(page.getByRole('link',{name:new RegExp('^'+marker)})).toHaveCount(0);
 }finally{held.release();await account?.close()}
});

test('superseded offline snapshot read cannot overwrite a fresh server load',async({page})=>{
 const trip=await savedTrip('Synthetic old offline snapshot '+randomUUID());await openTrips(page);
 await page.goto('/en/trips/'+trip.id);await expect(page.getByRole('heading',{name:trip.title,exact:true})).toBeVisible();
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
test('guide picker reaches a third page and persists adoption with private notes retained',async({page})=>{
 const owner=await actor(),owned:Awaited<ReturnType<typeof savedTrip>>[]=[];
 for(let i=0;i<42;i++)owned.push(await savedTrip('Synthetic paged guide target '+i,owner));
 owned.sort((left,right)=>left.id.localeCompare(right.id));const target=owned[41];
 const adopted=await owner.client.rpc('adopt_guide_to_trip',{p_guide_id:guideId,p_version:1,p_trip_id:target.id,p_expected_revision:1,p_request_id:randomUUID()});expect(adopted.error).toBeNull();
 const noted=await owner.client.rpc('apply_trip_command',{p_trip_id:target.id,p_expected_revision:2,p_request_id:randomUUID(),p_command:{type:'updateStop',id:adopted.data.days[0].stops[0].id,patch:{travellerNote:'Synthetic third-page private note'}}});expect(noted.error).toBeNull();
 const requests:string[]=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/trips'&&request.method()==='GET')requests.push(request.url())});
 await page.goto('/en/sign-in?next='+encodeURIComponent('/en/g/'+guideId));const first=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/trips');await signIn(page,owner);await page.waitForURL('**/en/g/'+guideId);
 const firstPage=(await (await first).json()).data,picker=page.getByLabel('Apply to a trip',{exact:true}),more=page.getByRole('button',{name:'More trips',exact:true});
 expect(firstPage.items.map((item:{id:string})=>item.id)).toEqual(owned.slice(0,20).map(item=>item.id));expect(firstPage.nextCursor).toBe(owned[19].id);
 await expect(picker.locator('option')).toHaveCount(21);expect(requests).toHaveLength(1);await expect(picker.locator('option[value="'+target.id+'"]')).toHaveCount(0);
 const second=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/trips'&&new URL(r.url()).searchParams.get('after')===owned[19].id);await more.click();const secondPage=(await (await second).json()).data;
 expect(secondPage.items.map((item:{id:string})=>item.id)).toEqual(owned.slice(20,40).map(item=>item.id));expect(secondPage.nextCursor).toBe(owned[39].id);await expect(picker.locator('option')).toHaveCount(41);expect(requests).toHaveLength(2);
 const third=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/trips'&&new URL(r.url()).searchParams.get('after')===owned[39].id);await more.click();const thirdPage=(await (await third).json()).data;
 expect(thirdPage.items.map((item:{id:string})=>item.id)).toEqual(owned.slice(40).map(item=>item.id));expect(thirdPage.nextCursor).toBeNull();await expect(picker.locator('option')).toHaveCount(43);expect(requests).toHaveLength(3);await expect(more).toHaveCount(0);
 await picker.selectOption(target.id);await page.getByRole('button',{name:'Apply published itinerary',exact:true}).click();await expect(page.getByTestId('adoption-preview')).toContainText('Private notes retained: 1');
 expect((await owner.client.rpc('get_trip_snapshot',{p_trip_id:target.id})).data.revision).toBe(3);
 await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();await page.waitForURL('**/en/trips/'+target.id);await page.reload();
 await expect(page.getByLabel('Private note',{exact:true}).first()).toHaveValue('Synthetic third-page private note');
 const snapshot=(await owner.client.rpc('get_trip_snapshot',{p_trip_id:target.id})).data;expect(snapshot.revision).toBe(4);expect(snapshot.days).toHaveLength(2);expect(snapshot.days[1].stops[0].source.guideVersion).toBe(1);expect(snapshot.days[0].stops[0].travellerNote).toBe('Synthetic third-page private note');expect((await b.client.rpc('get_trip_snapshot',{p_trip_id:target.id})).error?.message).toContain('trip_not_found');
});

test('guide picker page failure retains selection and retries the same cursor once',async({page})=>{
 const owner=await actor(),owned:Awaited<ReturnType<typeof savedTrip>>[]=[];for(let i=0;i<22;i++)owned.push(await savedTrip('Synthetic retry guide target '+i,owner));owned.sort((left,right)=>left.id.localeCompare(right.id));
 await page.goto('/en/sign-in?next='+encodeURIComponent('/en/g/'+guideId));await signIn(page,owner);await page.waitForURL('**/en/g/'+guideId);
 const picker=page.getByLabel('Apply to a trip',{exact:true}),more=page.getByRole('button',{name:'More trips',exact:true});await expect(picker.locator('option')).toHaveCount(21);await picker.selectOption(owned[0].id);
 let failedCursor='';const path='**/api/trips?after=*';await page.route(path,async route=>{failedCursor=new URL(route.request().url()).searchParams.get('after')!;const response=await route.fetch();expect(response.ok()).toBe(true);expect((await response.json()).data.items).toHaveLength(2);await route.abort('failed')});
 await more.click();await expect(page.getByRole('status',{name:'Guide action status',exact:true})).toContainText('More trips could not be loaded. Retry.');expect(failedCursor).toBe(owned[19].id);await expect(picker).toHaveValue(owned[0].id);await expect(picker.locator('option')).toHaveCount(21);await expect(more).toBeEnabled();await page.unroute(path);
 const retry=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/trips'&&new URL(r.url()).searchParams.get('after')===failedCursor);await more.click();expect((await (await retry).json()).data.items).toHaveLength(2);
 await expect(picker.locator('option')).toHaveCount(23);await expect(picker).toHaveValue(owned[0].id);await expect(more).toHaveCount(0);await expect(page.getByRole('status',{name:'Guide action status',exact:true})).not.toContainText('More trips could not be loaded.');await expect(page.getByRole('button',{name:'Apply published itinerary',exact:true})).toBeEnabled();
});

test('guide picker late page cannot append the previous account options',async({page})=>{
 const previous=await actor(),current=await actor(),marker='Synthetic previous guide account '+randomUUID();for(let i=0;i<22;i++)await savedTrip(marker+' '+i,previous);const other=await savedTrip('Synthetic current guide account '+randomUUID(),current);
 await page.goto('/en/sign-in?next='+encodeURIComponent('/en/g/'+guideId));await signIn(page,previous);await page.waitForURL('**/en/g/'+guideId);
 const picker=page.getByLabel('Apply to a trip',{exact:true}),more=page.getByRole('button',{name:'More trips',exact:true});await expect(picker.locator('option')).toHaveCount(21);await picker.selectOption({index:1});
 const held=await holdTripReply(page,'**/api/trips?after=*','GET');let account:Page|null=null;
 try{
  await more.click();await held.persisted;expect(held.items()).toHaveLength(2);expect(held.items().every(item=>item.title.startsWith(marker))).toBe(true);
  account=await page.context().newPage();await account.goto('/en/me');await account.getByRole('button',{name:'Sign out',exact:true}).click();await account.waitForURL('**/en/sign-in');await account.goto('/en/sign-in?next='+encodeURIComponent('/en/g/'+guideId));await signIn(account,current);await account.waitForURL('**/en/g/'+guideId);await expect(account.getByLabel('Apply to a trip',{exact:true}).locator('option[value="'+other.id+'"]')).toHaveCount(1);
  await page.bringToFront();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(picker.locator('option[value="'+other.id+'"]')).toHaveCount(1);expect((await (await page.request.get('/api/session')).json()).data.id).toBe(current.id);
  await settleReply(page,held,'/api/trips','GET');await expect(picker.locator('option')).toHaveCount(2);await expect(picker).toHaveValue('');await expect(more).toHaveCount(0);await expect(picker).not.toContainText(marker);expect((await page.request.get('/api/trips/'+held.items()[0].id)).status()).toBe(404);
 }finally{held.release();await account?.close()}
});

async function pagedBookmarks(owner:typeof a,count=103){
 const rows=Array.from({length:count},(_,i)=>({id:randomUUID(),creator_id:creator.id,creator_name:'Synthetic browser author',creator_handle:'synthetic',slug:'synthetic-'+randomUUID(),title:'Synthetic paged bookmark '+randomUUID(),summary:'Synthetic summary',cover_url:'',city:'Kyoto',status:'published',published_at:new Date().toISOString()}));
 expect((await creator.client.from('guides').insert(rows)).error).toBeNull();rows.sort((left,right)=>left.id.localeCompare(right.id));
 expect((await admin.from('guide_saves').insert(rows.map(row=>({guide_id:row.id,traveler_user_id:owner.id,created_at:'2026-01-01T00:00:00.123456+00:00'})))).error).toBeNull();return rows;
}
async function openBookmarks(page:Page,owner:typeof a){await page.goto('/en/sign-in?next='+encodeURIComponent('/en/saved'));await signIn(page,owner);await page.waitForURL('**/en/saved')}
test('guide bookmark status failure stays unknown and retries the real saved state',async({page})=>{
 const owner=await actor();expect((await owner.client.rpc('kinnso_bookmark',{p_guide_id:summaryId,p_desired_state:true,p_request_id:randomUUID()})).error).toBeNull();let fail=true;await page.route('**/api/bookmarks?guideId=*',route=>{if(fail){fail=false;return route.abort()}return route.continue()});await page.goto('/en/sign-in?next='+encodeURIComponent('/en/g/'+summaryId));await signIn(page,owner);await page.waitForURL('**/en/g/'+summaryId);
 await expect(page.locator('.k-page').getByRole('alert')).toContainText('Bookmark status could not be loaded');await expect(page.getByRole('button',{name:'Bookmark guide',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Retry bookmark status',exact:true}).click();await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible();await page.getByRole('button',{name:'Remove bookmark',exact:true}).click();await expect(page.getByRole('button',{name:'Bookmark guide',exact:true})).toBeVisible();expect((await owner.client.from('guide_saves').select('id').eq('guide_id',summaryId)).data).toHaveLength(0);
});
for(const initiallySaved of [false,true])test('guide bookmark delayed status cannot overwrite acknowledged '+(initiallySaved?'removal':'save'),async({page})=>{
 const owner=await actor();if(initiallySaved)expect((await owner.client.rpc('kinnso_bookmark',{p_guide_id:summaryId,p_desired_state:true,p_request_id:randomUUID()})).error).toBeNull();
 let release!:()=>void,fetched!:()=>void,delivered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{fetched=resolve}),delivery=new Promise<void>(resolve=>{delivered=resolve});
 await page.route('**/api/bookmarks?guideId=*',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);expect((await response.json()).data).toHaveLength(initiallySaved?1:0);fetched();await held;await route.fulfill({response});delivered()});await page.route('**/api/bookmarks',async route=>{if(route.request().method()==='POST')await ready;await route.continue()});
 try{await page.goto('/en/sign-in?next='+encodeURIComponent('/en/g/'+summaryId+'?bookmark=1&requestId='+randomUUID()));await signIn(page,owner);await ready;await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible();if(initiallySaved){await page.getByRole('button',{name:'Remove bookmark',exact:true}).click();await expect(page.getByRole('button',{name:'Bookmark guide',exact:true})).toBeVisible()}
  expect((await owner.client.from('guide_saves').select('id').eq('guide_id',summaryId)).data).toHaveLength(initiallySaved?0:1);release();await delivery;await page.waitForLoadState('networkidle');await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(page.getByRole('button',{name:initiallySaved?'Bookmark guide':'Remove bookmark',exact:true})).toBeVisible();
 }finally{release()}
});
test('guide bookmark lost acknowledgement retries the original committed intent',async({page})=>{
 const owner=await actor(),requests:string[]=[];let fail=true;await page.route('**/api/bookmarks',async route=>{if(route.request().method()!=='POST')return route.continue();requests.push(route.request().postDataJSON().requestId);if(fail){fail=false;const response=await route.fetch();expect(response.ok()).toBe(true);expect((await response.json()).data.saved).toBe(true);return route.abort()}return route.continue()});await page.goto('/en/sign-in?next='+encodeURIComponent('/en/g/'+summaryId+'?bookmark=1&requestId='+randomUUID()));await signIn(page,owner);
 await expect(page.getByRole('button',{name:'Retry bookmark change',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toHaveCount(0);expect((await owner.client.from('guide_saves').select('id').eq('guide_id',summaryId)).data).toHaveLength(1);await page.getByRole('button',{name:'Retry bookmark change',exact:true}).click();await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible();expect(requests).toHaveLength(2);expect(requests[1]).toBe(requests[0]);expect((await owner.client.from('guide_saves').select('id').eq('guide_id',summaryId)).data).toHaveLength(1);expect((await owner.client.from('trips').select('id')).data).toHaveLength(0);
});
test('bookmark pagination crosses100 tied timestamps and older guide remains saved',async({page})=>{
 const owner=await actor(),rows=await pagedBookmarks(owner),pages:{data:{guide_id:string}[];nextCursor:unknown}[]=[];
 page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/bookmarks'&&!new URL(response.url()).searchParams.has('guideId')&&response.ok())pages.push(await response.json())});await openBookmarks(page,owner);
 await expect(page.locator('.k-page li a')).toHaveCount(100);expect(pages).toHaveLength(1);expect((await (await page.request.get('/api/bookmarks?guideId='+rows[102].id)).json()).data.map((row:{guide_id:string})=>row.guide_id)).toEqual([rows[102].id]);expect(pages[0].data.map(row=>row.guide_id)).toEqual(rows.slice(0,100).map(row=>row.id));
 expect((await owner.client.rpc('kinnso_bookmark',{p_guide_id:rows[99].id,p_desired_state:false,p_request_id:randomUUID()})).error).toBeNull();
 await page.getByRole('button',{name:'More bookmarks',exact:true}).click();await expect(page.locator('.k-page li a')).toHaveCount(103);expect(pages).toHaveLength(2);expect(pages[1].data.map(row=>row.guide_id)).toEqual(rows.slice(100).map(row=>row.id));expect(pages[1].nextCursor).toBeNull();await expect(page.getByRole('button',{name:'More bookmarks',exact:true})).toHaveCount(0);expect((await owner.client.rpc('kinnso_bookmark',{p_guide_id:rows[99].id,p_desired_state:true,p_request_id:randomUUID()})).error).toBeNull();
 const cursor=pages[0].nextCursor as {createdAt:string;guideId:string},cursorQuery='?before='+encodeURIComponent(cursor.createdAt)+'&beforeGuide='+cursor.guideId;
 for(const query of ['?before=bad&beforeGuide='+rows[0].id,'?before='+encodeURIComponent(cursor.createdAt),'?guideId=bad',cursorQuery+'&guideId='+rows[0].id,'?before='+encodeURIComponent(cursor.createdAt+',traveler_user_id.neq.null')+'&beforeGuide='+rows[0].id])expect((await page.request.get('/api/bookmarks'+query)).status()).toBe(400);
 await page.goto('/en/g/'+rows[102].id);await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible();await page.getByRole('button',{name:'Remove bookmark',exact:true}).click();await expect(page.getByRole('button',{name:'Bookmark guide',exact:true})).toBeVisible();expect((await owner.client.from('guide_saves').select('id').eq('guide_id',rows[102].id)).data).toHaveLength(0);expect((await owner.client.from('trips').select('id')).data).toHaveLength(0);
 await page.goto('/en/saved');await expect(page.locator('.k-page li a')).toHaveCount(100);await page.getByRole('button',{name:'More bookmarks',exact:true}).click();await expect(page.locator('.k-page li a')).toHaveCount(102);await page.goto('/en/me');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/en/sign-in');await openBookmarks(page,b);await expect(page.getByText('No bookmarks yet.',{exact:true})).toBeVisible();expect((await page.request.get('/api/bookmarks'+cursorQuery)).status()).toBe(200);expect((await (await page.request.get('/api/bookmarks?guideId='+rows[0].id)).json()).data).toHaveLength(0);
});
test('bookmark pagination and initial load retry preserve persisted rows',async({page})=>{
 const owner=await actor(),rows=await pagedBookmarks(owner);let first=true;await page.route('**/api/bookmarks',route=>{if(first){first=false;return route.abort()}return route.continue()});await openBookmarks(page,owner);await expect(page.locator('.k-page').getByRole('alert')).toContainText('Bookmarks could not be loaded');await page.getByRole('button',{name:'Retry bookmarks',exact:true}).click();await expect(page.locator('.k-page li a')).toHaveCount(100);
 let fail=true;const queries:string[]=[];await page.route('**/api/bookmarks?before=*',route=>{queries.push(route.request().url());if(fail){fail=false;return route.abort()}return route.continue()});await page.getByRole('button',{name:'More bookmarks',exact:true}).click();await expect(page.locator('.k-page').getByRole('alert')).toContainText('Bookmarks could not be loaded');await expect(page.locator('.k-page li a')).toHaveCount(100);await expect(page.getByRole('link',{name:rows[0].title,exact:true})).toBeVisible();await page.getByRole('button',{name:'Retry bookmarks',exact:true}).click();await expect(page.locator('.k-page li a')).toHaveCount(103);expect(queries).toHaveLength(2);expect(queries[1]).toBe(queries[0]);
});
test('bookmark pagination late page cannot append the previous account bookmarks',async({page})=>{
 const previous=await actor(),current=await actor(),rows=await pagedBookmarks(previous),other=await pagedBookmarks(current,1);await openBookmarks(page,previous);await expect(page.locator('.k-page li a')).toHaveCount(100);
 let release!:()=>void,persisted!:()=>void,delivered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{persisted=resolve}),delivery=new Promise<void>(resolve=>{delivered=resolve});await page.route('**/api/bookmarks?before=*',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);expect((await response.json()).data.map((row:{guide_id:string})=>row.guide_id)).toEqual(rows.slice(100).map(row=>row.id));persisted();await held;await route.fulfill({response});delivered()});let account:Page|null=null;
 try{await page.getByRole('button',{name:'More bookmarks',exact:true}).click();await ready;account=await page.context().newPage();await account.goto('/en/me');await account.getByRole('button',{name:'Sign out',exact:true}).click();await account.waitForURL('**/en/sign-in');await openBookmarks(account,current);await expect(account.getByRole('link',{name:other[0].title,exact:true})).toBeVisible();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.getByRole('link',{name:rows[0].title,exact:true})).toHaveCount(0);release();await delivery;await page.waitForLoadState('networkidle');await expect(page.getByRole('link',{name:other[0].title,exact:true})).toBeVisible();for(const row of rows.slice(100))await expect(page.getByRole('link',{name:row.title,exact:true})).toHaveCount(0)}finally{release();await account?.close()}
});
for(const locale of ['en','zh-HK'])test('guide original text and unknown metadata '+locale,async({page})=>{
 await page.goto('/'+locale+'/g/'+summaryId);
 await expect(page.getByText(locale==='en'?'Guide text is shown as published by its author.':'攻略原文依作者發布內容顯示。',{exact:true})).toBeVisible();
 await expect(page.getByText(locale==='en'?'Last updated: not provided.':'最後更新：來源未提供。',{exact:true})).toBeVisible();
 await expect(page.getByText(locale==='en'?'Opening hours: not provided. Confirm before travelling.':'營業時間：來源未提供，出發前請核實。',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:locale==='en'?'Plan as a device-only draft':'以裝置草稿規劃',exact:true})).toHaveCount(0);
});

test('anonymous bookmark returns once; summary never offers invented itinerary',async({page})=>{test.setTimeout(90000);await page.goto('/en/g/'+summaryId);await expect(page.getByText('This is a summary guide. It has no structured itinerary to apply.')).toBeVisible({timeout:15000});await expect(page.getByRole('button',{name:'Apply published itinerary',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Bookmark guide',exact:true}).click();await page.waitForURL('**/sign-in?*');await signIn(page);await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible({timeout:20000});await page.reload();await expect(page.getByRole('button',{name:'Remove bookmark',exact:true})).toBeVisible();const saved=await a.client.from('guide_saves').select('id').eq('guide_id',summaryId);expect(saved.data).toHaveLength(1);expect((await b.client.from('guide_saves').select('id').eq('guide_id',summaryId)).data).toHaveLength(0)});
test('saved guest copy survives reload, a new guide version and cancelled sign-in before explicit import',async({page})=>{
 test.setTimeout(120000);
 const id=await guide('Synthetic recoverable device walk'),content=(title:string)=>({days:[{offset:0,title:'Original authored day',stops:[{title,description:'Authored directions',placeId:null,startMinuteOfDay:600,durationMinutes:30}]}]});
 expect((await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:content('Version one source stop')})).error).toBeNull();
 await page.goto('/en/g/'+id);await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();
 await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 await page.getByLabel('Draft stop title',{exact:true}).fill('   ');await page.getByLabel('Draft private note',{exact:true}).fill('My note before reload');
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 const copies=()=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const r=indexedDB.open('kinnso_guest_drafts_v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('trips').objectStore('trips').getAll();q.onsuccess=()=>{resolve(q.result);db.close()};q.onerror=()=>{db.close();reject(q.error)}};r.onerror=()=>reject(r.error)}));
 const original=(await copies())[0];expect(original.days[0].stops[0].source.version).toBe(1);
 expect((await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:1,p_request_id:randomUUID(),p_content:content('New version two stop')})).error).toBeNull();
 await page.reload();await expect(page.getByLabel('Draft private note',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Find saved device drafts',exact:true}).click();
 const restore=page.locator('[data-draft-id="'+original.id+'"]');await expect(restore).toContainText('v1');await restore.click();
 await expect(page.getByLabel('Draft stop title',{exact:true})).toHaveValue('   ');await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('My note before reload');
 await page.getByRole('link',{name:'Sign in to review import',exact:true}).click();await page.getByRole('link',{name:'Cancel and return',exact:true}).click();await page.waitForURL('**/en/trips');
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic recoverable device walk',exact:true}).click();
 await expect(page.locator('.k-page').getByRole('alert')).toContainText('needs editing');await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('My note after recovery');await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByRole('status',{name:'Local import status',exact:true})).toContainText('Device draft saved.');
 expect((await copies()).map(row=>row.id)).toEqual([original.id]);
 await page.locator('.k-page').getByRole('link',{name:'Sign in',exact:true}).click();await page.getByRole('link',{name:'Cancel and return',exact:true}).click();await page.waitForURL('**/en/trips');
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic recoverable device walk',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toHaveCount(0);expect((await copies()).map(row=>row.id)).toEqual([original.id]);
 await page.locator('.k-page').getByRole('link',{name:'Sign in',exact:true}).click();await signIn(page);await page.waitForURL('**/en/trips');
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic recoverable device walk',exact:true}).click();
 await expect(page.locator('.k-page').getByRole('alert')).toContainText('needs editing');await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 await expect(page.getByRole('button',{name:'Plan as a device-only draft',exact:true})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('My note after recovery');await page.getByLabel('Draft stop title',{exact:true}).fill('My edited device stop');
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByRole('status',{name:'Local import status',exact:true})).toContainText('Device draft saved.');await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic recoverable device walk',exact:true}).click();
 const imported=page.waitForResponse(r=>r.url().endsWith('/api/trips/import')&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirm import to this account',exact:true}).click();
 const snapshot=(await (await imported).json()).data;expect(snapshot.days[0].stops[0].travellerNote).toBe('My note after recovery');expect(snapshot.days[0].stops[0].title).toBe('My edited device stop');expect(snapshot.days[0].stops[0].source).toBeNull();
 expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:snapshot.id})).data.days[0].stops[0].travellerNote).toBe('My note after recovery');
 expect((await copies()).map(row=>row.id)).toEqual([original.id]);
});
test('a saved device draft can be repaired anonymously and after sign-in when its source is withdrawn',async({page})=>{
 test.setTimeout(120000);
 const id=await guide('Synthetic withdrawn-source personal draft');
 expect((await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:{days:[{offset:0,title:'Original published day',stops:[{title:'Original source stop',description:'Synthetic authored route',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}]}})).error).toBeNull();
 await page.goto('/en/g/'+id);await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 await page.getByLabel('Draft stop title',{exact:true}).fill('');await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('My personal note before withdrawal');await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 const copies=()=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const r=indexedDB.open('kinnso_guest_drafts_v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('trips').objectStore('trips').getAll();q.onsuccess=()=>{resolve(q.result);db.close()};q.onerror=()=>{db.close();reject(q.error)}};r.onerror=()=>reject(r.error)}));
 const original=(await copies())[0],withdrawn=await admin.from('guides').update({status:'draft'}).eq('id',id).select('status').single();expect(withdrawn.error).toBeNull();expect(withdrawn.data!.status).toBe('draft');expect((await page.request.get('/api/guides/'+id)).status()).toBe(404);
 const sourceRequests:string[]=[];page.on('request',request=>{const path=new URL(request.url()).pathname;if(path==='/api/guides/'+id||path==='/en/g/'+id)sourceRequests.push(path)});
 await page.goto('/en/trips');await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic withdrawn-source personal draft',exact:true}).click();
 await expect(page.locator('.k-page').getByRole('alert')).toContainText('needs editing');await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('My personal note before withdrawal');expect(page.url()).toMatch(/\/en\/trips$/);await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Personal note repaired without a published source');await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveCount(0);
 expect((await copies())[0].days[0].stops[0].travellerNote).toBe('Personal note repaired without a published source');
 await page.locator('.k-page').getByRole('link',{name:'Sign in',exact:true}).click();await signIn(page);await page.waitForURL('**/en/trips');
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic withdrawn-source personal draft',exact:true}).click();await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('Personal note repaired without a published source');await page.getByLabel('Draft stop title',{exact:true}).fill('My repaired device stop');await page.getByRole('button',{name:'Save device draft',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveCount(0);
 const imported=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/trips/import'&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirm import to this account',exact:true}).click();const snapshot=(await (await imported).json()).data;
 expect(snapshot.days[0].stops[0].source).toBeNull();expect(snapshot.days[0].stops[0].travellerNote).toBe('Personal note repaired without a published source');expect(snapshot.days[0].stops[0].title).toBe('My repaired device stop');expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:snapshot.id})).data.days[0].stops[0].travellerNote).toBe('Personal note repaired without a published source');expect((await b.client.rpc('get_trip_snapshot',{p_trip_id:snapshot.id})).error?.message).toContain('trip_not_found');
 const retained=await copies();expect(retained.map(row=>row.id)).toEqual([original.id]);expect(retained[0].ownerId).toBe(original.ownerId);expect(retained[0].source).toEqual(original.source);expect(retained[0].days[0].stops[0].travellerNote).toBe('Personal note repaired without a published source');expect(sourceRequests).toEqual([]);
});
for(const scenario of ['unsaved','pending-save'])test(`device repair retains ${scenario} notes through account invalidation and a failed save`,async({page})=>{
 test.setTimeout(120000);
 const title='Synthetic device account recovery '+scenario,id=await guide(title),note='Newest personal note after '+scenario;
 expect((await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:{days:[{offset:0,title:'Device day',stops:[{title:'Device stop',description:'Synthetic route',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}]}})).error).toBeNull();
 await page.goto('/en/g/'+id);await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 await page.getByRole('link',{name:'Sign in to review import',exact:true}).click();await signIn(page);await page.waitForURL('**/en/trips');await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 const notes=page.getByRole('textbox',{name:'Draft private note',exact:true});
 if(scenario==='pending-save'){
  await page.evaluate(()=>{
   const descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete')!,state={captured:false,release:()=>{},restore:()=>Object.defineProperty(IDBTransaction.prototype,'oncomplete',descriptor)};
   (window as unknown as {deviceSaveHold:typeof state}).deviceSaveHold=state;
   Object.defineProperty(IDBTransaction.prototype,'oncomplete',{configurable:true,get(){return descriptor.get!.call(this)},set(handler){
    if(this.db.name==='kinnso_guest_drafts_v1'&&this.mode==='readwrite'&&!state.captured){state.captured=true;descriptor.set!.call(this,(event:Event)=>{state.release=()=>{state.release=()=>{};handler?.call(this,event)}})}else descriptor.set!.call(this,handler);
   }});
  });
  await notes.fill('Older submitted note');await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Saving device draft');
 }
 await notes.fill(note);let account:Page|null=null;
 try{
  account=await page.context().newPage();await account.goto('/en/me');await account.getByRole('button',{name:'Sign out',exact:true}).click();await account.waitForURL('**/en/sign-in');
  await expect(page.getByLabel('Trip title',{exact:true})).toHaveCount(0);await expect(notes).toHaveCount(0);await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Continue editing this device draft',exact:true})).toBeVisible();await page.getByRole('button',{name:'Continue editing this device draft',exact:true}).click();await expect(notes).toHaveValue(note);
  if(scenario==='pending-save'){await page.evaluate(()=>{const state=(window as any).deviceSaveHold;state.release();state.restore()});await expect(page.getByTestId('guest-save-state')).toContainText('not saved yet');await expect(notes).toHaveValue(note)}
  await account.goto('/en/sign-in?next='+encodeURIComponent('/en/trips'));await signIn(account,b);await account.waitForURL('**/en/trips');await page.bringToFront();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button',{name:'Continue editing this device draft',exact:true})).toBeVisible();await expect(notes).toHaveCount(0);await page.getByRole('button',{name:'Continue editing this device draft',exact:true}).click();await expect(notes).toHaveValue(note);
  await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;(window as any).restoreDeviceQuota=()=>{IDBDatabase.prototype.transaction=original};IDBDatabase.prototype.transaction=function(stores,mode,options){if(this.name==='kinnso_guest_drafts_v1'&&mode==='readwrite')throw new DOMException('Synthetic quota failure','QuotaExceededError');return original.call(this,stores,mode,options)}});
  await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('not saved');await expect(notes).toHaveValue(note);await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toHaveCount(0);await page.evaluate(()=>{(window as any).restoreDeviceQuota()});
  await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByRole('status',{name:'Local import status',exact:true})).toContainText('Device draft saved.');
  const imported=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/trips/import'&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirm import to this account',exact:true}).click();const snapshot=(await (await imported).json()).data;expect(snapshot.days[0].stops[0].travellerNote).toBe(note);expect((await b.client.rpc('get_trip_snapshot',{p_trip_id:snapshot.id})).data.days[0].stops[0].travellerNote).toBe(note);expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:snapshot.id})).error?.message).toContain('trip_not_found');
 }finally{if(scenario==='pending-save')await page.evaluate(()=>{const state=(window as any).deviceSaveHold;state?.release();state?.restore()}).catch(()=>{});await page.evaluate(()=>{(window as any).restoreDeviceQuota?.()}).catch(()=>{});await account?.close()}
});
test('large bounded device notes save and reload while the account import size gate stays closed',async({page})=>{
 test.setTimeout(150000);
 const id=await guide('Synthetic large recoverable notes'),note='n'.repeat(4000),content={days:Array.from({length:3},(_,offset)=>({offset,title:'Authored day '+offset,stops:Array.from({length:25},(_,i)=>({title:'Stop '+offset+'-'+i,description:'Authored directions',placeId:null,startMinuteOfDay:null,durationMinutes:null}))}))};
 expect((await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:content})).error).toBeNull();
 await page.goto('/en/g/'+id);await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 const notes=page.getByRole('textbox',{name:'Draft private note',exact:true});await expect(notes).toHaveCount(75);for(let i=0;i<75;i++)await notes.nth(i).fill(note);
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 const copies=()=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const r=indexedDB.open('kinnso_guest_drafts_v1');r.onsuccess=()=>{const db=r.result,q=db.transaction('trips').objectStore('trips').getAll();q.onsuccess=()=>{resolve(q.result);db.close()};q.onerror=()=>{db.close();reject(q.error)}};r.onerror=()=>reject(r.error)}));
 const original=(await copies())[0];expect(Buffer.byteLength(JSON.stringify(original),'utf8')).toBeGreaterThan(262144);
 await page.reload();await page.getByRole('button',{name:'Find saved device drafts',exact:true}).click();await page.locator('[data-draft-id="'+original.id+'"]').click();
 await expect(notes).toHaveCount(75);for(let i=0;i<75;i++)await expect(notes.nth(i)).toHaveValue(note);
 await page.goto('/en/trips');await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic large recoverable notes',exact:true}).click();
 await expect(page.locator('.k-page').getByRole('alert')).toContainText('exceeds the account import limit');await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();await expect(page.getByRole('textbox',{name:'Draft private note',exact:true}).nth(74)).toHaveValue(note);await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toHaveCount(0);
 const retained=await copies();expect(retained.map(row=>row.id)).toEqual([original.id]);expect(retained[0].days[2].stops[24].travellerNote).toBe(note);
});
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
 await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();await expect(page.getByRole('status',{name:'Guide action status',exact:true})).toContainText('Trip changed. Review the current version before applying.');await expect(preview).toHaveCount(0);
 await page.getByRole('button',{name:'Apply published itinerary',exact:true}).click();await expect(preview).toContainText('Changed before confirmation');
 let committedRevision=0;const requests:string[]=[];const path='**/api/trips/'+tripId+'/adopt';
 await page.route(path,async route=>{requests.push(route.request().postDataJSON().requestId);const response=await route.fetch();committedRevision=(await response.json()).data.revision;await route.abort('failed')});
 await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();await expect(page.getByRole('status',{name:'Guide action status',exact:true})).toContainText('Application was not confirmed.');await page.unroute(path);
 const retry=page.waitForRequest(r=>r.url().endsWith('/api/trips/'+tripId+'/adopt'));await page.getByRole('button',{name:'Confirm apply to this trip',exact:true}).click();expect((await retry).postDataJSON().requestId).toBe(requests[0]);await page.waitForURL('**/en/trips/'+tripId);
 await expect(page.getByLabel('Private note',{exact:true}).first()).toHaveValue('My version-one private note');await page.reload();const result=(await a.client.rpc('get_trip_snapshot',{p_trip_id:tripId})).data;expect(result.revision).toBe(committedRevision);expect(result.days).toHaveLength(2);expect(result.days[0].stops[0].source.guideVersion).toBe(1);expect(result.days[1].stops[0].source.guideVersion).toBe(2);expect(result.days[0].stops[0].travellerNote).toBe('My version-one private note');
});
