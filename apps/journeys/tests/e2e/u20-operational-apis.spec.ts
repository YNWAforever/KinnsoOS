import {test,expect} from '@playwright/test';

test('U20 operational compatibility APIs have explicit safe method contracts',async({request,baseURL})=>{
 let response=await request.get('/api/health');
 expect(response.status()).toBe(200);expect(await response.json()).toEqual({ok:true,db:'up'});

 response=await request.get('/api/admin/analytics');
 expect(response.status()).toBe(401);

 response=await request.post('/api/analytics',{headers:{origin:baseURL!, 'content-type':'application/json'},data:{routeKey:'home'}});
 expect(response.status()).toBe(400);

 response=await request.post('/api/analytics',{headers:{origin:'https://foreign.test','content-type':'application/json'},data:{routeKey:'journey'}});
 expect(response.status()).toBe(403);

 response=await request.post('/api/analytics',{headers:{origin:baseURL!, 'content-type':'application/json'},data:{clientEventId:'11111111-1111-4111-8111-111111111111',journeyId:'22222222-2222-4222-8222-222222222222',consentVersion:'v1',event:'journey_started',occurredAt:new Date().toISOString(),locale:'en',routeKey:'journey'}});
 expect(response.status()).toBe(202);expect(await response.json()).toEqual({accepted:true});

 response=await request.get('/api/cron/traveller-analytics-retention');
 expect(response.status()).toBe(401);expect(await response.json()).toEqual({ok:false,error:'unauthorized'});

 response=await request.post('/api/revalidate',{data:{path:'/en/articles'}});
 expect(response.status()).toBe(401);expect(await response.json()).toEqual({ok:false,error:'unauthorized'});

 response=await request.get('/api/analytics');
 expect(response.status()).toBe(405);
 response=await request.post('/api/admin/analytics');
 expect(response.status()).toBe(405);
});
