import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');const target=verifyTestTarget();
const admin=createClient(target.apiOrigin,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const ok=async(p:PromiseLike<any>)=>{const r=await p;expect(r.error).toBeNull();return r.data;};
for(const locale of ['en','zh-HK'])test(`P03/P17 ${locale}: initial membership503 retries its read by keyboard into the same owned finance scope`,async({page,baseURL},testInfo)=>{
 test.setTimeout(120_000);expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
 const users:string[]=[],merchants:string[]=[],password='Synthetic!'+randomUUID(),tag=randomUUID();let failed=false,membershipReads=0,financePosts=0;
 const label=(en:string,zh:string)=>locale==='en'?en:zh;
 try{
  const email='synthetic-finance-retry-'+tag+'@example.test',foreignEmail='synthetic-finance-foreign-'+tag+'@example.test';
  for(const address of [email,foreignEmail])users.push((await ok(admin.auth.admin.createUser({email:address,password,email_confirm:true}))).user.id);
  for(let i=0;i<users.length;i++)merchants.push((await ok(admin.from('merchant_profiles').insert({user_id:users[i],company_name:i?'Foreign finance company '+tag:'Owned finance retry '+tag,contact_email:i?foreignEmail:email}).select('id').single())).id);
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/reconciliation'&&r.method()==='POST')financePosts++;});
  await page.route('**/api/merchant',async route=>{
   if(route.request().method()!=='GET')return route.continue();membershipReads++;
   if(membershipReads===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'UNAVAILABLE'})});
   return route.continue();
  });
  await page.setViewportSize({width:320,height:800});
  await page.goto('/'+locale+'/sign-in?next='+encodeURIComponent('/'+locale+'/merchant/reconciliation'));
  await page.getByLabel(label('Email','電郵'),{exact:true}).fill(email);await page.getByLabel(label('Password','密碼'),{exact:true}).fill(password);await page.getByRole('button',{name:label('Sign in','登入'),exact:true}).click();
  await page.waitForURL('**/'+locale+'/merchant/reconciliation');
  const retry=page.getByRole('button',{name:label('Retry loading','重試載入'),exact:true});await expect(retry).toBeVisible();
  await expect(page.getByText(label('No merchant finance membership is available for this account.','此帳戶沒有可用的商戶財務成員權限。'),{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:label('Refresh records','重新載入紀錄'),exact:true})).toBeDisabled();
  await retry.focus();await page.keyboard.press('Enter');
  const merchant=page.getByLabel(label('Merchant','商戶'),{exact:true});await expect(merchant).toHaveValue(merchants[0]);await expect(merchant.locator('option')).toHaveCount(1);await expect(merchant).not.toContainText('Foreign finance company');
  await expect(page.getByRole('heading',{name:label('Matching totals','符合條件的總額'),exact:true})).toBeVisible();await expect(retry).toHaveCount(0);expect(membershipReads).toBe(2);expect(financePosts).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await testInfo.attach('finance-membership-retry-'+locale,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 }catch(error){failed=true;throw error;}finally{
  const errors:string[]=[];for(const id of merchants)try{await ok(admin.from('merchant_profiles').delete().eq('id',id));}catch{errors.push('owned merchant');}
  for(const id of users)try{await ok(admin.auth.admin.deleteUser(id));}catch{errors.push('owned actor');}
  if(errors.length){testInfo.annotations.push({type:'cleanup failures',description:errors.join(', ')});if(!failed)throw Error('Owned finance retry cleanup failed');}
 }
});
