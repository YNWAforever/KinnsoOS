import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();
const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10_000)});
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false},global:{fetch:boundedFetch}});
test('operations reviews a real immutable selection and revoked access cannot refresh private queues',async({page,baseURL},testInfo)=>{
 test.setTimeout(90_000);page.setDefaultTimeout(10_000);page.setDefaultNavigationTimeout(15_000);expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
 let failed=false;
 const ids:string[]=[];let merchantId='',missionId='',opsMemberId='';const password='Synthetic!'+randomUUID(),email='synthetic-ops-'+randomUUID()+'@example.test';
 const ok=async(p:PromiseLike<any>)=>{const r=await p;expect(r.error).toBeNull();return r.data;};
 try{
  const operator=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));ids.push(operator.user.id);
  const creator=await ok(admin.auth.admin.createUser({email:'synthetic-creator-'+randomUUID()+'@example.test',password,email_confirm:true}));ids.push(creator.user.id);
  await ok(admin.from('creators').update({status:'active'}).eq('id',creator.user.id));
  opsMemberId=(await ok(admin.from('kinnso_ops_members').insert({user_id:operator.user.id,display_name:'Synthetic browser operator',role:'admin'}).select('id').single())).id;
  merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:operator.user.id,company_name:'Synthetic ops fixture',contact_email:email}).select('id').single())).id;
  missionId=(await ok(admin.from('missions').insert({merchant_profile_id:merchantId,title:'Browser verification mission',summary:'Explicit local fixture',mission_type:'coupon_affiliate',status:'published'}).select('id').single())).id;
  const pId=(await ok(admin.from('mission_participants').insert({mission_id:missionId,creator_id:creator.user.id,status:'active',source:'open_join'}).select('id').single())).id;
  const milestones=Array.from({length:3},()=>({id:randomUUID(),mission_id:missionId,title:'Authored test milestone',description:'Fixture'}));await ok(admin.from('mission_milestones').insert(milestones));await ok(admin.from('mission_milestone_submissions').insert(milestones.map(x=>({mission_milestone_id:x.id,mission_participant_id:pId,status:'submitted',submitted_at:new Date().toISOString()}))));
  await page.goto('/en/sign-in?next=/en/ops');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/en/ops');
  await expect(page.getByRole('heading',{name:'Review submissions',exact:true})).toBeVisible();
  await expect.poll(async()=>{const r=await page.request.get('/api/session',{timeout:10_000});const b=await r.json();return r.ok()&&b.ok&&b.data?.id===operator.user.id;},{timeout:15_000,message:'Browser session must identify the signed-in synthetic operator'}).toBe(true);
  await expect(page.getByRole('heading',{name:'Operations queue',exact:true})).toBeVisible();await expect(page.getByText('Browser verification mission',{exact:true})).toHaveCount(3);
  await page.getByRole('button',{name:'Select this page',exact:true}).click();await page.getByRole('button',{name:'Preview selection',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toBeVisible();
  await page.getByRole('checkbox').first().uncheck();await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Select this page',exact:true}).click();await page.getByRole('button',{name:'Preview selection',exact:true}).click();await page.getByLabel('Audit reason',{exact:true}).fill('Synthetic browser audit reason');await page.getByRole('button',{name:'Apply confirmed decision',exact:true}).click();await expect(page.getByRole('status')).toContainText('3 succeeded');
  const rows=await ok(admin.from('mission_milestone_submissions').select('status').in('mission_milestone_id',milestones.map(x=>x.id)));expect(rows.every((x:any)=>x.status==='revision_requested')).toBe(true);
  await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.getByRole('button',{name:'Select this page',exact:true}).click();await page.getByRole('button',{name:'Preview selection',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toBeVisible();await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('id',opsMemberId));await page.getByLabel('Audit reason',{exact:true}).fill('Must not run after revocation');await page.getByRole('button',{name:'Apply confirmed decision',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Active operations access is required.'})).toBeVisible();await expect(page.getByText('Browser verification mission',{exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Server settlement totals',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toHaveCount(0);
 }catch(error){failed=true;throw error;}finally{
  const errors:string[]=[];
  const clean=async(label:string,operation:()=>PromiseLike<unknown>)=>{try{await operation();}catch{errors.push(label);}};
  if(missionId)await clean('mission',()=>ok(admin.from('missions').delete().eq('id',missionId)));
  if(merchantId)await clean('merchant',()=>ok(admin.from('merchant_profiles').delete().eq('id',merchantId)));
  if(opsMemberId){await clean('audit',()=>ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id',opsMemberId)));await clean('ops membership',()=>ok(admin.from('kinnso_ops_members').delete().eq('id',opsMemberId)));}
  for(const id of ids)await clean('synthetic auth user',()=>ok(admin.auth.admin.deleteUser(id)));
  if(errors.length){testInfo.annotations.push({type:'cleanup failures',description:errors.join(', ')});await testInfo.attach('u05-cleanup-failures',{body:JSON.stringify(errors),contentType:'application/json'}).catch(()=>{});if(!failed)throw new Error('Synthetic cleanup failed: '+errors.join(', '));}
 }
});
