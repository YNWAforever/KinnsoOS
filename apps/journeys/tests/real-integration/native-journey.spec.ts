// Reconstructed suite: original files were absent from local Git history.
import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {openFixture} from './native-fixture.mjs';
import {expected} from './target.mjs';
import {readRealSuiteApproval} from '../../scripts/real-suite-source.mjs';
let fixture:any;
const selection=readRealSuiteApproval(process.env)?.testSelection??'FULL_EXISTING_8';
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{fixture=await openFixture()});
test.afterAll(async()=>{fixture?.write()});
async function signIn(page:Page,locale:string,next:string,actor=fixture.actors.A){
 await page.goto(expected.appOrigin+'/'+locale+'/sign-in?next='+encodeURIComponent(next));
 await page.getByLabel(locale==='en'?'Email':'電郵',{exact:true}).fill(actor.email);
 const binding='credential_'+randomUUID().replaceAll('-','');let available=true;
 await page.exposeBinding(binding,({frame})=>{
  const url=new URL(frame.url());
  if(!available||url.origin!==expected.appOrigin||url.pathname!==`/${locale}/sign-in`)
   throw Error('CREDENTIAL_BINDING_CLOSED');
  available=false;return actor.credential;
 });
 await page.evaluate(async name=>{
  const input=document.querySelector('input[type="password"]') as HTMLInputElement|null;
  if(!input)throw Error('SIGN_IN_CONTROL_MISSING');
  const read=(window as unknown as Record<string,()=>Promise<string>>)[name];
  input.value=await read();input.dispatchEvent(new Event('input',{bubbles:true}));
 },binding);
 await page.getByRole('button',{name:locale==='en'?'Sign in':'登入',exact:true}).click();
 await page.waitForURL(expected.appOrigin+next);
}

for(const locale of ['en','zh-HK'])for(const [size,viewport] of Object.entries({desktop:{width:1280,height:900},mobile:{width:390,height:844}})){
 const prefix=`real isolated target ${locale}/${size}`;
 for(const other of [false,true])test(`${prefix} ${other?'foreign access denied':'owner reload persistence'}`,async({browser})=>{
  const title='Synthetic private '+randomUUID();
  const created=await fixture.create(fixture.actors.A,{title,timezone:'Asia/Hong_Kong',startDate:null});
  const context=await browser.newContext({baseURL:expected.appOrigin,viewport,serviceWorkers:'block'});
  await context.route('**/*',route=>[expected.appOrigin,expected.apiOrigin].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  try{
   const page=await context.newPage();
   await signIn(page,locale,`/${locale}/trips`,other?fixture.actors.B:fixture.actors.A);
   await page.goto(`/${locale}/trips/${created.value.id}`);
   if(other){
    const denied=await fixture.actors.B.client.rpc('get_trip_snapshot',{p_trip_id:created.value.id});
    expect(Boolean(denied.error)||denied.data===null).toBe(true);
    await expect(page.getByText(title,{exact:true})).toHaveCount(0);
   }else{
    await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
    expect((await fixture.snapshot(fixture.actors.A,created.value.id)).id).toBe(created.value.id);
   }
  }finally{await context.close()}
 });
 if(selection!=='FULL_EXISTING_8')test(`${prefix} fresh browser cannot read private trip`,async({browser})=>{
  const title='Synthetic signed-out '+randomUUID();
  const created=await fixture.create(fixture.actors.A,{title,timezone:'Asia/Hong_Kong',startDate:null});
  const context=await browser.newContext({baseURL:expected.appOrigin,viewport,serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   await page.goto(`/${locale}/trips/${created.value.id}`);
   await expect(page.getByText(title,{exact:true})).toHaveCount(0);
   await expect(page.getByText(locale==='en'?'Sign in to keep trips in your Kinnso account.':'登入以將行程保存至 Kinnso 帳戶。',{exact:true})).toBeVisible();
   const signInLink=page.getByRole('link',{name:locale==='en'?'Sign in':'登入',exact:true}).last();
   await expect(signInLink).toHaveAttribute('href', '/'+locale+'/sign-in?next='+encodeURIComponent('/'+locale+'/trips/'+created.value.id));
   await signInLink.click();
   await expect(page).toHaveURL(/sign-in/);
  }finally{await context.close()}
 });
}
