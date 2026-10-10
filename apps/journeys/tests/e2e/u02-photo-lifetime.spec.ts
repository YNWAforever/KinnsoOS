import {test,expect,type Page} from '@playwright/test';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const owners:string[]=[];
async function fixture(){
 const email=`synthetic-photo-lifetime-${randomUUID()}@example.test`,password=`Photo!${randomUUID()}`;
 const user=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(user.error).toBeNull();const id=user.data.user!.id;owners.push(id);
 const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
 expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
 const trip=await client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic upload lifetime',timezone:'UTC',startDate:null}});expect(trip.error).toBeNull();
 return{email,password,id,tripId:trip.data.id,client};
}
type Owner=Awaited<ReturnType<typeof fixture>>;
async function login(page:Page,owner:Owner,locale:string,next:string){
 await page.goto(`/${locale}/sign-in?next=${encodeURIComponent(next)}`);
 await page.getByLabel(locale==='en'?'Email':'電郵',{exact:true}).fill(owner.email);
 await page.getByLabel(locale==='en'?'Password':'密碼',{exact:true}).fill(owner.password);
 await page.getByRole('button',{name:locale==='en'?'Sign in':'登入',exact:true}).click();await page.waitForURL('**'+next);
 await expect.poll(async()=> (await (await page.request.get('/api/session')).json()).data?.id).toBe(owner.id);
}
async function selectPhoto(page:Page,locale:string){
 const data=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;canvas.getContext('2d')!.fillRect(0,0,16,16);return canvas.toDataURL('image/png')});
 await page.getByLabel(locale==='en'?'Photo':'相片',{exact:true}).setInputFiles({name:'synthetic-lifetime.png',mimeType:'image/png',buffer:Buffer.from(data.split(',')[1],'base64')});
}
async function snapshot(owner:Owner){const r=await owner.client.rpc('get_trip_snapshot',{p_trip_id:owner.tripId});expect(r.error).toBeNull();return r.data;}
test.afterEach(async()=>{
 for(const id of owners.splice(0)){
  const metadata=await admin.from('kinnso_trip_media').select('object_path').eq('owner_id',id);expect(metadata.error).toBeNull();
  const paths=metadata.data!.map(row=>row.object_path);if(paths.length)expect((await admin.storage.from('kinnso-trip-private').remove(paths)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
for(const locale of ['en','zh-HK']){
 test(`a delayed ${locale} upload never attaches after logout and same-account reentry`,async({page,context})=>{
  test.setTimeout(120000);const owner=await fixture();await login(page,owner,locale,`/${locale}/trips/${owner.tripId}`);await selectPhoto(page,locale);
  let release!:()=>void,prepared!:()=>void;const held=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>prepared=r);
  await page.route('**/api/media',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);prepared();await held;try{await route.fulfill({response})}catch(error){if(!route.request().failure())throw error}});
  const other=await context.newPage();
  try{
   await page.getByRole('button',{name:locale==='en'?'Upload private photo':'上載私人相片',exact:true}).click();await ready;
   await other.goto(`/${locale}/me`);await other.getByRole('button',{name:locale==='en'?'Sign out':'登出',exact:true}).click();await other.waitForURL(`**/${locale}/sign-in`);
   await expect(page.getByLabel(locale==='en'?'Photo':'相片',{exact:true})).toHaveCount(0);
   await login(other,owner,locale,`/${locale}/trips`);
   expect((await owner.client.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
   const late=page.waitForRequest(r=>r.method()==='POST'&&new URL(r.url()).pathname===`/api/trips/${owner.tripId}/commands`,{timeout:5000}).catch(()=>null);
   release();const response=await late;
   expect(response,'Invalidated photo task must not invoke its captured attach command').toBeNull();
   expect((await snapshot(owner)).media).toEqual([]);
   await page.reload();await expect(page.getByAltText(locale==='en'?'Private trip photo':'私人行程照片')).toHaveCount(0);
  }finally{if(!page.isClosed())await page.goto('about:blank');release();await other.close()}
 });
 for(const phase of ['prepare','bytes']){
 test(`cancel ${locale} upload after ${phase} preserves the file and retries one owned photo`,async({page,browser})=>{
  test.setTimeout(120000);const owner=await fixture();await login(page,owner,locale,`/${locale}/trips/${owner.tripId}`);await selectPhoto(page,locale);
  let release!:()=>void,prepared!:()=>void;const held=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>prepared=r),requests:string[]=[];let originalPayload:Record<string,unknown>|null=null,mediaId='';
  await page.route('**/api/media',async route=>{originalPayload=route.request().postDataJSON();requests.push(originalPayload!.requestId as string);const response=await route.fetch();expect(response.status()).toBe(200);mediaId=(await response.json()).data.id;if(requests.length===1&&phase==='prepare'){prepared();await held}try{await route.fulfill({response})}catch(error){if(!route.request().failure())throw error}});
  if(phase==='bytes')await page.route('**/storage/v1/object/upload/sign/**',async route=>{const response=await route.fetch();if(requests.length===1){expect(response.ok()).toBe(true);prepared();await held}try{await route.fulfill({response})}catch(error){if(!route.request().failure())throw error}});
  try{
   await page.getByRole('button',{name:locale==='en'?'Upload private photo':'上載私人相片',exact:true}).click();await ready;
   const cancel=page.getByRole('button',{name:locale==='en'?'Cancel upload':'取消上載',exact:true});await expect(cancel).toBeVisible({timeout:5000});await cancel.click();
   await expect(page.getByRole('status').filter({hasText:locale==='en'?'original is kept':'原檔保留'})).toBeVisible();
   expect((await snapshot(owner)).media).toEqual([]);release();
   if(phase==='bytes'&&locale==='en'){
    const foreign=await browser.newContext();try{
     const b=await fixture(),viewer=await foreign.newPage();await login(viewer,b,locale,`/${locale}/trips/${b.tripId}`);
     const options={headers:{Origin:'http://127.0.0.1:3495'}};
     const denied=await viewer.request.post('/api/media',{...options,data:originalPayload});expect(denied.status()).toBe(404);expect((await denied.json()).code).toBe('NOT_FOUND');
     const finalize=await viewer.request.post('/api/media/finalize',{...options,data:{id:mediaId,checksum:'0'.repeat(64)}});expect(finalize.status()).toBe(404);expect((await finalize.json()).code).toBe('NOT_FOUND');
    }finally{await foreign.close()}
   }
   const upload=page.getByRole('button',{name:locale==='en'?'Upload private photo':'上載私人相片',exact:true});await expect(upload).toBeEnabled();await upload.click();
   await expect(page.getByAltText(locale==='en'?'Private trip photo':'私人行程照片')).toBeVisible({timeout:30000});
   expect(requests).toHaveLength(2);expect(requests[1]).toBe(requests[0]);
   const stored=await snapshot(owner);expect(stored.media).toHaveLength(1);expect(stored.revision).toBe(2);
   await page.reload();await expect(page.getByAltText(locale==='en'?'Private trip photo':'私人行程照片')).toBeVisible();expect((await snapshot(owner)).media).toEqual(stored.media);
  }finally{if(!page.isClosed())await page.goto('about:blank');release()}
 });
 }
}
