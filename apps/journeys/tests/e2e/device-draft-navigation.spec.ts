import {test,expect,type Page} from '@playwright/test';
import {loadEnvFile} from 'node:process';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
let authorId:string,guideId:string,authorEmail:string,authorPassword:string,authorClient:typeof admin;
test.beforeAll(async()=>{
 authorEmail=`synthetic-navigation-${randomUUID()}@example.test`;authorPassword=`Nav!${randomUUID()}`;const user=await admin.auth.admin.createUser({email:authorEmail,password:authorPassword,email_confirm:true});expect(user.error).toBeNull();authorId=user.data.user!.id;
 expect((await admin.from('creators').update({status:'active'}).eq('id',authorId)).error).toBeNull();
 const row=await admin.from('guides').insert({creator_id:authorId,creator_name:'Synthetic local navigation author',creator_handle:'synthetic',slug:'synthetic-'+randomUUID(),title:'Synthetic navigation route',summary:'Owned local test only',cover_url:'',city:'Kyoto',status:'published',published_at:new Date().toISOString()}).select('id').single();expect(row.error).toBeNull();guideId=row.data!.id;
 const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!);authorClient=client;expect((await client.auth.signInWithPassword({email:authorEmail,password:authorPassword})).error).toBeNull();
 expect((await client.rpc('publish_guide_version',{p_guide_id:guideId,p_expected_version:0,p_request_id:randomUUID(),p_content:{days:[{offset:0,title:'Authored day',stops:[{title:'Authored stop',description:'Original source',placeId:null,startMinuteOfDay:540,durationMinutes:30}]}]}})).error).toBeNull();
});
test.afterAll(async()=>{if(authorId)expect((await admin.auth.admin.deleteUser(authorId)).error).toBeNull()});
async function saved(page:Page){await page.goto('/en/g/'+guideId);await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');}
async function copies(page:Page){return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const r=indexedDB.open('kinnso_guest_drafts_v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('trips').objectStore('trips').getAll();q.onsuccess=()=>{resolve(q.result);db.close()};q.onerror=()=>{reject(q.error);db.close()}};r.onerror=()=>reject(r.error)}));}
async function resume(page:Page,id:string){await page.getByRole('button',{name:'Find saved device drafts',exact:true}).click();await page.locator('[data-draft-id="'+id+'"]').click();}
for(const [name,destination] of [['Home','/en'],['Explore','/en/explore'],['My trips','/en/trips'],['繁中','/zh-HK/g/']] as const)test('unsaved device draft protects '+name+' and only leaves after confirmed save',async({page})=>{
 await saved(page);const original=(await copies(page))[0];await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Latest before '+name);
 const link=page.locator('a[href="'+(destination.endsWith('/g/')?destination+guideId:destination)+'"]').first();await link.click();const dialog=page.getByRole('dialog',{name:'Unsaved device draft',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Continue editing',exact:true}).click();await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('Latest before '+name);
 await link.click();await dialog.getByRole('button',{name:'Save and leave',exact:true}).click();await page.waitForURL(destination.endsWith('/g/')?'**'+destination+guideId:'**'+destination);
 const stored=await copies(page);expect(stored).toHaveLength(1);expect(stored[0].id).toBe(original.id);expect(stored[0].days[0].stops[0].travellerNote).toBe('Latest before '+name);
 await page.goto('/en/g/'+guideId);await resume(page,original.id);await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('Latest before '+name);
});
test('discard keeps the last stored copy; quota failure keeps the editor and can retry',async({page})=>{
 await saved(page);const original=(await copies(page))[0];await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Memory only');await page.getByRole('link',{name:'Explore',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'Discard unsaved edits',exact:true}).click();await page.waitForURL('**/en/explore');expect((await copies(page))[0].days[0].stops[0].travellerNote).toBe('');
 await page.goto('/en/g/'+guideId);await resume(page,original.id);await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Retry this note');
 await page.evaluate(()=>{const proto=IDBObjectStore.prototype;(window as any).originalPut=proto.put;proto.put=function(){throw new DOMException('Synthetic quota','QuotaExceededError')}});
 await page.getByRole('link',{name:'Explore',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'Save and leave',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('not saved');await expect(page.locator('#k-main textarea')).toHaveValue('Retry this note');
 await page.evaluate(()=>{IDBObjectStore.prototype.put=(window as any).originalPut});await page.getByRole('dialog').getByRole('button',{name:'Save and leave',exact:true}).click();await page.waitForURL('**/en/explore');expect((await copies(page))[0].days[0].stops[0].travellerNote).toBe('Retry this note');
});
test('real Back and Forward are cancelable without destroying forward history',async({page})=>{
 await page.goto('/en/explore?q='+encodeURIComponent('Synthetic navigation route'));await page.getByRole('link',{name:'Synthetic navigation route',exact:true}).click();await page.waitForURL('**/en/g/'+guideId);await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');const original=(await copies(page))[0];
 await page.getByRole('link',{name:'My trips',exact:true}).first().click();await page.waitForURL('**/en/trips');await page.goBack();await page.waitForURL('**/en/g/'+guideId);await resume(page,original.id);await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Forward must retain this');
 await page.goForward({timeout:1500}).catch(()=>{});await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Continue editing',exact:true}).click();await expect(page).toHaveURL('http://127.0.0.1:3495/en/g/'+guideId);
 await page.goForward({timeout:1500}).catch(()=>{});await page.getByRole('dialog').getByRole('button',{name:'Save and leave',exact:true}).click();await page.waitForURL('**/en/trips');await page.goBack();await page.waitForURL('**/en/g/'+guideId);await resume(page,original.id);
 // Next may restore the earlier Explore entry as a different document. Use
 // its documented Native History API to guarantee a same-document Back entry;
 // cross-document Back is independently tested against the native warning.
 await page.evaluate(()=>window.history.pushState(null,'',location.pathname+'?device-view=1'));
 await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Back must retain this');
 await expect(page.getByTestId('guest-save-state')).toContainText('not saved yet');
 await page.goBack({timeout:1500}).catch(()=>{});await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Save and leave',exact:true}).click();await page.waitForURL('**/en/g/'+guideId);expect((await copies(page))[0].days[0].stops[0].travellerNote).toBe('Back must retain this');
});
test('deletion is confirmed for one device copy and leaves another copy intact',async({page})=>{
 await saved(page);const first=(await copies(page))[0];await page.reload();await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');const rows=await copies(page);expect(rows).toHaveLength(2);const second=rows.find(row=>row.id!==first.id)!;
 await page.getByRole('button',{name:'Delete this device draft',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Keep device draft',exact:true}).click();expect(await copies(page)).toHaveLength(2);
 await page.getByRole('button',{name:'Delete this device draft',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete device copy',exact:true}).click();await expect(page.getByRole('button',{name:'Plan as a device-only draft',exact:true})).toBeVisible();const kept=await copies(page);expect(kept.map(row=>row.id)).toEqual([first.id]);expect(kept.find(row=>row.id===second.id)).toBeUndefined();await resume(page,first.id);await expect(page.getByLabel('Draft stop title',{exact:true})).toHaveValue('Authored stop');
});
test('continuing while a committed IndexedDB acknowledgement is held cancels the pending navigation',async({page})=>{
 await saved(page);await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Real stored note after cancel');
 await page.evaluate(()=>{const proto=IDBObjectStore.prototype,original=proto.put;proto.put=function(...args:Parameters<IDBObjectStore['put']>){const request=original.apply(this,args),tx=this.transaction;queueMicrotask(()=>{const completed=tx.oncomplete;tx.oncomplete=function(event){(window as any).heldAck=true;(window as any).releaseAck=()=>completed?.call(tx,event);}});return request;};(window as any).restorePut=()=>{proto.put=original;};});
 await page.getByRole('link',{name:'Explore',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'Save and leave',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).heldAck===true)).toBe(true);
 expect((await copies(page))[0].days[0].stops[0].travellerNote).toBe('Real stored note after cancel');await page.getByRole('dialog').getByRole('button',{name:'Continue editing',exact:true}).click();
 await page.evaluate(()=>{(window as any).restorePut();(window as any).releaseAck();});await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');await expect(page).toHaveURL('http://127.0.0.1:3495/en/g/'+guideId);await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('Real stored note after cancel');
});
test('selected-copy deletion from account import keeps the persisted account trip',async({page})=>{
 await saved(page);const original=(await copies(page))[0],created=await authorClient.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic account copy kept during device deletion',timezone:'UTC'}});expect(created.error).toBeNull();const trip=created.data;
 await page.goto('/en/sign-in?next=/en/trips');await page.getByLabel('Email',{exact:true}).fill(authorEmail);await page.getByLabel('Password',{exact:true}).fill(authorPassword);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/en/trips');
 await page.getByRole('button',{name:'Preview device-only drafts',exact:true}).click();await page.getByRole('button',{name:'Synthetic navigation route',exact:true}).click();await page.getByRole('button',{name:'Edit this saved device draft',exact:true}).click();
 await page.getByRole('button',{name:'Delete this device draft',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete device copy',exact:true}).click();await expect(page.getByRole('status',{name:'Local import status',exact:true})).toContainText('device copy was deleted');expect(await copies(page)).toEqual([]);
 const persisted=await authorClient.rpc('get_trip_snapshot',{p_trip_id:trip.id});expect(persisted.error).toBeNull();expect(persisted.data.title).toBe(trip.title);expect(persisted.data.revision).toBe(trip.revision);expect((await page.request.get('/api/trips/'+trip.id)).status()).toBe(200);expect(original.id).not.toBe(trip.id);
});
test('programmatic bookmark sign-in protects the dirty device copy and preserves its original task',async({page})=>{
 await saved(page);await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Keep this note while bookmarking');await page.getByRole('button',{name:'Bookmark guide',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Unsaved device draft',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Continue editing',exact:true}).click();await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('Keep this note while bookmarking');
 await page.getByRole('button',{name:'Bookmark guide',exact:true}).click();await dialog.getByRole('button',{name:'Save and leave',exact:true}).click();await page.waitForURL('**/en/sign-in?*');const next=new URL(page.url()).searchParams.get('next')!;expect(next).toContain('/en/g/'+guideId+'?bookmark=1');expect((await copies(page))[0].days[0].stops[0].travellerNote).toBe('Keep this note while bookmarking');
});
test('uncancelable cross-document Back has the native warning; save then Back preserves the copy',async({page})=>{
 await page.goto('/en/explore');await saved(page);await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Keep this cross-document note');let type='';
 page.once('dialog',async dialog=>{type=dialog.type();await dialog.dismiss()});await page.goBack({timeout:1500}).catch(()=>{});expect(type).toBe('beforeunload');await expect(page).toHaveURL('http://127.0.0.1:3495/en/g/'+guideId);await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('Keep this cross-document note');
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');await page.goBack();await page.waitForURL('**/en/explore');expect((await copies(page))[0].days[0].stops[0].travellerNote).toBe('Keep this cross-document note');
});

for(const labels of [
 {locale:'en',plan:'Plan as a device-only draft',saved:'Device draft saved.',remove:'Delete this device draft',title:'Delete device copy?',confirm:'Delete device copy',deleted:'This device copy was deleted.',find:'Find saved device drafts',stop:'Draft stop title'},
 {locale:'zh-HK',plan:'以裝置草稿規劃',saved:'裝置草稿已保存',remove:'刪除此裝置草稿',title:'刪除此裝置副本？',confirm:'刪除裝置副本',deleted:'此裝置副本已刪除',find:'尋找已保存的裝置草稿',stop:'草稿站點名稱'},
])test('Escape respects an in-flight device deletion and ordinary cancellation ('+labels.locale+')',async({page})=>{
 await page.goto('/'+labels.locale+'/g/'+guideId);
 await page.getByRole('button',{name:labels.plan,exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText(labels.saved);
 const first=(await copies(page))[0];
 await page.reload();await page.getByRole('button',{name:labels.plan,exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText(labels.saved);
 const second=(await copies(page)).find(row=>row.id!==first.id)!;
 const opener=page.getByRole('button',{name:labels.remove,exact:true}),dialog=page.getByRole('dialog',{name:labels.title,exact:true});
 await opener.click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();expect(await copies(page)).toHaveLength(2);
 await opener.click();
 // Keep the real IndexedDB transaction and its committed bytes. Only hold
 // acknowledgement to exercise the owner's existing busy close guard.
 await page.evaluate(target=>{
  const proto=IDBObjectStore.prototype,original=proto.delete;
  proto.delete=function(...args:Parameters<IDBObjectStore['delete']>){
   const request=original.apply(this,args),tx=this.transaction;
   if(args[0]===target)queueMicrotask(()=>{const completed=tx.oncomplete;tx.oncomplete=function(event){(window as any).heldDeleteAck=true;(window as any).releaseDeleteAck=()=>completed?.call(tx,event);};});
   return request;
  };
  (window as any).restoreDelete=()=>{proto.delete=original;};
 },second.id);
 try{
  await dialog.getByRole('button',{name:labels.confirm,exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).heldDeleteAck===true)).toBe(true);
  await expect(dialog.getByRole('button',{name:labels.confirm,exact:true})).toBeDisabled();
  expect((await copies(page)).map(row=>row.id)).toEqual([first.id]);
  await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Close / 關閉',exact:true}).click();await expect(dialog).toBeVisible();
 }finally{
  await page.evaluate(()=>{(window as any).restoreDelete?.();(window as any).releaseDeleteAck?.();});
 }
 await expect(dialog).not.toBeVisible();await expect(page.getByTestId('guest-save-state')).toContainText(labels.deleted);
 expect((await copies(page)).map(row=>row.id)).toEqual([first.id]);
 await page.reload();await page.getByRole('button',{name:labels.find,exact:true}).click();await page.locator('[data-draft-id="'+first.id+'"]').click();await expect(page.getByLabel(labels.stop,{exact:true})).toHaveValue('Authored stop');
});
