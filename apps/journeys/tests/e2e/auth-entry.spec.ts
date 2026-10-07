import {test,expect,type Page} from '@playwright/test';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const ids:string[]=[];
test.afterEach(async()=>{for(const id of ids.splice(0))expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()});
async function actor(){
 const email=`synthetic-auth-entry-${randomUUID()}@example.test`,password=`Auth!${randomUUID()}`;
 const result=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull();ids.push(result.data.user!.id);
 return{email,password,id:result.data.user!.id};
}
async function login(page:Page,user:Awaited<ReturnType<typeof actor>>){
 await page.goto('/en/sign-in?next=/en/trips');await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/en/trips');
 await expect.poll(async()=>{const response=await page.request.get('/api/session');return(await response.json()).data?.id;}).toBe(user.id);
}
async function recoveryLink(email:string,next='/zh-HK/trips?intent=import'){
 const result=await admin.auth.admin.generateLink({type:'recovery',email});expect(result.error).toBeNull();if(!result.data.properties)throw Error('Synthetic recovery link missing');
 return '/auth/callback?'+new URLSearchParams({locale:'zh-HK',flow:'recovery',type:'recovery',token_hash:result.data.properties.hashed_token,next});
}

test('new visitor can create an account from Journeys and retain the original task',async({page})=>{
 const email=`synthetic-auth-signup-${randomUUID()}@example.test`,password=`Auth!${randomUUID()}`;
 await page.goto('/zh-HK/sign-in?next='+encodeURIComponent('/zh-HK/trips?intent=import'));
 await page.getByRole('link',{name:'建立帳戶',exact:true}).click();await expect(page.getByRole('heading',{name:'建立 Kinnso 帳戶',exact:true})).toBeVisible();
 const deviceId='synthetic-device-'+randomUUID(),guideId=randomUUID();
 await page.evaluate(({deviceId,guideId})=>new Promise<void>((resolve,reject)=>{
  const r=indexedDB.open('kinnso_guest_drafts_v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('trips',{keyPath:'id'});
  r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('trips','readwrite');tx.objectStore('trips').put({id:deviceId,ownerId:'guest-synthetic-auth',title:'Synthetic kept device copy',timezone:'UTC',purpose:'personal',startDate:null,source:{guideId,version:1},pendingPhotos:[],days:[{offset:0,title:'Synthetic day',stops:[{title:'Synthetic stop',travellerNote:'Keep this device note',startMinuteOfDay:null,durationMinutes:null,source:{guideId,version:1}}]}]});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}};
 }),{deviceId,guideId});
 await page.getByLabel('電郵',{exact:true}).fill(email);await page.getByLabel('新密碼',{exact:true}).fill(password);await page.getByLabel('確認密碼',{exact:true}).fill(password);
 let release!:()=>void,started!:()=>void;
 const hold=new Promise<void>(r=>{release=r}),posted=new Promise<void>(r=>{started=r});
 await page.route('**/zh-HK/sign-up?*',async route=>{if(route.request().method()!=='POST')return route.continue();started();await hold;await route.continue()});
 try{
  await page.getByRole('button',{name:'建立帳戶',exact:true}).click();await posted;
  await expect(page.getByRole('button',{name:'請稍候…',exact:true})).toBeDisabled();
 }finally{release()}
 await page.waitForURL('**/zh-HK/trips?intent=import');
 const session=await page.request.get('/api/session'),body=await session.json();expect(body.ok).toBe(true);ids.push(body.data.id);
 const trips=await page.request.get('/api/trips');expect((await trips.json()).data.items).toEqual([]);
 const kept=await page.evaluate(id=>new Promise<any>((resolve,reject)=>{const r=indexedDB.open('kinnso_guest_drafts_v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('trips').objectStore('trips').get(id);q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>{db.close();reject(q.error)}}}),deviceId);
 expect(kept.days[0].stops[0].travellerNote).toBe('Keep this device note');
 await expect(page.getByRole('button',{name:'Confirm import to this account',exact:true})).toHaveCount(0);
});

test('known and unknown email recovery has the same conditional acknowledgement',async({page})=>{
 const known=await actor();let message='';
 for(const email of [known.email,`synthetic-unknown-${randomUUID()}@example.test`]){
  await page.goto('/zh-HK/forgot-password?next=%2Fzh-HK%2Fg%2Fkept%3Fintent%3Dimport');
  await page.getByLabel('電郵',{exact:true}).fill(email);await page.getByRole('button',{name:'索取復原連結',exact:true}).click();
  await page.waitForURL(/\/zh-HK\/forgot-password\?.*sent=1/);
  const current=await page.getByRole('status').textContent();if(message)expect(current).toBe(message);else message=current!;
  await expect(page.getByRole('link',{name:'取消及返回',exact:true})).toHaveAttribute('href','/zh-HK/g/kept?intent=import');
 }
});

test('verified isolated recovery changes the password, preserves intent and rejects reuse',async({page})=>{
 const user=await actor(),link=await recoveryLink(user.email);
 await page.goto(link);await expect(page.getByRole('heading',{name:'設定新密碼',exact:true})).toBeVisible();
 const response=await page.request.get('/zh-HK/reset-password');expect(response.headers()['cache-control']).toContain('private');
 const password=`Changed!${randomUUID()}`;
 await page.getByLabel('新密碼',{exact:true}).fill(password);await page.getByLabel('確認密碼',{exact:true}).fill(password);await page.getByRole('button',{name:'保存新密碼',exact:true}).click();
 await page.waitForURL('**/zh-HK/trips?intent=import');
 const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
 expect((await client.auth.signInWithPassword({email:user.email,password:user.password})).error).not.toBeNull();
 expect((await client.auth.signInWithPassword({email:user.email,password})).error).toBeNull();await client.auth.signOut();
 await page.goto(link);await expect(page.getByLabel('新密碼',{exact:true})).toHaveCount(0);await expect(page).toHaveURL(/\/zh-HK\/forgot-password/);
});

test('query-only and forged recovery tickets never authorize a reset',async({page,context})=>{
 const user=await actor();await login(page,user);
 await context.addCookies([{name:'kinnso-recovery',value:'forged.session',url:'http://127.0.0.1:3495',httpOnly:true}]);
 await page.goto('/zh-HK/reset-password?flow=recovery&next=%2Fzh-HK%2Fg%2Fkept');
 await expect(page.getByLabel('新密碼',{exact:true})).toHaveCount(0);await expect(page.locator('#auth-error')).toContainText('無效');
});

test('account A never consumes account B recovery or adopts B intent',async({page})=>{
 const a=await actor(),b=await actor(),link=await recoveryLink(b.email,'/zh-HK/g/old-account-B?intent=import');await login(page,a);
 await page.goto(link);await expect(page).toHaveURL(/\/zh-HK\/forgot-password/);await expect(page.getByLabel('新密碼',{exact:true})).toHaveCount(0);
 expect((await (await page.request.get('/api/session')).json()).data.id).toBe(a.id);
 const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
 expect((await client.auth.signInWithPassword({email:b.email,password:b.password})).error).toBeNull();await client.auth.signOut();
});

test('expired callbacks stay bilingual and retain a safe retry destination',async({page})=>{
 await page.goto('/auth/callback?locale=zh-HK&flow=recovery&type=recovery&token_hash=expired&next=%2Fzh-HK%2Fg%2Fkept');
 await expect(page).toHaveURL(/\/zh-HK\/forgot-password\?/);await expect(page.locator('#auth-error')).toContainText('未能完成');
 await expect(page.getByRole('link',{name:'取消及返回',exact:true})).toHaveAttribute('href','/zh-HK/g/kept');
});

test('isolated email verification returns to the task without importing device data',async({page})=>{
 const email=`synthetic-auth-confirm-${randomUUID()}@example.test`,password=`Confirm!${randomUUID()}`;
 const result=await admin.auth.admin.generateLink({type:'signup',email,password});expect(result.error).toBeNull();
 if(!result.data.properties||!result.data.user)throw Error('Synthetic confirmation setup missing');ids.push(result.data.user.id);
 await page.goto('/auth/callback?'+new URLSearchParams({locale:'zh-HK',flow:'sign-up',type:'email',token_hash:result.data.properties.hashed_token,next:'/zh-HK/trips?intent=import'}));
 await page.waitForURL('**/zh-HK/trips?intent=import');
 expect((await (await page.request.get('/api/session')).json()).data.id).toBe(result.data.user.id);
 expect((await (await page.request.get('/api/trips')).json()).data.items).toEqual([]);
});

test('legacy callback without locale retains a Chinese task when verification fails',async({page})=>{
 await page.goto('/callback?code=expired&next=%2Fzh-HK%2Fg%2Fkept');
 await expect(page).toHaveURL(/\/zh-HK\/sign-in/);await expect(page.getByRole('heading',{name:'登入 Kinnso',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'取消及返回',exact:true})).toHaveAttribute('href','/zh-HK/g/kept');
});
