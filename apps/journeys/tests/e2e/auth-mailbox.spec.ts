import {test,expect,type Page} from '@playwright/test';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyMailboxTarget,readCapturedConfirmation} from '../../scripts/local-auth-mailbox.mjs';
loadEnvFile('.env.test'); verifyMailboxTarget();
const {fixture,admin}=await import('../integration/local-fixtures.mjs');
const pendingEmails:string[]=[],userIds:string[]=[];
let owned:Awaited<ReturnType<typeof fixture>>;
test.beforeEach(async()=>{owned=await fixture()});
test.afterEach(async()=>{
 // Only this test's synthetic addresses, including an unconfirmed failed signup.
 for(const email of pendingEmails.splice(0)){
  const users=await admin.auth.admin.listUsers({page:1,perPage:1000});
  if(users.error)throw Error('Owned local signup cleanup lookup failed');
  for(const user of users.data.users.filter(user=>user.email===email))userIds.push(user.id);
 }
 for(const id of new Set(userIds.splice(0)))if((await admin.auth.admin.deleteUser(id)).error)throw Error('Owned local email test cleanup failed');
 await owned.cleanup();
});
async function sourceTask(locale:string){
 const author=await owned.actor(true),title='Synthetic mailbox original guide '+randomUUID();
 const guide=await owned.guide(author,{title});
 return{next:`/${locale}/g/${guide}?intent=import`,title,guide};
}
async function followCapturedLink(page:Page,link:string){
 // Suppress bearer-link URLs from a Playwright navigation failure/call log.
 try{await page.goto(link,{waitUntil:'domcontentloaded'});}catch{throw Error('Captured local Auth link navigation failed');}
}
async function atTask(page:Page,next:string){
 await expect.poll(()=>{const url=new URL(page.url());return url.pathname+url.search===next;}).toBe(true);
}
async function sessionId(page:Page){
 const response=await page.request.get('/api/session');const body=await response.json();
 expect(response.status()).toBe(200);expect(body.ok).toBe(true);return body.data.id as string;
}
async function keepDeviceCopy(page:Page,id:string,guideId:string){
 await page.evaluate(({id,guideId})=>new Promise<void>((resolve,reject)=>{
  const request=indexedDB.open('kinnso_guest_drafts_v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('trips',{keyPath:'id'});
  request.onerror=()=>reject(Error('Synthetic device setup failed'));
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('trips','readwrite');tx.objectStore('trips').put({id,ownerId:'guest-synthetic-mailbox',title:'Synthetic kept device copy',timezone:'UTC',purpose:'personal',startDate:null,source:{guideId,version:1},pendingPhotos:[],days:[{offset:0,title:'Synthetic day',stops:[{title:'Synthetic stop',travellerNote:'Keep this synthetic device copy',startMinuteOfDay:null,durationMinutes:null,source:{guideId,version:1}}]}]});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(Error('Synthetic device setup failed'))}};
 }),{id,guideId});
}
async function deviceKept(page:Page,id:string){
 return page.evaluate(id=>new Promise<boolean>((resolve,reject)=>{
  const request=indexedDB.open('kinnso_guest_drafts_v1');request.onerror=()=>reject(Error('Synthetic device read failed'));
  request.onsuccess=()=>{const db=request.result,q=db.transaction('trips').objectStore('trips').get(id);q.onsuccess=()=>{db.close();resolve(q.result?.days?.[0]?.stops?.[0]?.travellerNote==='Keep this synthetic device copy')};q.onerror=()=>{db.close();reject(Error('Synthetic device read failed'))}};
 }),id);
}
for(const locale of ['en','zh-HK'] as const){
 const zh=locale==='zh-HK';
 test('SMTP captured signup verifies the same identity and returns to the original guide '+locale,async({page})=>{
  const task=await sourceTask(locale),email=`synthetic-mailbox-signup-${randomUUID()}@example.test`,password=`Signup!${randomUUID()}`;
  pendingEmails.push(email);
  await page.goto(`/${locale}/sign-in?next=`+encodeURIComponent(task.next));
  await page.getByRole('link',{name:zh?'建立帳戶':'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:zh?'建立 Kinnso 帳戶':'Create your Kinnso account',exact:true})).toBeVisible();
  const deviceId='synthetic-mailbox-device-'+randomUUID();await keepDeviceCopy(page,deviceId,task.guide);
  await page.getByLabel(zh?'電郵':'Email',{exact:true}).fill(email);
  await page.getByLabel(zh?'新密碼':'New password',{exact:true}).fill(password);
  await page.getByLabel(zh?'確認密碼':'Confirm password',{exact:true}).fill(password);
  let release!:()=>void,started!:()=>void;
  const hold=new Promise<void>(r=>{release=r}),posted=new Promise<void>(r=>{started=r});
  await page.route(`**/${locale}/sign-up?*`,async route=>{if(route.request().method()!=='POST')return route.continue();started();await hold;await route.continue()});
  try{await page.getByRole('button',{name:zh?'建立帳戶':'Create account',exact:true}).click();await posted;await expect(page.getByRole('button',{name:zh?'請稍候…':'Please wait…',exact:true})).toBeDisabled();}finally{release()}
  await expect.poll(()=>new URL(page.url()).searchParams.get('sent')).toBe('1');
  await expect(page.getByRole('status')).toContainText(zh?'郵件送達尚未確認':'Delivery has not been confirmed');
  expect((await page.request.get('/api/session')).status()).toBe(401);
  const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  const before=await client.auth.signInWithPassword({email,password});expect(Boolean(before.error)).toBe(true);
  const link=await readCapturedConfirmation(email,{locale,flow:'sign-up',next:task.next});
  await followCapturedLink(page,link);await atTask(page,task.next);await expect(page.getByRole('heading',{name:task.title,exact:true})).toBeVisible();
  const id=await sessionId(page),users=await admin.auth.admin.listUsers({page:1,perPage:1000});
  if(users.error)throw Error('Owned local confirmation lookup failed');
  const matches=users.data.users.filter(user=>user.email===email);
  expect(matches.length).toBe(1);expect(matches[0].id).toBe(id);expect(Boolean(matches[0].email_confirmed_at)).toBe(true);
  expect((await (await page.request.get('/api/trips')).json()).data.items).toEqual([]);expect(await deviceKept(page,deviceId)).toBe(true);
  console.log('LOCAL_MAILBOX_FLOW_PASS sign-up:'+locale);
 });
 test('SMTP captured recovery changes password, rejects link reuse and signs in again '+locale,async({page,browser})=>{
  const task=await sourceTask(locale),email=`synthetic-mailbox-recovery-${randomUUID()}@example.test`,password=`Before!${randomUUID()}`;
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(result.error||!result.data.user)throw Error('Owned local recovery actor setup failed');
  const id=result.data.user.id;userIds.push(id);
  await page.goto(`/${locale}/forgot-password?next=`+encodeURIComponent(task.next));
  const deviceId='synthetic-mailbox-device-'+randomUUID();await keepDeviceCopy(page,deviceId,task.guide);
  await page.getByLabel(zh?'電郵':'Email',{exact:true}).fill(email);await page.getByRole('button',{name:zh?'索取復原連結':'Request recovery link',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('sent')).toBe('1');
  await expect(page.getByRole('status')).toContainText(zh?'郵件送達尚未確認':'Delivery has not been confirmed');
  const link=await readCapturedConfirmation(email,{locale,flow:'recovery',next:task.next});
  await followCapturedLink(page,link);await expect(page.getByRole('heading',{name:zh?'設定新密碼':'Choose a new password',exact:true})).toBeVisible();
  const changed=`After!${randomUUID()}`;
  await page.getByLabel(zh?'新密碼':'New password',{exact:true}).fill(changed);await page.getByLabel(zh?'確認密碼':'Confirm password',{exact:true}).fill(changed);
  await page.getByRole('button',{name:zh?'保存新密碼':'Save new password',exact:true}).click();
  await atTask(page,task.next);expect(await sessionId(page)).toBe(id);expect(await deviceKept(page,deviceId)).toBe(true);
  expect((await (await page.request.get('/api/trips')).json()).data.items).toEqual([]);
  const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
  expect(Boolean((await client.auth.signInWithPassword({email,password})).error)).toBe(true);
  expect(Boolean((await client.auth.signInWithPassword({email,password:changed})).error)).toBe(false);await client.auth.signOut();
  await followCapturedLink(page,link);await expect.poll(()=>new URL(page.url()).pathname===`/${locale}/forgot-password`).toBe(true);
  await expect(page.getByLabel(zh?'新密碼':'New password',{exact:true})).toHaveCount(0);
  const fresh=await browser.newContext({baseURL:'http://127.0.0.1:3495'});
  try{const reopened=await fresh.newPage();await reopened.goto(`/${locale}/sign-in?next=`+encodeURIComponent(task.next));await reopened.getByLabel(zh?'電郵':'Email',{exact:true}).fill(email);await reopened.getByLabel(zh?'密碼':'Password',{exact:true}).fill(changed);await reopened.getByRole('button',{name:zh?'登入':'Sign in',exact:true}).click();await atTask(reopened,task.next);expect(await sessionId(reopened)).toBe(id);await expect(reopened.getByRole('heading',{name:task.title,exact:true})).toBeVisible();}finally{await fresh.close()}
  console.log('LOCAL_MAILBOX_FLOW_PASS recovery:'+locale);
 });
}