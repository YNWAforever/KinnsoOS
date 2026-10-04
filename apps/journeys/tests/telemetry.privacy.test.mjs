import test from 'node:test';
import assert from 'node:assert/strict';
const events=await import('../lib/telemetry/events.ts').catch(()=>({}));
const perf=await import('../lib/telemetry/performance.ts').catch(()=>({}));
const alerts=await import('../lib/telemetry/alerts.ts').catch(()=>({}));
const repository=await import('../lib/telemetry/repository.ts').catch(()=>({}));
const cron=await import('../lib/telemetry/cron-auth.ts').catch(()=>({}));
const {recentVerifiedOutcome}=await import('../lib/telemetry/outcomes.ts');
const id='22222222-2222-4222-8222-222222222222';
const base={name:'trip_created',mode:'connected',context:'traveller',consent:'accepted',requestId:id};

test('consent, real mode and fixed schema reject private data before any ingestion',()=>{
 assert.equal(typeof events.parseEvent,'function');
 assert.deepEqual(events.parseEvent(base),base);
 for(const patch of [{consent:'denied'},{mode:'demo'},{context:'admin'},{context:'synthetic'},{name:'free text'},{note:'private'},{email:'user@example.test'},{shareToken:id},{actorPseudonym:'raw-user-id'}])assert.equal(events.parseEvent({...base,...patch}),null);
});
test('versioned legacy consent storage is reused and identifiers expire',()=>{
 assert.equal(typeof events.readConsent,'function');
 const storage=new Map([['kinnso.analytics.consent.v1','accepted'],['kinnso.analytics.journey.v1',id],['kinnso.analytics.consent-version.v1','v1:2000']]);
 assert.deepEqual(events.readConsent({getItem:k=>storage.get(k)??null},1000),{consent:'accepted',anonymousSessionId:id});
 assert.equal(events.readConsent({getItem:k=>storage.get(k)??null},2000).consent,'denied');
 assert.equal(events.readConsent({getItem:()=>{throw Error('disabled')}},1000).consent,'denied');
});
test('latency reports preserve unknown and insufficient samples; legitimate zero is measured',()=>{
 assert.equal(typeof perf.summarizeSamples,'function');
 assert.deepEqual(perf.summarizeSamples([],3),{status:'unknown',count:0,p75:null});
 assert.deepEqual(perf.summarizeSamples([0],3),{status:'insufficient',count:1,p75:null});
 assert.deepEqual(perf.summarizeSamples([0,10,20,30],3),{status:'measured',count:4,p75:20});
 assert.equal(perf.parseSample({metric:'LCP',value:10,url:'private'}),null);
 assert.equal(perf.parseSample({metric:'query',value:-1}),null);
 assert.deepEqual(perf.parseSample({metric:'request',value:0}),{metric:'request',value:0});
});
test('injected scheduled failure alerts carry owner/runbook and never overwrite last success',()=>{
 assert.equal(typeof alerts.scheduledHealth,'function');
 const known={job:'media_cleanup',owner:'platform_operations',runbook:'/docs/implementation/METRICS_AND_ALERTS.md#scheduled-jobs',lastSuccessAt:'2026-10-01T00:00:00Z',lastAttemptAt:'2026-10-02T00:00:00Z',lastStatus:'failed'};
 assert.deepEqual(alerts.scheduledHealth(known,Date.parse('2026-10-02T00:00:00Z'),86400000),{...known,state:'failed',alert:true});
 assert.equal(alerts.scheduledHealth({...known,lastSuccessAt:null,lastAttemptAt:null,lastStatus:null},0,1000).state,'unknown');
});

test('measured failing queries retain original failure and sink failure is isolated',async()=>{
 assert.equal(typeof perf.measure,'function');
 let recorded;
 const cause=Error('query_failed');let tick=0;
 await assert.rejects(()=>perf.measure('query',async()=>{throw cause},async sample=>{recorded=sample;throw Error('sink_failed')},()=>tick++*10),error=>error===cause);
 assert.deepEqual(recorded,{metric:'query',value:10});
});

test('rejected browser field samples cause no transport and job recording cannot mask original failure',async()=>{
 let calls=0;
 const service={rpc:async()=>{calls++;return{data:null,error:Error('offline')}}};
 assert.deepEqual(await repository.recordPerformance(service,id,{metric:'LCP',value:10},{mode:'connected',context:'traveller',consent:'denied'}),{accepted:false});
 assert.deepEqual(await repository.recordEvent(service,null,{...base,shareToken:id}),{accepted:false});
 assert.equal(calls,0);
 const cause=Error('job_failed');
 await assert.rejects(()=>repository.trackScheduled(service,'media_cleanup',async()=>{throw cause}),error=>error===cause);
});

test('scheduler accepts only the exact authorized origin and health outage cannot reverse real completion',async()=>{
 const secret='synthetic-scheduler-credential-32-characters';
 const env={CRON_SECRET:secret,KINNSO_SITE_URL:'https://journeys.example'};
 const request=url=>new Request(url,{headers:{authorization:'Bearer '+secret}});
 assert.equal(cron.cronAuthorized(request('https://journeys.example/api/cron/telemetry-retention'),env),true);
 assert.equal(cron.cronAuthorized(request('https://attacker.example/api/cron/telemetry-retention'),env),false);
 assert.equal(cron.cronAuthorized(request('https://journeys.example/api/cron/telemetry-retention'),{...env,CRON_SECRET:'short'}),false);
 assert.equal(cron.cronAuthorized(new Request('https://journeys.example/api/cron/media-cleanup'),env),false);
 let completed=0;const offline={rpc:async()=>({error:Error('unavailable'),data:null})};
 assert.equal(await repository.trackScheduled(offline,'media_cleanup',async()=>++completed),1);
 assert.equal(completed,1);
});
test('old, future and unproven inbox entries cannot recount verified outcomes after receipt retention',()=>{
 const now=Date.parse('2026-10-04T00:00:00Z');
 assert.equal(recentVerifiedOutcome({type:'submission.approved',createdAt:'2026-10-03T00:00:00Z'},now),true);
 for(const event of [{type:'submission.approved',createdAt:'2026-09-27T00:00:00Z'},{type:'settlement.created',createdAt:'2026-10-05T00:00:00Z'},{type:'submission.rejected',createdAt:'2026-10-03T00:00:00Z'},{type:'submission.approved',createdAt:'invalid'}])assert.equal(recentVerifiedOutcome(event,now),false);
});
