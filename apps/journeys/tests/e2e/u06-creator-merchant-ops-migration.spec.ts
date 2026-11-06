import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');
verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async<T=any>(promise:PromiseLike<any>):Promise<T>=>{const result=await promise;expect(result.error).toBeNull();return result.data as T;};
async function user(prefix:string){
 const email=`${prefix}-${randomUUID()}@example.test`,password='Synthetic!'+randomUUID();
 const made=await ok<{user:{id:string}}>(admin.auth.admin.createUser({email,password,email_confirm:true}));
 return{id:made.user.id,email,password};
}
async function signIn(page:Page,actor:{email:string;password:string},path:string){
 await page.goto('/en/sign-in?next='+encodeURIComponent('/en/'+path));
 await page.getByLabel('Email',{exact:true}).fill(actor.email);
 await page.getByLabel('Password',{exact:true}).fill(actor.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL(url=>url.pathname==='/en/'+path.split('?')[0]);
}

test('creator, merchant and operations migration works end to end on the isolated backend',async({browser,baseURL},testInfo)=>{
 test.setTimeout(240_000);expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
 const runId=randomUUID(),userIds:string[]=[],contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[];
 let creatorId='',merchantId='',foreignMerchantId='',opsMemberId='',offerId='',sessionId='';
 const perkId=randomUUID(),upcomingPerkId=randomUUID(),company=`Synthetic migration company ${runId}`;
 try{
  const creator=await user('synthetic-migration-creator');userIds.push(creator.id);
  const merchant=await user('synthetic-migration-merchant');userIds.push(merchant.id);
  const foreign=await user('synthetic-migration-foreign');userIds.push(foreign.id);
  const operator=await user('synthetic-migration-operator');userIds.push(operator.id);
  creatorId=creator.id;
  const creatorRows=await ok(admin.from('creators').update({status:'active',display_name:`Synthetic migration creator ${runId}`}).eq('id',creator.id).select('id'));
  expect(creatorRows).toHaveLength(1);
  merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:merchant.id,company_name:company,contact_name:'Synthetic merchant owner',contact_email:merchant.email,website_url:'https://example.test',status:'active'}).select('id').single())).id;
  foreignMerchantId=(await ok(admin.from('merchant_profiles').insert({user_id:foreign.id,company_name:`Synthetic foreign company ${runId}`,contact_name:'Synthetic foreign owner',contact_email:foreign.email,website_url:'https://example.test',status:'active'}).select('id').single())).id;
  opsMemberId=(await ok(admin.from('kinnso_ops_members').insert({user_id:operator.id,display_name:`Synthetic migration operator ${runId}`,role:'admin',status:'active'}).select('id').single())).id;
  await ok(admin.from('creator_contribution').upsert({creator_id:creator.id,contribution_points:75,tier:'rising'}, {onConflict:'creator_id'}));
  await ok(admin.from('partner_perks').insert([
   {id:perkId,slug:`migration-${runId}-rising`,partner_name:'Synthetic Partner',title:'Migration rail benefit',summary:'Synthetic benefit for isolated workflow verification.',category:'travel',discount_label:'10%',min_tier:'rising',redemption_type:'code',redemption_value:'MIGRATION-CODE',sort_order:10,active:true},
   {id:upcomingPerkId,slug:`migration-${runId}-pro`,partner_name:'Synthetic Partner',title:'Next-tier migration benefit',summary:'Synthetic next-tier benefit.',category:'travel',discount_label:'15%',min_tier:'pro',redemption_type:'link',redemption_value:'https://example.test/next-tier',sort_order:11,active:true},
  ]));

  const creatorContext=await browser.newContext({baseURL});contexts.push(creatorContext);const creatorPage=await creatorContext.newPage();
  await signIn(creatorPage,creator,'studio/sessions/new');
  await expect(creatorPage.getByRole('heading',{name:'Create a session',exact:true})).toBeVisible();
  await creatorPage.getByLabel('Session title',{exact:true}).fill(`Synthetic migration session ${runId}`);
  await creatorPage.getByLabel('Description',{exact:true}).fill('Synthetic creator session for isolated migration verification.');
  await creatorPage.getByLabel('Starts at (UTC)',{exact:true}).fill('2026-11-20T10:00');
  await creatorPage.getByLabel('Live YouTube URL (optional until going live)',{exact:true}).fill('https://www.youtube.com/watch?v=abc123');
  await creatorPage.getByLabel('Destination tags, comma-separated',{exact:true}).fill('Tokyo, Cafés');
  await creatorPage.getByRole('button',{name:'Save session',exact:true}).click();
  await expect(creatorPage.getByRole('status').filter({hasText:'Session saved on the server.'})).toBeVisible();
  sessionId=(await ok(admin.from('community_sessions').select('id').eq('host_creator_id',creator.id).eq('title',`Synthetic migration session ${runId}`).single())).id;
  await creatorPage.goto('/en/studio/sessions');await expect(creatorPage.getByRole('heading',{name:`Synthetic migration session ${runId}`,exact:true})).toBeVisible();
  await creatorPage.goto('/en/studio/sessions/'+sessionId+'/edit');await creatorPage.getByRole('button',{name:'Go live',exact:true}).click();await expect(creatorPage.getByRole('status').filter({hasText:'Session status updated.'})).toBeVisible();
  expect((await ok(admin.from('community_sessions').select('status').eq('id',sessionId).single())).status).toBe('live');
  await creatorPage.goto('/en/studio/tier');await expect(creatorPage.getByRole('heading',{name:'rising',exact:true})).toBeVisible();await expect(creatorPage.getByText('Next-tier migration benefit',{exact:false})).toBeVisible();
  await creatorPage.goto('/en/studio/perks');await expect(creatorPage.getByRole('heading',{name:'Migration rail benefit',exact:true})).toBeVisible();
  const[redeemed]=await Promise.all([
   creatorPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/creator/perks'&&response.request().method()==='POST'),
   creatorPage.getByRole('article').filter({hasText:'Migration rail benefit'}).getByRole('button',{name:'Redeem perk',exact:true}).click(),
  ]);
  const redeemBody=await redeemed.json();
  expect(redeemed.status(),JSON.stringify(redeemBody)).toBe(200);expect(redeemBody.ok).toBe(true);
  await expect(creatorPage.getByText('MIGRATION-CODE',{exact:true})).toBeVisible();
  await creatorPage.goto('/en/studio/offers');await expect(creatorPage.getByRole('heading',{name:'Affiliate offers',exact:true})).toBeVisible();await expect(creatorPage.getByText('Affiliate offer execution and partner tracking links remain disabled',{exact:false})).toBeVisible();
  await creatorPage.goto('/en/studio/scan');await expect(creatorPage.getByRole('heading',{name:'Creator scan and DNA',exact:true})).toBeVisible();await expect(creatorPage.getByText('Paid AI scanning and media analysis remain disabled',{exact:false})).toBeVisible();

  const merchantContext=await browser.newContext({baseURL});contexts.push(merchantContext);const merchantPage=await merchantContext.newPage();
  await signIn(merchantPage,merchant,'merchant?section=offers');
  await expect(merchantPage).toHaveURL(/\/en\/merchant\?section=offers$/);
  await merchantPage.getByLabel('Company',{exact:true}).selectOption(merchantId);
  await expect(merchantPage.getByRole('heading',{name:'Offers and visits',exact:true})).toBeVisible();
  await merchantPage.getByLabel('Offer title',{exact:true}).fill(`Synthetic migration offer ${runId}`);
  await merchantPage.getByLabel('Terms',{exact:true}).fill('Synthetic offer for isolated migration verification.');
  await merchantPage.getByLabel('Discount value',{exact:true}).fill('10');
  await merchantPage.getByLabel('Creator commission value',{exact:true}).fill('5');
  await merchantPage.getByLabel('Valid from (UTC)',{exact:true}).fill('2026-11-20T10:00');
  await merchantPage.getByLabel('Valid to (UTC)',{exact:true}).fill('2026-12-20T10:00');
  await merchantPage.getByRole('button',{name:'Save offer',exact:true}).click();
  await expect(merchantPage.getByRole('status').filter({hasText:'Offer saved.'})).toBeVisible();
  await expect(merchantPage.getByRole('heading',{name:`Synthetic migration offer ${runId}`,exact:true})).toBeVisible();
  offerId=(await ok(admin.from('merchant_offers').select('id').eq('merchant_profile_id',merchantId).eq('title',`Synthetic migration offer ${runId}`).single())).id;
  await merchantPage.getByRole('button',{name:'Publish offer',exact:true}).click();await expect(merchantPage.getByRole('status').filter({hasText:'Offer status updated.'})).toBeVisible();
  const foreignResponse=await merchantPage.request.get('/api/merchant/offers?company='+foreignMerchantId);expect(foreignResponse.status()).toBe(403);
  await merchantPage.goto('/en/merchants/dashboard/offers');await expect(merchantPage).toHaveURL(/\/en\/merchant\?section=offers$/);
  for(const[path,section]of[['merchants/creators','creators'],['merchants/insights','insights'],['merchants/missions','missions'],['merchants/post','post']]){
   await merchantPage.goto('/en/'+path);await expect(merchantPage).toHaveURL(new RegExp('/en/merchant\\?section='+section+'$'));
  }
  await merchantPage.goto('/en/merchants/apply');await expect(merchantPage).toHaveURL(/\/en\/merchant$/);
  for(const[path,section]of[['creators','creators'],['insights','insights'],['profile','profile'],['redeem','redeem'],['missions','missions']]){
   await merchantPage.goto('/en/merchants/dashboard/'+path);await expect(merchantPage).toHaveURL(new RegExp('/en/merchant\\?section='+section+'$'));
  }
  await merchantPage.goto('/en/merchants/dashboard/experiences');await expect(merchantPage).toHaveURL(/\/en\/merchant\?section=experiences$/);await expect(merchantPage.getByText('Experience and media management is outside this release.',{exact:false})).toBeVisible();
  await merchantPage.goto('/en/merchants/dashboard/experiences/new');await expect(merchantPage).toHaveURL(/\/en\/merchant\?section=experiences&mode=new$/);
  await expect(merchantPage.locator('a[href*="remix-kinnso-web.vercel.app"]')).toHaveCount(0);

  const opsContext=await browser.newContext({baseURL});contexts.push(opsContext);const opsPage=await opsContext.newPage();
  await signIn(opsPage,operator,'ops?view=overview');await expect(opsPage.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  const analyticsResponse=await opsPage.request.get('/api/admin/analytics');expect(analyticsResponse.status()).toBe(200);const analyticsBody=await analyticsResponse.json();expect(analyticsBody).toMatchObject({timezone:'UTC',attributionWindowDays:7});expect(Array.isArray(analyticsBody.rows)).toBe(true);
  await opsPage.goto('/en/admin/creators');await expect(opsPage).toHaveURL(/\/en\/ops\?view=creators$/);await expect(opsPage.getByRole('heading',{name:`Synthetic migration creator ${runId}`,exact:true})).toBeVisible();
  await opsPage.goto('/en/admin/merchants');await expect(opsPage.getByRole('heading',{name:company,exact:true})).toBeVisible();
  await opsPage.goto('/en/ops?view=sessions');await expect(opsPage.getByRole('heading',{name:`Synthetic migration session ${runId}`,exact:true})).toBeVisible();
  await opsPage.goto('/en/ops?view=perks');await expect(opsPage.getByRole('heading',{name:'Migration rail benefit',exact:true})).toBeVisible();
  await opsPage.goto('/en/ops?view=payouts');await expect(opsPage.getByRole('heading',{name:'This capability remains gated',exact:true})).toBeVisible();
  await opsPage.goto('/en/ops/settlements');await expect(opsPage.getByRole('heading',{name:'Settlement operations',exact:true})).toBeVisible();await expect(opsPage.getByText('Payout and settlement execution remains outside this release.',{exact:false})).toBeVisible();
  for(const[path,title]of[['analytics','Analytics'],['missions','Missions'],['sessions','Sessions'],['team','Operations team'],['perks','Perks'],['testimonials','Testimonials'],['users','Users']]){
   await opsPage.goto('/en/admin/'+path);await expect(opsPage).toHaveURL(new RegExp('/en/ops\\?view='+path+'$'));await expect(opsPage.getByRole('heading',{name:title,exact:true})).toBeVisible();
  }
  await opsPage.goto('/en/admin/bookings');await expect(opsPage.getByRole('heading',{name:'This capability remains gated',exact:true})).toBeVisible();
  await opsPage.goto('/en/admin/enquiries');await expect(opsPage).toHaveURL(/\/en\/ops\?view=enquiries$/);
  await opsPage.goto('/en/admin/merchants/applications');await expect(opsPage).toHaveURL(/\/en\/ops\/merchants$/);
  await opsPage.setViewportSize({width:320,height:800});await opsPage.goto('/en/admin/creators');await expect.poll(()=>opsPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('id',opsMemberId));await opsPage.reload();await expect(opsPage.getByRole('alert').filter({hasText:'Operations record could not be loaded'})).toBeVisible();await expect(opsPage.getByText(`Synthetic migration creator ${runId}`,{exact:true})).toHaveCount(0);
  await testInfo.attach('creator-merchant-ops-migration',{body:JSON.stringify({runId,sessionId,offerId,merchantId,creatorId,productionChanged:false}),contentType:'application/json'});
 }finally{
  const failures:string[]=[];
  const clean=async(name:string,work:()=>PromiseLike<unknown>)=>{try{await work();}catch{failures.push(name);}};
  for(const context of contexts)await clean('context',()=>context.close());
  if(offerId)await clean('offer',()=>ok(admin.from('merchant_offers').delete().eq('id',offerId)));
  else if(merchantId)await clean('offer-run',()=>ok(admin.from('merchant_offers').delete().eq('merchant_profile_id',merchantId).eq('title',`Synthetic migration offer ${runId}`)));
  if(sessionId)await clean('session',()=>ok(admin.from('community_sessions').delete().eq('id',sessionId)));
  else if(creatorId)await clean('session-run',()=>ok(admin.from('community_sessions').delete().eq('host_creator_id',creatorId).eq('title',`Synthetic migration session ${runId}`)));
  if(creatorId)await clean('perk redemption',()=>ok(admin.from('perk_redemptions').delete().eq('creator_id',creatorId)));
  await clean('perks',()=>ok(admin.from('partner_perks').delete().in('id',[perkId,upcomingPerkId])));
  if(creatorId)await clean('contribution',()=>ok(admin.from('creator_contribution').delete().eq('creator_id',creatorId)));
  if(merchantId)await clean('merchant',()=>ok(admin.from('merchant_profiles').delete().eq('id',merchantId)));
  if(foreignMerchantId)await clean('foreign merchant',()=>ok(admin.from('merchant_profiles').delete().eq('id',foreignMerchantId)));
  if(opsMemberId){await clean('ops audit',()=>ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id',opsMemberId)));await clean('ops member',()=>ok(admin.from('kinnso_ops_members').delete().eq('id',opsMemberId)));}
  for(const id of userIds)await clean('user '+id,()=>ok(admin.auth.admin.deleteUser(id)));
  if(failures.length){testInfo.annotations.push({type:'fixture cleanup failures',description:failures.join(', ')});throw Error('Synthetic migration cleanup failed: '+failures.join(', '));}
 }
});
