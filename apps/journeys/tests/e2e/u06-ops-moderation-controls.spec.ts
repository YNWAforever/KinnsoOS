import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');
verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async<T=any>(promise:PromiseLike<any>):Promise<T>=>{const result=await promise;expect(result.error).toBeNull();return result.data as T;};

test('operations creator and merchant moderation writes are audited and left for review',async({page,browser,baseURL},testInfo)=>{
 test.setTimeout(120_000);page.setDefaultTimeout(10_000);page.setDefaultNavigationTimeout(20_000);
 const runId=randomUUID(),password='Synthetic!'+randomUUID();let opsMemberId='',merchantId='';
 const operator=await ok<{user:{id:string;email:string}}>(admin.auth.admin.createUser({email:`synthetic-ops-moderation-${runId}@example.test`,password,email_confirm:true}));
 const creator=await ok<{user:{id:string;email:string}}>(admin.auth.admin.createUser({email:`synthetic-moderation-creator-${runId}@example.test`,password,email_confirm:true}));
 const analyst=await ok<{user:{id:string;email:string}}>(admin.auth.admin.createUser({email:`synthetic-ops-analyst-${runId}@example.test`,password,email_confirm:true}));
  await ok(admin.from('creators').update({status:'active',display_name:`Synthetic moderation creator ${runId}`}).eq('id',creator.user.id));
  opsMemberId=(await ok(admin.from('kinnso_ops_members').insert({user_id:operator.user.id,display_name:`Synthetic moderation operator ${runId}`,role:'admin',status:'active'}).select('id').single())).id;
 const analystMemberId=(await ok(admin.from('kinnso_ops_members').insert({user_id:analyst.user.id,display_name:`Synthetic moderation analyst ${runId}`,role:'analyst',status:'active'}).select('id').single())).id;
  merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:operator.user.id,company_name:`Synthetic moderation merchant ${runId}`,contact_name:'Synthetic owner',contact_email:operator.user.email,status:'active'}).select('id').single())).id;

  await page.goto('/en/sign-in?next='+encodeURIComponent('/en/ops?view=creators&id='+creator.user.id));
  await page.getByLabel('Email',{exact:true}).fill(operator.user.email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/en/ops'&&url.searchParams.get('view')==='creators'&&url.searchParams.get('id')===creator.user.id);
  const analytics=await page.request.get('/api/admin/analytics');expect(analytics.status()).toBe(200);expect(await analytics.json()).toMatchObject({timezone:'UTC',attributionWindowDays:7});

  await test.step('creator status and verification',async()=>{
   const controls=page.getByRole('region',{name:'Moderation controls',exact:true});await expect(controls).toBeVisible();
   await controls.getByRole('combobox',{name:'Operation',exact:true}).selectOption('status');await controls.getByRole('combobox',{name:'New status',exact:true}).selectOption('suspended');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic creator suspension verification');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();
   await expect.poll(async()=>(await ok(admin.from('creators').select('status').eq('id',creator.user.id).single())).status).toBe('suspended');await expect(controls.getByRole('status')).toContainText('Operations record updated.');
   await controls.getByRole('combobox',{name:'New status',exact:true}).selectOption('active');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic creator reinstatement verification');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('creators').select('status').eq('id',creator.user.id).single())).status).toBe('active');
   await controls.getByRole('combobox',{name:'Operation',exact:true}).selectOption('verified');await controls.getByRole('combobox',{name:'New value',exact:true}).selectOption('true');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic creator verification review');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('creators').select('verified').eq('id',creator.user.id).single())).verified).toBe(true);
   await controls.getByRole('combobox',{name:'Operation',exact:true}).selectOption('listed');await controls.getByRole('combobox',{name:'New value',exact:true}).selectOption('true');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic creator directory review');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('creators').select('is_listed').eq('id',creator.user.id).single())).is_listed).toBe(true);
   await controls.getByRole('combobox',{name:'Operation',exact:true}).selectOption('note');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic private creator note');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('ops_audit_log').select('id').eq('actor_ops_member_id',opsMemberId).eq('entity_id',creator.user.id).eq('action','note.add'))).length).toBe(1);
  });

  await test.step('merchant status',async()=>{
   await page.goto('/en/ops?view=merchants&id='+merchantId);const controls=page.getByRole('region',{name:'Moderation controls',exact:true});await expect(controls).toBeVisible();
   await controls.getByRole('combobox',{name:'Operation',exact:true}).selectOption('status');await controls.getByRole('combobox',{name:'New status',exact:true}).selectOption('paused');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic merchant pause verification');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('merchant_profiles').select('status').eq('id',merchantId).single())).status).toBe('paused');
   await controls.getByRole('combobox',{name:'New status',exact:true}).selectOption('active');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic merchant reactivation verification');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('merchant_profiles').select('status').eq('id',merchantId).single())).status).toBe('active');
   await controls.getByRole('combobox',{name:'Operation',exact:true}).selectOption('tier');await controls.getByRole('combobox',{name:'New tier',exact:true}).selectOption('growth');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic merchant tier review');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('merchant_profiles').select('tier').eq('id',merchantId).single())).tier).toBe('growth');
   await controls.getByRole('combobox',{name:'Operation',exact:true}).selectOption('note');await controls.getByRole('textbox',{name:'Audit reason',exact:true}).fill('Synthetic private merchant note');await controls.getByRole('button',{name:'Apply moderation change',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('ops_audit_log').select('id').eq('actor_ops_member_id',opsMemberId).eq('entity_id',merchantId).eq('action','note.add'))).length).toBe(1);
  });

  const audit=await ok<Array<{action:string}>>(admin.from('ops_audit_log').select('action,entity_id').eq('actor_ops_member_id',opsMemberId));
  for(const action of ['status.suspended','status.active','verify.set','verify.set','note.add','tier.set'])expect(audit.some(row=>row.action===action)).toBe(true);
  const analystContext=await browser.newContext({baseURL});try{
   const analystPage=await analystContext.newPage();await analystPage.goto('/en/sign-in?next='+encodeURIComponent('/en/ops'));await analystPage.getByLabel('Email',{exact:true}).fill(analyst.user.email);await analystPage.getByLabel('Password',{exact:true}).fill(password);await analystPage.getByRole('button',{name:'Sign in',exact:true}).click();await analystPage.waitForURL('**/en/ops');
   const denied=await analystPage.request.post('/api/ops/records',{headers:{origin:baseURL!},data:{action:'setCreatorStatus',locale:'en',id:creator.user.id,status:'suspended',reason:'Synthetic analyst denial'}});expect(denied.status()).toBe(403);expect((await ok(admin.from('creators').select('status').eq('id',creator.user.id).single())).status).toBe('active');
  }finally{await analystContext.close();}
  await testInfo.attach('ops-moderation-controls',{body:JSON.stringify({runId,creatorId:creator.user.id,merchantId,opsMemberId,analystMemberId,productionChanged:false}),contentType:'application/json'});
});
