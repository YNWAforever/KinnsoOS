import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {cleanOpsInviteFixtures} from '../integration/ops-invite-fixtures.mjs';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');
verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async<T=any>(promise:PromiseLike<any>):Promise<T>=>{const result=await promise;expect(result.error).toBeNull();return result.data as T;};
async function user(prefix:string){const email=`${prefix}-${randomUUID()}@example.test`,password='Synthetic!'+randomUUID();const made=await ok<{user:{id:string}}>(admin.auth.admin.createUser({email,password,email_confirm:true}));return{id:made.user.id,email,password};}
async function signIn(page:Page,actor:{email:string;password:string},path:string){await page.goto('/en/sign-in?next='+encodeURIComponent('/en/'+path));await page.getByLabel('Email',{exact:true}).fill(actor.email);await page.getByLabel('Password',{exact:true}).fill(actor.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(url=>url.pathname==='/en/'+path.split('?')[0]);}

test('operations owner invites, accepts, changes and revokes access with safe retries',async({browser,baseURL},testInfo)=>{
 test.setTimeout(180_000);expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
 const runId=randomUUID(),contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[],userIds:string[]=[],memberIds:string[]=[];
 const owner=await user('synthetic-ops-owner'),invited=await user('synthetic-ops-invited'),analyst=await user('synthetic-ops-analyst'),revoked=await user('synthetic-ops-revoked');
 userIds.push(owner.id,invited.id,analyst.id,revoked.id);
 let ownerMember='',analystMember='';
 try{
  ownerMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:owner.id,display_name:`Owner ${runId}`,role:'owner',status:'active'}).select('id').single())).id;
  analystMember=(await ok(admin.from('kinnso_ops_members').insert({user_id:analyst.id,display_name:`Analyst ${runId}`,role:'analyst',status:'active'}).select('id').single())).id;
  memberIds.push(ownerMember,analystMember);

  const ownerContext=await browser.newContext({baseURL});contexts.push(ownerContext);const page=await ownerContext.newPage();
  page.setDefaultTimeout(15_000);page.setDefaultNavigationTimeout(20_000);
  await signIn(page,owner,'ops?view=team');await expect(page.getByRole('heading',{name:'Operations team',exact:true})).toBeVisible();
  await page.getByLabel('Email',{exact:true}).fill(invited.email);await page.getByRole('combobox',{name:'Role',exact:true}).selectOption('analyst');
  const firstInvite=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/ops/team'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Generate invite link',exact:true}).click();expect((await firstInvite).status()).toBe(201);
  const inviteInput=page.getByLabel('One-time invitation link',{exact:true});await expect(inviteInput).toBeVisible();const inviteUrl=await inviteInput.inputValue(),invite=new URL(inviteUrl),token=new URLSearchParams(invite.hash.slice(1)).get('token');expect(invite.search).toBe('');expect(invite.hash).toBe('#token='+token);expect(token).toMatch(/^[a-f0-9]{64}$/);
  const pendingFirst=await ok<Array<{id:string;token:string}>>(admin.from('kinnso_ops_invites').select('id,token').eq('email',invited.email).eq('status','pending'));expect(pendingFirst).toHaveLength(1);expect(pendingFirst[0].token).toBe(token);

  const invitedContext=await browser.newContext({baseURL});contexts.push(invitedContext);const invitedPage=await invitedContext.newPage();invitedPage.setDefaultTimeout(15_000);await invitedPage.goto(inviteUrl);
  await invitedPage.getByRole('link',{name:'Sign in to continue',exact:true}).click();await invitedPage.getByLabel('Email',{exact:true}).fill(invited.email);await invitedPage.getByLabel('Password',{exact:true}).fill(invited.password);await invitedPage.getByRole('button',{name:'Sign in',exact:true}).click();await invitedPage.waitForURL(url=>url.pathname==='/en/ops/accept-invite');
  await invitedPage.getByRole('button',{name:'Accept invitation',exact:true}).click();await expect(invitedPage.getByRole('status').filter({hasText:'Invitation accepted.'})).toBeVisible();
  const invitedMembership=await ok(admin.from('kinnso_ops_members').select('id,role,status').eq('user_id',invited.id).single());memberIds.push(invitedMembership.id);expect(invitedMembership).toMatchObject({role:'analyst',status:'active'});
  const replay=await invitedPage.request.post('/api/ops/invitations/accept',{headers:{origin:baseURL!},data:{token}});expect(replay.status()).toBe(200);

  await page.goto('/en/ops?view=team');const invitedName=invited.email!.split('@')[0];let invitedCard=page.locator('article.k-team-member').filter({hasText:invitedName});await expect(invitedCard).toBeVisible();
  await page.getByLabel('Reason for access change',{exact:true}).fill('Promote invited operator for review coverage');await page.getByLabel(`New role for ${invitedName}`,{exact:true}).selectOption('moderator');await invitedCard.getByRole('button',{name:'Apply role',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('kinnso_ops_members').select('role').eq('id',invitedMembership.id).single())).role).toBe('moderator');
  await page.reload();invitedCard=page.locator('article.k-team-member').filter({hasText:invitedName});await page.getByLabel('Reason for access change',{exact:true}).fill('Temporary suspension during access review');await invitedCard.getByRole('button',{name:'Suspend',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('kinnso_ops_members').select('status').eq('id',invitedMembership.id).single())).status).toBe('suspended');
  await page.reload();invitedCard=page.locator('article.k-team-member').filter({hasText:invitedName});await page.getByLabel('Reason for access change',{exact:true}).fill('Reviewed access remains required');await invitedCard.getByRole('button',{name:'Reactivate',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('kinnso_ops_members').select('status').eq('id',invitedMembership.id).single())).status).toBe('active');

  await page.getByLabel('Email',{exact:true}).fill(revoked.email);await page.getByRole('combobox',{name:'Role',exact:true}).selectOption('analyst');await page.getByRole('button',{name:'Generate invite link',exact:true}).click();const revokedInvite=page.locator('article.k-team-member').filter({hasText:revoked.email});await expect(revokedInvite).toBeVisible();await revokedInvite.getByRole('button',{name:'Revoke invite',exact:true}).click();await expect.poll(async()=>(await ok(admin.from('kinnso_ops_invites').select('status').eq('email',revoked.email).single())).status).toBe('revoked');

  const analystContext=await browser.newContext({baseURL});contexts.push(analystContext);const analystPage=await analystContext.newPage();await signIn(analystPage,analyst,'ops?view=team');await expect(analystPage.getByRole('heading',{name:'Operations team',exact:true})).toBeVisible();await expect(analystPage.getByRole('form',{name:'Invite operations member',exact:true})).toHaveCount(0);
  const denied=await analystPage.request.post('/api/ops/team',{headers:{origin:baseURL!},data:{action:'invite',email:'denied@example.test',role:'analyst'}});expect(denied.status()).toBe(403);
  await page.setViewportSize({width:320,height:800});await page.goto('/en/ops?view=team');await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await testInfo.attach('ops-team-result',{body:JSON.stringify({runId,inviteId:pendingFirst[0].id,invitedMemberId:invitedMembership.id,productionChanged:false}),contentType:'application/json'});
 }finally{
  const failures:string[]=[];const clean=async(name:string,work:()=>PromiseLike<unknown>)=>{try{await work();}catch{failures.push(name);}};
  for(const context of contexts)await clean('context',()=>context.close());
  await clean('invite history',async()=>cleanOpsInviteFixtures([owner.email,invited.email,analyst.email,revoked.email]));
  if(memberIds.length)await clean('audit',()=>ok(admin.from('ops_audit_log').delete().in('actor_ops_member_id',memberIds)));
  if(userIds.length)await clean('members',()=>ok(admin.from('kinnso_ops_members').delete().in('user_id',userIds)));
  for(const id of userIds)await clean('user '+id,()=>ok(admin.auth.admin.deleteUser(id)));
  if(failures.length){testInfo.annotations.push({type:'fixture cleanup failures',description:failures.join(', ')});throw Error('Synthetic operations team cleanup failed: '+failures.join(', '));}
 }
});

