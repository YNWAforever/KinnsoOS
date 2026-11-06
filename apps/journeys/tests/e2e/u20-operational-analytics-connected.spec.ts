import {test,expect} from '@playwright/test';
import {randomInt,randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');
verifyTestTarget();
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});

test.skip(process.env.ANALYTICS_INGEST_MODE!=='production','requires the explicit connected analytics test mode');
test('U20 analytics ingestion persists one consented event and deduplicates retries',async({request,baseURL},testInfo)=>{
 const journeyId=randomUUID(),clientEventId=randomUUID();
 const ip=`10.${randomInt(1,255)}.${randomInt(1,255)}.${randomInt(1,255)}`;
 const payload={clientEventId,journeyId,consentVersion:'v1',event:'journey_started',occurredAt:new Date().toISOString(),locale:'en',routeKey:'journey'};
 try{
  for(let attempt=0;attempt<2;attempt++){
   const response=await request.post('/api/analytics',{headers:{origin:baseURL!,'content-type':'application/json','x-vercel-forwarded-for':ip},data:payload});
   expect(response.status()).toBe(202);expect(await response.json()).toEqual({accepted:true});
  }
  const rows=(await admin.from('traveller_analytics_events').select('id,client_event_id,journey_id,event_name,locale,authenticated,account_id').eq('journey_id',journeyId)).data??[];
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({client_event_id:clientEventId,journey_id:journeyId,event_name:'journey_started',locale:'en',authenticated:false,account_id:null});
  await testInfo.attach('analytics-ingestion',{body:JSON.stringify({journeyId,count:rows.length,productionChanged:false}),contentType:'application/json'});
 }finally{
  const cleanup=await admin.from('traveller_analytics_events').delete().eq('journey_id',journeyId);expect(cleanup.error).toBeNull();
  const journeyCleanup=await admin.from('traveller_analytics_rate_limits').delete().eq('journey_id',journeyId);expect(journeyCleanup.error).toBeNull();
  const ipCleanup=await admin.from('traveller_analytics_ip_rate_limits').delete().eq('ip',ip);expect(ipCleanup.error).toBeNull();
 }
});
