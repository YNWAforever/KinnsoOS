import {test,expect} from '@playwright/test';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
let email:string,password:string,userId:string;
test.beforeAll(async()=>{email=`synthetic-ui-${randomUUID()}@example.test`;password=`UI!${randomUUID()}`;
 const result=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull();userId=result.data.user!.id;});
test.afterAll(async()=>{if(userId)expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull()});
async function login(page:import('@playwright/test').Page,next='/en/trips') {
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/en/sign-in?next='+encodeURIComponent(next));await page.getByLabel('Email').fill(email);await page.getByLabel('Password').fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**'+next);
 await expect(page.locator('[data-ready="true"]'),errors.join('\n')).toBeVisible({timeout:15000});
}
test('real account creates and edits a trip, and a second browser context sees the saved note',async({page,browser})=>{
 test.setTimeout(120000);
 await login(page);await page.getByLabel('Trip title',{exact:true}).fill('Synthetic durable traveller trip');const acknowledged=page.waitForResponse(response=>response.url().endsWith('/api/trips')&&response.request().method()==='POST');await page.getByRole('button',{name:'Create trip',exact:true}).click();const created=await acknowledged;expect(created.status(),JSON.stringify(await created.json())).toBe(201);await page.waitForURL(/\/en\/trips\/[0-9a-f-]+$/);
 const path=new URL(page.url()).pathname;
 await page.getByRole('button',{name:'Add day',exact:true}).click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
 await page.getByRole('button',{name:'Add stop',exact:true}).click();await page.getByLabel('Private note',{exact:true}).fill('PRIVATE U01 persisted note');const savedNote=page.waitForResponse(response=>response.url().endsWith('/commands')&&response.request().method()==='POST');await page.getByRole('button',{name:'Save stop',exact:true}).click();const noteResponse=await savedNote;expect(noteResponse.status()).toBe(200);expect((await noteResponse.json()).data.days[0].stops[0].travellerNote).toBe('PRIVATE U01 persisted note');await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
 await page.reload();await expect(page.getByLabel('Private note',{exact:true})).toHaveValue('PRIVATE U01 persisted note',{timeout:15000});
 await page.getByRole('button',{name:'Add day',exact:true}).click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
 const beforeMove=(await (await page.request.get('/api/trips/'+path.split('/').pop())).json()).data;
 await page.getByLabel('Move to day',{exact:true}).selectOption(beforeMove.days[1].id);await page.getByRole('button',{name:'Move stop',exact:true}).click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
 await page.getByLabel('Day title',{exact:true}).nth(1).fill('Synthetic moved day');await page.getByLabel('Day offset (first day is 0)',{exact:true}).nth(1).fill('3');await page.getByRole('button',{name:'Save day',exact:true}).nth(1).click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
 await page.getByLabel('Start date (optional)',{exact:true}).fill('2030-06-01');await page.getByLabel('Time zone',{exact:true}).fill('Asia/Tokyo');await page.getByRole('button',{name:'Save trip details',exact:true}).click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');
 await page.getByRole('button',{name:'Remove day',exact:true}).first().click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');await page.reload();
 await expect(page.getByLabel('Day title',{exact:true})).toHaveValue('Synthetic moved day');await expect(page.getByLabel('Day offset (first day is 0)',{exact:true})).toHaveValue('3');await expect(page.getByLabel('Time zone',{exact:true})).toHaveValue('Asia/Tokyo');
 const second=await browser.newContext();const other=await second.newPage();await login(other,path);await expect(other.getByLabel('Private note',{exact:true})).toHaveValue('PRIVATE U01 persisted note',{timeout:15000});await second.close();
 const api=await page.request.get('/api/trips/'+path.split('/').pop());expect(api.status()).toBe(200);expect(api.headers()['cache-control']).toContain('no-store');const data=await api.json();expect(data.data.days[0].stops[0].travellerNote).toBe('PRIVATE U01 persisted note');
 const foreign=await page.request.post('/api/trips/'+data.data.id+'/commands',{headers:{origin:'https://evil.test'},data:{requestId:randomUUID(),expectedRevision:data.data.revision,command:{type:'patchTrip',patch:{title:'CSRF'}}}});expect(foreign.status()).toBe(403);

});
test('a committed command with a lost response retries once and logout clears account copies',async({page})=>{
 test.setTimeout(90000);await login(page);await page.getByLabel('Trip title',{exact:true}).fill('Synthetic timeout recovery');await page.getByRole('button',{name:'Create trip',exact:true}).click();await page.waitForURL(/\/en\/trips\/[0-9a-f-]+$/);const id=new URL(page.url()).pathname.split('/').pop()!;await expect(page.getByTestId('trip-save-state')).toBeVisible();
 let committed=false;await page.route('**/api/trips/*/commands',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);committed=true;await route.abort('failed')});await page.getByRole('button',{name:'Add day',exact:true}).click();await expect(page.getByTestId('trip-save-state')).toContainText('Not saved.');expect(committed).toBe(true);await page.unroute('**/api/trips/*/commands');await page.getByRole('button',{name:'Add day',exact:true}).click();await expect(page.getByTestId('trip-save-state')).toContainText('Saved to your account');const result=await page.request.get('/api/trips/'+id);const snapshot=(await result.json()).data;expect(snapshot.days).toHaveLength(1);expect(snapshot.revision).toBe(2);
 await page.goto('/en/me');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/en/sign-in');await expect(page.getByLabel('Email')).toBeVisible({timeout:15000});const count=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{const r=indexedDB.open('kinnso_account_cache_v1');r.onsuccess=()=>{const db=r.result,read=db.transaction('snapshots').objectStore('snapshots').count();read.onsuccess=()=>{resolve(read.result);db.close()};read.onerror=()=>reject(read.error)}}));expect(count).toBe(0);expect((await page.request.get('/api/trips/'+id)).status()).toBe(401);
});
