import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';import {loadEnvFile} from 'node:process';import {execFileSync} from 'node:child_process';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
import type {SupabaseClient} from '@supabase/supabase-js';
let admin:SupabaseClient,clientFactory:typeof import('@supabase/supabase-js').createClient,container:string;
const sql=(q:string)=>execFileSync('docker',['exec',container,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
test.beforeAll(async()=>{
 if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')throw Error('BLOCKED: new share recovery runtime cases require fresh owned CI, never pilot/shared targets');
 loadEnvFile('.env.test');const t=verifyTestTarget();if(t.projectRef!=='kinnsoos-b1-20261002')throw Error('Owned CI project required');container=t.dbContainer;
 const inspect=(name:string)=>JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0],db=inspect(container),gateway=inspect('supabase_kong_'+t.projectRef);
 for(const c of [db,gateway]){expect(c.Config.Labels['com.supabase.cli.project']).toBe(t.projectRef);expect(c.State.Running).toBe(true);}
 expect((gateway.NetworkSettings.Ports['8000/tcp']??[]).some((p:{HostPort:string})=>p.HostPort==='58421')).toBe(true);
 clientFactory=(await import('@supabase/supabase-js')).createClient;admin=clientFactory(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
});
const labels={en:{sign:'Sign in',note:'Private note',create:'Create read-only link',field:'Share link',revoke:'Revoke link',recover:/^Recover link$/},'zh-HK':{sign:'登入',note:'私人筆記',create:'建立唯讀連結',field:'分享連結',revoke:'撤銷連結',recover:/^(取回連結|恢復連結)$/}};
async function login(page:Page,locale:'en'|'zh-HK',email:string,password:string,trip:string){await page.goto('/'+locale+'/sign-in?next='+encodeURIComponent('/'+locale+'/trips/'+trip));await page.getByLabel(locale==='en'?'Email':'電郵',{exact:true}).fill(email);await page.getByLabel(locale==='en'?'Password':'密碼',{exact:true}).fill(password);await page.getByRole('button',{name:labels[locale].sign,exact:true}).click();await expect(page.getByLabel(labels[locale].note,{exact:true})).toHaveValue('PRIVATE_DURABLE_SHARE_NOTE',{timeout:15000});}
for(const locale of ['en','zh-HK'] as const)test('PD06 durable lost-ACK share recovers the same URL in a second authenticated context: '+locale,async({browser})=>{
 test.setTimeout(120000);const ids:string[]=[],contexts:BrowserContext[]=[],l=labels[locale];
 try{
  const email='synthetic-pd06-'+randomUUID()+'@example.test',password='PD06!'+randomUUID();
  const user=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(user.error).toBeNull();const actor=user.data.user!.id;ids.push(actor);
  const client=clientFactory(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
  let r=await client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic durable share',timezone:'Asia/Hong_Kong',startDate:null}});expect(r.error).toBeNull();const trip=r.data.id,day=randomUUID(),stop=randomUUID();
  r=await client.rpc('apply_trip_command',{p_trip_id:trip,p_expected_revision:r.data.revision,p_request_id:randomUUID(),p_command:{type:'addDay',id:day,offset:0,title:'Synthetic day'}});expect(r.error).toBeNull();
  r=await client.rpc('apply_trip_command',{p_trip_id:trip,p_expected_revision:r.data.revision,p_request_id:randomUUID(),p_command:{type:'addStop',id:stop,dayId:day,position:0,input:{title:'Selected durable place',placeId:null,travellerNote:'PRIVATE_DURABLE_SHARE_NOTE',startMinuteOfDay:0,durationMinutes:60}}});expect(r.error).toBeNull();
  const first=await browser.newContext({viewport:{width:320,height:780}});contexts.push(first);const page=await first.newPage();await login(page,locale,email,password,trip);
  await page.getByRole('checkbox',{name:'Selected durable place',exact:true}).check();
  let intent:Record<string,unknown>|undefined,committed:Record<string,unknown>|undefined,posts=0;
  await page.route('**/api/shares',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}posts++;intent=route.request().postDataJSON();const response=await route.fetch();expect(response.status()).toBe(200);committed=(await response.json()).data;await route.abort('failed');});
  await page.getByRole('button',{name:l.create,exact:true}).click();await expect.poll(()=>posts).toBe(1);await expect.poll(()=>Boolean(committed)).toBe(true);await expect(page.getByRole('button',{name:l.create,exact:true})).toBeDisabled();
  const original=structuredClone(intent!);expect(typeof original.requestId).toBe('string');
  const receipt=await page.request.get('/api/shares/receipts?'+new URLSearchParams({tripId:trip,requestId:String(original.requestId)}));expect(receipt.status()).toBe(200);const saved=(await receipt.json()).data;expect(saved.url).toBe(committed!.url);expect(saved.state).toBe('active');
  const retry=await page.request.post('/api/shares',{headers:{origin:'http://127.0.0.1:3495'},data:original});expect(retry.status()).toBe(200);expect((await retry.json()).data.url).toBe(saved.url);expect(sql(`select count(*) from kinnso_internal.trip_share_receipts where owner_id='${actor}' and request_id='${original.requestId}';`)).toBe('1');expect(sql(`select count(*) from kinnso_internal.trip_shares where owner_id='${actor}';`)).toBe('1');
  const sessions=Number(sql(`select count(*) from auth.sessions where user_id='${actor}';`));
  const second=await browser.newContext({viewport:{width:320,height:780}});contexts.push(second);const device=await second.newPage();await login(device,locale,email,password,trip);expect(Number(sql(`select count(*) from auth.sessions where user_id='${actor}';`))).toBeGreaterThan(sessions);
  expect(await device.evaluate(()=>window.sessionStorage.length)).toBe(0);await device.addStyleTag({content:'html { font-size:32px !important; }'});expect(await device.evaluate(()=>getComputedStyle(document.documentElement).fontSize)).toBe('32px');
  const recover=device.getByRole('button',{name:l.recover});await expect(recover).toHaveCount(1);await expect(recover).toBeEnabled();await recover.focus();await device.keyboard.press('Enter');await expect(device.getByLabel(l.field,{exact:true})).toHaveValue(saved.url);
  const anonymous=await browser.newContext();contexts.push(anonymous);const viewer=await anonymous.newPage();const shown=await viewer.goto(saved.url);expect(shown?.status()).toBe(200);await expect(viewer.getByText('Selected durable place',{exact:true})).toBeVisible();await expect(viewer.getByText('PRIVATE_DURABLE_SHARE_NOTE')).toHaveCount(0);expect((await viewer.request.get('/api/shares/receipts?tripId='+trip+'&requestId='+original.requestId)).status()).toBe(401);
  const revoke=device.getByRole('button',{name:l.revoke,exact:true});await expect(revoke).toHaveCount(1);await expect(revoke).toBeEnabled();await revoke.focus();await device.keyboard.press('Enter');await expect.poll(async()=>(await viewer.request.get(saved.url)).status()).toBe(404);
  const terminal=await device.request.get('/api/shares/receipts?tripId='+trip+'&requestId='+original.requestId);expect(terminal.status()).toBe(200);const ended=(await terminal.json()).data;expect(ended.state).toBe('revoked');expect(ended.url).toBeNull();
  expect(await device.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }finally{for(const c of contexts)await c.close();for(const id of ids){expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();expect(sql(`select count(*) from kinnso_internal.trip_share_receipts where owner_id='${id}';`)).toBe('0');}}
});
