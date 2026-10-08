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
  await expect(page.getByRole('heading',{name:'Operations queue',exact:true})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Browser verification mission',exact:true})).toHaveCount(3);
  await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'evidence/ops-filters-320.png',fullPage:true});await page.setViewportSize({width:1280,height:720});
  await ok(admin.from('mission_milestone_submissions').update({status:'revision_requested'}).eq('mission_milestone_id',milestones[0].id));
  await page.getByLabel('Mission',{exact:true}).selectOption(missionId);await expect(page).toHaveURL(new RegExp('missionId='+missionId));
  await page.getByLabel('Review status',{exact:true}).selectOption('revision_requested');await expect(page.getByRole('checkbox',{name:'Browser verification mission',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Select this page',exact:true}).click();await page.getByRole('button',{name:'Preview selection',exact:true}).click();await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toBeVisible();
  await page.getByLabel('Review status',{exact:true}).selectOption('submitted');await expect(page.getByRole('checkbox',{name:'Browser verification mission',exact:true})).toHaveCount(2);await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toHaveCount(0);
  const filteredResponse=await page.request.get('/api/ops/queue?missionId='+missionId+'&status=submitted',{timeout:10_000});expect(filteredResponse.status()).toBe(200);const filteredBody=await filteredResponse.json();expect(filteredBody.data.items).toHaveLength(2);expect(filteredBody.data.items.every((row:any)=>row.missionId===missionId&&row.status==='submitted')).toBe(true);
  await expect(page.getByRole('link',{name:'Reusable filter link',exact:true})).toHaveAttribute('href','/en/ops?missionId='+missionId+'&status=submitted');await page.reload();await expect(page.getByLabel('Review status',{exact:true})).toHaveValue('submitted');await expect(page.getByRole('checkbox',{name:'Browser verification mission',exact:true})).toHaveCount(2);await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(0);
  // Restore the reviewable submitted state after the read-only status-filter exercise.
  await ok(admin.from('mission_milestone_submissions').update({status:'submitted'}).eq('mission_milestone_id',milestones[0].id));
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Browser verification mission',exact:true})).toHaveCount(3);
  await page.getByRole('button',{name:'Select this page',exact:true}).click();await page.getByRole('button',{name:'Preview selection',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toBeVisible();
  await page.getByRole('checkbox').first().uncheck();await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Select this page',exact:true}).click();await page.getByRole('button',{name:'Preview selection',exact:true}).click();await page.getByLabel('Audit reason',{exact:true}).fill('Synthetic browser audit reason');
  await ok(admin.from('mission_milestone_submissions').update({notes:'Held proof changed after snapshot'}).eq('mission_milestone_id',milestones[0].id));
  await page.getByRole('button',{name:'Apply confirmed decision',exact:true}).click();await expect(page.getByRole('status')).toContainText('2 succeeded');await expect(page.getByRole('status')).toContainText('1 failed');
  const retryRequest=page.waitForRequest(r=>r.url().endsWith('/api/ops/bulk')&&r.method()==='POST'&&Array.isArray(r.postDataJSON()?.ids));await page.getByRole('button',{name:'Preview only failed items for retry',exact:true}).click();const failedPreview=await retryRequest;expect(failedPreview.postDataJSON().ids).toHaveLength(1);const failedRow=await ok(admin.from('mission_milestone_submissions').select('id').eq('mission_milestone_id',milestones[0].id).single());expect(failedPreview.postDataJSON().ids).toEqual([failedRow.id]);await page.getByRole('button',{name:'Apply confirmed decision',exact:true}).click();await expect(page.getByRole('status')).toContainText('1 succeeded');await expect(page.getByRole('status')).toContainText('0 failed');
  const rows=await ok(admin.from('mission_milestone_submissions').select('status').in('mission_milestone_id',milestones.map(x=>x.id)));expect(rows.every((x:any)=>x.status==='revision_requested')).toBe(true);
  await page.getByRole('button',{name:'Refresh queue',exact:true}).click();await page.getByRole('button',{name:'Select this page',exact:true}).click();await page.getByRole('button',{name:'Preview selection',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toBeVisible();await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('id',opsMemberId));await page.getByLabel('Audit reason',{exact:true}).fill('Must not run after revocation');await page.getByRole('button',{name:'Apply confirmed decision',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Active operations access is required.'})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Browser verification mission',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Server settlement totals',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toHaveCount(0);const denied=await page.request.get('/api/ops/queue?missionId='+missionId+'&status=submitted',{timeout:10_000});expect(denied.status()).toBe(403);expect((await denied.json()).ok).toBe(false);
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

test('operations page-only selection resets across the actual cursor and a filter link reload',async({page,baseURL})=>{
 test.setTimeout(90_000);page.setDefaultTimeout(10_000);expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
 const ids:string[]=[];let merchantId='',missionId='',opsMemberId='';const password='Synthetic!'+randomUUID(),email='synthetic-page-ops-'+randomUUID()+'@example.test';
 const ok=async(p:PromiseLike<any>)=>{const r=await p;expect(r.error).toBeNull();return r.data;};
 try{
  const operator=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));ids.push(operator.user.id);const creator=await ok(admin.auth.admin.createUser({email:'synthetic-page-creator-'+randomUUID()+'@example.test',password,email_confirm:true}));ids.push(creator.user.id);
  opsMemberId=(await ok(admin.from('kinnso_ops_members').insert({user_id:operator.user.id,display_name:'Synthetic paging operator',role:'admin'}).select('id').single())).id;
  merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:operator.user.id,company_name:'Synthetic paging fixture',contact_email:email}).select('id').single())).id;
  missionId=(await ok(admin.from('missions').insert({merchant_profile_id:merchantId,title:'Synthetic paged mission',summary:'Explicit isolated fixture',mission_type:'coupon_affiliate',status:'published'}).select('id').single())).id;
  const participantId=(await ok(admin.from('mission_participants').insert({mission_id:missionId,creator_id:creator.user.id,status:'active',source:'open_join'}).select('id').single())).id;
  const milestones=Array.from({length:54},()=>({id:randomUUID(),mission_id:missionId,title:'Synthetic page milestone',description:'Fixture'}));await ok(admin.from('mission_milestones').insert(milestones));await ok(admin.from('mission_milestone_submissions').insert(milestones.map(x=>({mission_milestone_id:x.id,mission_participant_id:participantId,status:'submitted',submitted_at:new Date().toISOString()}))));
  await page.goto('/en/ops?missionId='+missionId+'&status=submitted');await page.getByRole('link',{name:'Sign in to continue',exact:true}).click();await expect(page).toHaveURL(/sign-in/);await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(url=>url.pathname==='/en/ops'&&url.searchParams.get('missionId')===missionId&&url.searchParams.get('status')==='submitted');
  await expect(page.getByRole('checkbox')).toHaveCount(50);await page.getByRole('button',{name:'Select this page',exact:true}).click();await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(50);
  await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.getByRole('checkbox')).toHaveCount(4);await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(0);await page.getByRole('button',{name:'Select this page',exact:true}).click();
  const previewRequest=page.waitForRequest(r=>r.url().endsWith('/api/ops/bulk')&&r.method()==='POST'&&Array.isArray(r.postDataJSON()?.ids));await page.getByRole('button',{name:'Preview selection',exact:true}).click();expect((await previewRequest).postDataJSON().ids).toHaveLength(4);await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('checkbox')).toHaveCount(50);await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Confirm this snapshot',exact:true})).toHaveCount(0);await expect(page.getByLabel('Review status',{exact:true})).toHaveValue('submitted');
  await page.goto('/zh-HK/ops?status=approved');await expect(page.getByRole('alert').filter({hasText:'此篩選連結無效'})).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);await page.getByRole('button',{name:'重設篩選',exact:true}).click();await expect(page.getByRole('checkbox')).toHaveCount(50);
 }finally{
  if(missionId)await ok(admin.from('missions').delete().eq('id',missionId));if(merchantId)await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));if(opsMemberId){await ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id',opsMemberId));await ok(admin.from('kinnso_ops_members').delete().eq('id',opsMemberId));}for(const id of ids)await ok(admin.auth.admin.deleteUser(id));
 }
});
