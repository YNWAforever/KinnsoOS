import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const ok=async(promise:PromiseLike<any>)=>{const result=await promise;expect(result.error).toBeNull();return result.data;};
async function signIn(page:Page,email:string,password:string,path:string){
 await page.goto('/en/sign-in?next='+encodeURIComponent(path));await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(url=>url.pathname===path);await page.waitForLoadState('networkidle');
}
async function browserPost(page:Page,path:string,body:unknown){return page.evaluate(async({path,body})=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};},{path,body});}

test('in-app event opens an owned case with visible operator response, customer history and fresh role/ownership guards',async({page,browser,baseURL})=>{
 test.setTimeout(120000);page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
 const users:string[]=[];const contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[];let operatorId:string|undefined;let eventId:string|undefined;
 async function actor(creator=false){const email=`synthetic-support-browser-${randomUUID()}@example.test`,password=`Synthetic!${randomUUID()}`;const user=(await ok(admin.auth.admin.createUser({email,password,email_confirm:true}))).user;users.push(user.id);if(creator)await ok(admin.from('creators').update({status:'active'}).eq('id',user.id));const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});await ok(client.auth.signInWithPassword({email,password}));return{id:user.id,email,password,client};}
 try{
  const customer=await actor(true),other=await actor(),operator=await actor();operatorId=operator.id;
  await ok(admin.from('kinnso_ops_members').insert({user_id:operator.id,display_name:'Synthetic browser support operator',role:'admin'}));
  eventId=randomUUID();await ok(admin.from('notifications').insert({id:eventId,creator_id:customer.id,notification_type:'submission.revision_requested',entity_type:'mission',entity_id:randomUUID(),payload:{mission_title:'Synthetic support browser event',secret:'PRIVATE_NOT_PROJECTED'}}));
  await signIn(page,customer.email,customer.password,'/en/inbox');await expect(page.getByRole('heading',{name:'Your inbox',exact:true})).toBeVisible();
  await expect(page.getByText('Email delivery is not configured. These are in-app notifications.',{exact:true})).toBeVisible();
  await expect(page.getByText('1 unread notifications',{exact:true})).toBeVisible();await expect(page.getByText('PRIVATE_NOT_PROJECTED',{exact:false})).toHaveCount(0);
  const event=page.getByRole('article').filter({has:page.getByText('Synthetic support browser event',{exact:true})});
  await event.getByRole('button',{name:'Mark as read',exact:true}).click();await expect(page.getByText('0 unread notifications',{exact:true})).toBeVisible();
  expect((await ok(admin.from('notifications').select('read_at').eq('id',eventId).single())).read_at).toBeTruthy();
  await event.getByRole('link',{name:'Ask support about this event',exact:true}).click();await page.waitForURL(`**/en/support?event=${eventId}`);
  const subject='Synthetic visible support case '+randomUUID(),firstMessage='Synthetic initial customer message';
  await page.getByLabel('Case subject',{exact:true}).fill(subject);await page.getByLabel('Message to support',{exact:true}).fill(firstMessage);
  const creation=page.waitForResponse(r=>r.url().endsWith('/api/support')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create support case',exact:true}).click();const created=await creation;expect(created.status()).toBe(200);const caseId=(await created.json()).data.id;
  const caseCard=page.getByRole('article').filter({has:page.getByRole('heading',{name:subject,exact:true})});await expect(caseCard).toContainText(firstMessage);await expect(caseCard).toContainText('open');
  const own=(await ok(customer.client.rpc('get_kinnso_support'))).items.find((c:any)=>c.id===caseId);expect(own.linkedEventId).toBe(eventId);expect(own.revision).toBe(1);
  const opContext=await browser.newContext({baseURL});contexts.push(opContext);opContext.setDefaultTimeout(10000);opContext.setDefaultNavigationTimeout(15000);const opPage=await opContext.newPage();await signIn(opPage,operator.email,operator.password,'/en/ops/support');await expect(opPage.getByRole('heading',{name:'Support queue',exact:true})).toBeVisible();
  const opCard=opPage.getByRole('article').filter({has:opPage.getByRole('heading',{name:subject,exact:true})});await expect(opCard).toContainText(firstMessage);
  const internalReason='PRIVATE_INTERNAL_SYNTHETIC_REASON reviewed the authored event';const visibleResponse='Synthetic support response: please supply the activity date.';
  await opPage.getByLabel('Case decision',{exact:true}).selectOption('waiting_customer');await opPage.getByLabel('Internal decision reason',{exact:true}).fill(internalReason);
  await expect(opCard.getByRole('button',{name:'Assign to me and apply decision',exact:true})).toBeDisabled();
  await opPage.getByLabel('Response visible to the customer',{exact:true}).fill(visibleResponse);
  const review=opPage.waitForResponse(r=>r.url().endsWith('/api/support')&&r.request().method()==='POST');await opCard.getByRole('button',{name:'Assign to me and apply decision',exact:true}).click();const reviewed=await review;expect(reviewed.status()).toBe(200);
  await expect(opCard).toContainText('waiting_customer');await expect(opCard).toContainText(visibleResponse);
  await page.getByRole('button',{name:'Refresh cases',exact:true}).click();await expect(caseCard).toContainText('waiting_customer');await expect(caseCard).toContainText(visibleResponse);await expect(page.getByText(internalReason,{exact:true})).toHaveCount(0);
  const customerReply='Synthetic requested activity date: 2030-01-01.';await caseCard.getByLabel('Reply to this case',{exact:true}).fill(customerReply);
  // The textarea already contains this text before saving; DOM text alone does not
  // prove completion. Wait for the actual command response before navigating away.
  const reply=page.waitForResponse(r=>r.url().endsWith('/api/support')&&r.request().method()==='POST');
  await caseCard.getByRole('button',{name:'Send case reply',exact:true}).click();
  const replied=await reply;expect(replied.status()).toBe(200);const savedReply=await replied.json();
  expect(savedReply.ok).toBe(true);expect(savedReply.data.revision).toBe(3);
  const persistedReply=(await ok(customer.client.rpc('get_kinnso_support'))).items.find((c:any)=>c.id===caseId);
  expect(persistedReply.revision).toBe(3);expect(persistedReply.messages.map((m:any)=>m.message)).toContain(customerReply);
  await expect(caseCard).toContainText(customerReply);
  await page.reload();await expect(caseCard).toContainText(firstMessage);await expect(caseCard).toContainText(visibleResponse);await expect(caseCard).toContainText(customerReply);
  const history=(await ok(customer.client.rpc('get_kinnso_support'))).items.find((c:any)=>c.id===caseId);expect(history.revision).toBe(3);expect(history.messages.map((m:any)=>m.message)).toEqual([firstMessage,visibleResponse,customerReply]);expect(JSON.stringify(history)).not.toContain(internalReason);
  const otherContext=await browser.newContext({baseURL});contexts.push(otherContext);otherContext.setDefaultTimeout(10000);otherContext.setDefaultNavigationTimeout(15000);const otherPage=await otherContext.newPage();await signIn(otherPage,other.email,other.password,'/en/support');await expect(otherPage.getByRole('heading',{name:subject,exact:true})).toHaveCount(0);
  const denied=await browserPost(otherPage,'/api/support',{requestId:randomUUID(),command:{type:'reply',id:caseId,expectedRevision:3,message:'Cross-owner attempt'}});expect(denied.status).toBe(404);expect(denied.body.code).toBe('NOT_FOUND');
  const deniedOps=await otherPage.request.get('/api/support?ops=true');expect(deniedOps.status()).toBe(403);
  await page.goto('/en/inbox');await expect(page.getByRole('heading',{name:'support.updated',exact:true})).toBeVisible();await expect(page.getByText('Email delivery is not configured. These are in-app notifications.',{exact:true})).toBeVisible();
  // A paused role must fail immediately in the same authenticated browser and clear private queue content after refresh.
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('user_id',operator.id));
  const replayAfterRevocation=await browserPost(opPage,'/api/support',reviewed.request().postDataJSON());expect(replayAfterRevocation.status).toBe(403);expect(replayAfterRevocation.body.code).toBe('FORBIDDEN');
  await opPage.getByRole('button',{name:'Refresh cases',exact:true}).click();await expect(opPage.getByRole('alert').filter({hasText:'Support request was not completed'})).toBeVisible();await expect(opPage.getByRole('heading',{name:subject,exact:true})).toHaveCount(0);
 }finally{
  for(const context of contexts)await context.close().catch(()=>{});
  if(eventId)await ok(admin.from('notifications').delete().eq('id',eventId));
  if(operatorId)await ok(admin.from('kinnso_ops_members').delete().eq('user_id',operatorId));
  for(const id of users)await ok(admin.auth.admin.deleteUser(id));
 }
});