test('invite operation still returns 201 after revoke and rejects changed input',async({page,baseURL})=>{
 test.setTimeout(90000);
 expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
 const owner=await user('receipt-owner'),email='receipt-invite-'+randomUUID()+'@example.test';
 let memberId:string|undefined;
 try{
  memberId=(await ok(admin.from('kinnso_ops_members').insert({user_id:owner.id,display_name:'Receipt owner',role:'owner',status:'active'}).select('id').single())).id;
  await signIn(page,owner,'ops?view=team');
  const post=(data:object)=>page.request.post('/api/ops/team',{headers:{origin:baseURL!},data});
  const command={action:'invite',email,role:'analyst',requestId:randomUUID()};
  const first=await post(command);expect(first.status()).toBe(201);
  const invite=await ok(admin.from('kinnso_ops_invites').select('id').eq('email',email).single());
  expect((await post({action:'revoke',inviteId:invite.id,requestId:randomUUID()})).status()).toBe(200);
  const replay=await post(command);expect(replay.status()).toBe(201);
  expect((await replay.json()).data.token===(await first.json()).data.token).toBe(true);
  expect((await post({...command,role:'owner'})).status()).toBe(409);
  expect((await ok(admin.from('kinnso_ops_invites').select('status').eq('id',invite.id).single())).status).toBe('revoked');
 }finally{
  cleanOpsInviteFixtures([email]);
  if(memberId){
   await ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id',memberId));
   await ok(admin.from('kinnso_ops_members').delete().eq('id',memberId));
  }
  await ok(admin.auth.admin.deleteUser(owner.id));
 }
});
