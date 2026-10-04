import {test,expect} from '@playwright/test';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const owned:string[]=[];
async function actor(){
 const email=`synthetic-ssr-${randomUUID()}@example.test`,password=`Ssr!${randomUUID()}`;
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();owned.push(created.data.user!.id);
 const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
 expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();return{email,password,client};
}
test.afterAll(async()=>{for(const id of owned)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()});
test('private trip heading is present in owner HTML, absent for another actor and anonymous HTML',async({page,browser})=>{
 test.setTimeout(120000);const owner=await actor(),other=await actor(),title='Synthetic private SSR '+randomUUID(),note='Synthetic private note '+randomUUID();
 let result=await owner.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title,timezone:'UTC'}});expect(result.error).toBeNull();let trip=result.data;
 const dayId=randomUUID();result=await owner.client.rpc('apply_trip_command',{p_trip_id:trip.id,p_expected_revision:trip.revision,p_request_id:randomUUID(),p_command:{type:'addDay',id:dayId,offset:0,title:'Synthetic day'}});expect(result.error).toBeNull();trip=result.data;
 result=await owner.client.rpc('apply_trip_command',{p_trip_id:trip.id,p_expected_revision:trip.revision,p_request_id:randomUUID(),p_command:{type:'addStop',id:randomUUID(),dayId,position:0,input:{title:'Synthetic stop',placeId:null,travellerNote:note,startMinuteOfDay:null,durationMinutes:null}}});expect(result.error).toBeNull();
 const route='/en/trips/'+trip.id;
 await page.goto('/en/sign-in?next='+encodeURIComponent(route));await page.getByLabel('Email').fill(owner.email);await page.getByLabel('Password').fill(owner.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**'+route);
 const response=await page.request.get(route),html=await response.text();expect(response.status()).toBe(200);expect(html).toContain(title);expect(html).not.toContain(note);expect(response.headers()['cache-control']).toContain('private');
 const otherContext=await browser.newContext(),otherPage=await otherContext.newPage();
 try{
  await otherPage.goto('/en/sign-in?next='+encodeURIComponent(route));await otherPage.getByLabel('Email').fill(other.email);await otherPage.getByLabel('Password').fill(other.password);await otherPage.getByRole('button',{name:'Sign in',exact:true}).click();await otherPage.waitForURL('**'+route);
  const foreign=await otherPage.request.get(route);expect(await foreign.text()).not.toContain(title);
 }finally{await otherContext.close()}
 const anonymous=await browser.newContext();try{expect(await (await anonymous.request.get('http://127.0.0.1:3495'+route)).text()).not.toContain(title)}finally{await anonymous.close()}
});
