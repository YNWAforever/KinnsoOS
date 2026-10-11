import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');const target=verifyTestTarget();
const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10_000)});
const admin=createClient(target.apiOrigin,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false},global:{fetch:boundedFetch}});
async function ok(query:PromiseLike<any>){const result=await query;expect(result.error).toBeNull();return result.data;}
async function signIn(page:Page,locale:string,email:string,password:string,path:string){
 await page.goto(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/${path}`)}`);
 await page.getByLabel(locale==='en'?'Email':'電郵',{exact:true}).fill(email);
 await page.getByLabel(locale==='en'?'Password':'密碼',{exact:true}).fill(password);
 await page.getByRole('button',{name:locale==='en'?'Sign in':'登入',exact:true}).click();
 await page.waitForURL(`**/${locale}/${path}`);
}

for(const locale of ['en','zh-HK'])test(`P07/P08 ${locale}: owned next actions and both roles retain the same scheduled collaboration`,async({page,browser,baseURL},testInfo)=>{
 test.setTimeout(120_000);page.setDefaultTimeout(12_000);
 expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
 const users:string[]=[],missions:string[]=[];let merchantId='',failed=false;
 const ownerEmail=`synthetic-tasks-owner-${randomUUID()}@example.test`,creatorEmail=`synthetic-tasks-creator-${randomUUID()}@example.test`,password=`Synthetic!${randomUUID()}`;
 const ownerContext=await browser.newContext({baseURL});
 try{
  const owner=(await ok(admin.auth.admin.createUser({email:ownerEmail,password,email_confirm:true}))).user;users.push(owner.id);
  const creator=(await ok(admin.auth.admin.createUser({email:creatorEmail,password,email_confirm:true}))).user;users.push(creator.id);
  await ok(admin.from('creators').update({status:'active',display_name:'Synthetic next-action creator'}).eq('id',creator.id));
  merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic next-action company',contact_email:ownerEmail}).select('id').single())).id;
  const draft=(await ok(admin.from('missions').insert({merchant_profile_id:merchantId,title:'Synthetic next-action draft',summary:'Owned bounded task fixture',mission_type:'coupon_affiliate',status:'draft'}).select('id').single())).id;missions.push(draft);
  const active=(await ok(admin.from('missions').insert({merchant_profile_id:merchantId,title:'Synthetic next-action collaboration',summary:'Owned accepted collaboration fixture',mission_type:'coupon_affiliate',status:'published',starts_at:'1999-12-31T16:00:00Z',ends_at:'2099-12-31T16:00:00Z',kinnso_schedule_time_zone:'Asia/Hong_Kong'}).select('id').single())).id;missions.push(active);
  await ok(admin.from('mission_participants').insert({mission_id:active,creator_id:creator.id,status:'active',source:'open_join'}));
  await signIn(page,locale,creatorEmail,password,'studio');
  await expect(page.getByRole('heading',{name:locale==='en'?'Your next actions':'你的下一步',exact:true})).toBeVisible();
  const continueWork=page.getByRole('link',{name:new RegExp(locale==='en'?'Continue collaboration · Synthetic next-action collaboration':'繼續合作 · Synthetic next-action collaboration')});
  await expect(continueWork).toHaveAttribute('href',`/${locale}/studio/missions/${active}`);
  await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await continueWork.click();await page.waitForURL(`**/${locale}/studio/missions/${active}`);
  await expect(page.getByRole('heading',{level:1,name:locale==='en'?'Creator collaborations':'創作者合作',exact:true})).toBeVisible();
  await expect(page.locator('article.k-card').getByRole('heading',{level:2,name:'Synthetic next-action collaboration',exact:true})).toBeVisible();
  const creatorWindow=page.locator('time[datetime^="1999-12-31"]');await expect(creatorWindow).toContainText('Asia/Hong_Kong');const creatorDate=await creatorWindow.textContent();
  const ownerPage=await ownerContext.newPage();ownerPage.setDefaultTimeout(12_000);await signIn(ownerPage,locale,ownerEmail,password,'merchant');
  const task=ownerPage.getByRole('link',{name:new RegExp(locale==='en'?'Complete campaign draft · Synthetic next-action draft':'完成活動草稿 · Synthetic next-action draft')});
  await expect(task).toHaveAttribute('href',`/${locale}/merchant?company=${merchantId}&campaign=${draft}#merchant-campaigns`);
  await task.click();await ownerPage.waitForURL(url=>url.pathname===`/${locale}/merchant`&&url.searchParams.get('company')===merchantId&&url.searchParams.get('campaign')===draft);
  await expect(ownerPage.getByRole('heading',{name:(locale==='en'?'Promotion details':'推廣詳情')+' · Synthetic next-action draft',exact:true})).toBeVisible();
  await ownerPage.goto(`/${locale}/merchant?company=${merchantId}&campaign=${active}`);
  const merchantWindow=ownerPage.locator('time[datetime^="1999-12-31"]');await expect(merchantWindow).toHaveText(creatorDate!);
  await ownerPage.setViewportSize({width:320,height:800});expect(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await testInfo.attach(`tasks-owned-${locale}-320`,{body:await ownerPage.screenshot({fullPage:true}),contentType:'image/png'});
 }catch(error){failed=true;throw error;}finally{
  const errors:string[]=[];const clean=async(label:string,fn:()=>PromiseLike<unknown>)=>{try{await fn();}catch{errors.push(label);}};
  await clean('context',()=>ownerContext.close());for(const id of missions)await clean('mission',()=>ok(admin.from('missions').delete().eq('id',id)));
  if(merchantId)await clean('merchant',()=>ok(admin.from('merchant_profiles').delete().eq('id',merchantId)));for(const id of users)await clean('user',()=>ok(admin.auth.admin.deleteUser(id)));
  if(errors.length){testInfo.annotations.push({type:'cleanup failures',description:errors.join(', ')});if(!failed)throw Error('Owned task cleanup failed: '+errors.join(', '));}
 }
});
