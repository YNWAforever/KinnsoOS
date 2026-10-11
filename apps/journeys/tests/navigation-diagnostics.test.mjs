import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import * as lab from '../scripts/performance/report.mjs';
const origin='http://127.0.0.1:3521';
const request=(url,type='fetch')=>({url:()=>url,resourceType:()=>type});
test('navigation diagnostics retain owned lifecycle counts and pending paths without query or credential data',()=>{
 assert.equal(typeof lab.observeNavigation,'function','missing collection-stage diagnostics');
 const page=new EventEmitter();let now=0;
 const observation=lab.observeNavigation(page,origin,()=>now);
 const privateRequest=request(origin+'/api/creator/missions/00000000-0000-4000-8000-000000000001?token=SECRET'),other=request('https://external.invalid/private?secret=SECRET'),done=request(origin+'/api/catalog');
 page.emit('request',privateRequest);page.emit('request',other);page.emit('request',done);page.emit('requestfinished',done);page.emit('domcontentloaded');page.emit('load');now=60000;
 const snapshot=observation.stop();
 assert.equal(snapshot.elapsedMs,60000);assert.equal(snapshot.startedRequests,2);assert.equal(snapshot.finishedRequests,1);assert.equal(snapshot.domContentLoaded,1);assert.equal(snapshot.load,1);
 assert.deepEqual(snapshot.pendingRequests,[{path:'/api/creator/missions/OWNED_ID',type:'fetch',elapsedMs:60000}]);assert.equal(snapshot.ignoredExternalRequests,1);
 assert.doesNotMatch(JSON.stringify(snapshot),/SECRET|external\.invalid|000000000001|token=/);
 for(const event of ['request','requestfinished','requestfailed','domcontentloaded','load'])assert.equal(page.listenerCount(event),0);
 page.emit('requestfinished',privateRequest);now=70000;assert.deepEqual(observation.stop(),snapshot,'late events cannot alter retained timeout diagnostics');
});
test('the actual stalled navigation saves immutable stage diagnostics before later independent calls',async()=>{
 const source=await readFile(new URL('../scripts/performance/run.mjs',import.meta.url),'utf8'),start=source.indexOf('async function navigation('),end=source.indexOf('async function interaction(',start),page=new EventEmitter(),samples=[],report={samples},saved=[];
 const pending=request(origin+'/api/merchant/campaigns?private=SECRET');
 const run=new Function('lighthouse','origin','flags','operationRole','samples','path','out','report','retainNavigation','writeFile','ready','traceWithoutArguments','withCollectionDeadline','observeNavigation',source.slice(start,end)+'return navigation')(
  async()=>{page.emit('request',pending);page.emit('domcontentloaded');await new Promise(resolve=>setTimeout(resolve,25));page.emit('requestfinished',pending);return{};},origin,{maxWaitForLoad:45000},()=> 'merchant_owner',samples,{join:(...p)=>p.join('/')},'/owned',report,lab.retainNavigation,async(file,value)=>saved.push({file,data:JSON.parse(value)}),async()=>{},x=>x,lab.withCollectionDeadline,lab.observeNavigation);
 await assert.rejects(run(page,'merchantReview','/en/merchant/campaigns','warm',1,1),/timed out/);
 assert.equal(samples[0].verified,false);assert.equal(samples[0].lcpMs,null);
 assert.equal(saved.at(-1).data.samples[0].collectorDiagnostics?.pendingRequests?.[0]?.path,'/api/merchant/campaigns');
 const retained=JSON.stringify(samples[0]);await new Promise(resolve=>setTimeout(resolve,35));assert.equal(JSON.stringify(samples[0]),retained);
 for(const event of ['request','requestfinished','requestfailed','domcontentloaded','load'])assert.equal(page.listenerCount(event),0);
});
test('unexpected owned paths cannot export an invitation or redemption secret',()=>{
 const page=new EventEmitter(),observation=lab.observeNavigation(page,origin,()=>0);
 page.emit('request',request(origin+'/api/redemptions/SECRET-CODE'));
 page.emit('request',request(origin+'/private/SECRET-FILENAME'));
 page.emit('request',request(origin+'/_next/static/chunks/app-123.js?secret=SECRET'));
 const snapshot=observation.stop();
 assert.deepEqual(snapshot.pendingRequests.map(r=>r.path),['OTHER_OWNED_REQUEST','OTHER_OWNED_REQUEST','/_next/ASSET']);
 assert.doesNotMatch(JSON.stringify(snapshot),/SECRET|FILENAME/);
});
test('large pending request sets retain a bounded diagnostic with truthful truncation',()=>{
 const page=new EventEmitter(),observation=lab.observeNavigation(page,origin,()=>0);
 for(let i=0;i<300;i++)page.emit('request',request(origin+'/api/catalog?page='+i));
 const snapshot=observation.stop();assert.equal(snapshot.startedRequests,300);assert.equal(snapshot.pendingRequestCount,300);assert.equal(snapshot.pendingRequests.length,10);assert.equal(snapshot.pendingRequestsTruncated,true);
});
test('pre-existing request completions cannot hide network work started during this navigation',()=>{
 const page=new EventEmitter(),previous=request(origin+'/api/catalog'),failedPrevious=request(origin+'/api/merchant/campaigns');
 page.emit('request',previous);page.emit('request',failedPrevious);
 const observation=lab.observeNavigation(page,origin,()=>0),current=request(origin+'/api/merchant/campaigns');
 page.emit('request',current);page.emit('requestfinished',previous);page.emit('requestfailed',failedPrevious);
 const snapshot=observation.stop();assert.equal(snapshot.pendingRequestCount,1);assert.equal(snapshot.finishedRequests,0);assert.equal(snapshot.failedRequests,0);assert.equal(snapshot.pendingRequests.length,1);
});
test('requests beyond the retained-detail cap still contribute correct terminal counts and truncation',()=>{
 const page=new EventEmitter(),observation=lab.observeNavigation(page,origin,()=>0),requests=Array.from({length:300},()=>request(origin+'/api/catalog'));
 for(const r of requests)page.emit('request',r);
 for(const r of requests.slice(0,299))page.emit('requestfinished',r);
 page.emit('requestfailed',requests[0]); // A second terminal event must not decrement twice.
 const snapshot=observation.stop();assert.equal(snapshot.pendingRequestCount,1);assert.equal(snapshot.finishedRequests,299);assert.equal(snapshot.failedRequests,0);assert.equal(snapshot.pendingRequests.length,0);assert.equal(snapshot.pendingRequestsTruncated,true);
});
