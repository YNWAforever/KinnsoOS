import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLegacyAnalyticsPayload,parseLegacyAnalyticsRequest,LegacyAnalyticsError} from '../lib/analytics/legacy-events.ts';
import {analyticsWindow,projectAnalyticsReport} from '../lib/operational-api/analytics-report.ts';
import {checkBackendHealth} from '../lib/operational-api/health.ts';
import {secretEqual} from '../lib/security/secrets.ts';

const now=Date.parse('2026-11-06T12:00:00.000Z');
const journey={
 clientEventId:'11111111-1111-4111-8111-111111111111',
 journeyId:'22222222-2222-4222-8222-222222222222',
 consentVersion:'v1',event:'journey_started',occurredAt:new Date(now).toISOString(),locale:'en',routeKey:'journey',
};

test('legacy analytics accepts only the bounded consented v1 taxonomy',()=>{
 assert.deepEqual(parseLegacyAnalyticsPayload(journey,now),journey);
 assert.doesNotThrow(()=>parseLegacyAnalyticsPayload({...journey,event:'offer_claimed',routeKey:'creator_profile',entityType:'offer',entityId:'offer_1'},now));
 for(const invalid of [
  {...journey,actorId:'foreign'},
  {...journey,routeKey:'home'},
  {...journey,occurredAt:'2026-11-06T11:00:00.000Z'},
  {...journey,event:'offer_viewed',routeKey:'guide_detail',entityType:'guide',entityId:'guide_1'},
  {...journey,event:'checkout_started',routeKey:'experience_detail',entityType:'experience',entityId:'exp_1',bookingState:'on',outcome:'error'},
 ])assert.throws(()=>parseLegacyAnalyticsPayload(invalid,now),/invalid_request/);
});

test('legacy analytics rejects oversized HTTP bodies before persistence',async()=>{
 const request=new Request('https://kinnso.test/api/analytics',{method:'POST',body:'x'.repeat(8193)});
 await assert.rejects(()=>parseLegacyAnalyticsRequest(request,now),error=>error instanceof LegacyAnalyticsError&&error.status===413);
});

test('analytics report windows and projections preserve unknown rates and bounded identity',()=>{
 const params=new URLSearchParams({from:'2026-11-05T12:00:00.000Z',to:'2026-11-06T12:00:00.000Z'});
 const window=analyticsWindow(params,new Date(now));
 assert.deepEqual(window,{from:'2026-11-05T12:00:00.000Z',to:'2026-11-06T12:00:00.000Z'});
 assert.equal(analyticsWindow(new URLSearchParams(),new Date(now)).from,'2026-10-30T12:00:00.000Z');
 assert.equal(analyticsWindow(new URLSearchParams('from=bad'),new Date(now)),null);
 assert.equal(analyticsWindow(new URLSearchParams('view=creator'),new Date(now)),null);
 const report=projectAnalyticsReport([{metric_key:'m',locale:'en',entity_type:null,booking_state:'off',numerator:3,denominator:4,rate:null,sample_count:4,status:'insufficient',attribution_window_days:7,private:'do not expose'}],window);
 assert.equal(report.rows[0].rate,null);assert.equal('private' in report.rows[0],false);
});

test('health and API secrets fail closed without leaking configuration',async()=>{
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
 let requested='';
 assert.equal(await checkBackendHealth(env,async url=>{requested=String(url);return new Response('[]',{status:200});}),true);
 assert.equal(requested,'https://test.supabase.co/rest/v1/articles?select=id&limit=1');
 assert.equal(await checkBackendHealth(env,async()=>new Response('{}',{status:503})),false);
 assert.equal(await checkBackendHealth({},async()=>new Response()),false);
 assert.equal(secretEqual('s3cret','s3cret'),true);assert.equal(secretEqual('S3CRET','s3cret'),false);assert.equal(secretEqual(null,'s3cret'),false);assert.equal(secretEqual('s3cret',undefined),false);
});
