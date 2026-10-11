import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import * as lab from '../scripts/performance/report.mjs';
const origin='http://127.0.0.1:3521';
const source=await readFile(new URL('../scripts/performance/run.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function navigation('),end=source.indexOf('async function interaction(',start);
const result={lhr:{finalDisplayedUrl:origin+'/en/merchant',audits:{'network-requests':{details:{items:[{resourceType:'Document',url:origin+'/en/merchant',statusCode:200}]}},'largest-contentful-paint':{numericValue:2000},'cumulative-layout-shift':{numericValue:0.01},'total-blocking-time':{numericValue:10}}},artifacts:{Trace:{traceEvents:[]}}};
const frame=url=>({url:()=>url,parentFrame:()=>null});
function actual(lighthouse){
 const page=new EventEmitter(),samples=[],report={samples},saved=[];
 page.url=()=>origin+'/en/merchant?company=11111111-1111-4111-8111-111111111111&secret=FIXTURE_SECRET';
 const run=new Function('lighthouse','origin','flags','operationRole','samples','path','out','report','retainNavigation','writeFile','ready','traceWithoutArguments','withCollectionDeadline','observeNavigation','prepareOwnedBlankReset',source.slice(start,end)+'return navigation')(
  async(_url,_flags,_config,measuredPage)=>lighthouse(measuredPage),origin,{maxWaitForLoad:45000},()=> 'merchant_owner',samples,{join:(...p)=>p.join('/')},'/owned',report,lab.retainNavigation,async(file,value)=>saved.push({file,data:JSON.parse(value)}),async()=>{},x=>x,lab.withCollectionDeadline,lab.observeNavigation,lab.prepareOwnedBlankReset);
 return {page,samples,saved,run};
}
test('actual collector releases only the owned beforeunload blocking its initial blank reset',async()=>{
 let accepted=0;
 const h=actual(page=>new Promise(resolve=>page.emit('dialog',{type:()=> 'beforeunload',message:()=>{throw Error('must not inspect private dialog text');},accept:async()=>{accepted++;page.emit('framenavigated',frame('about:blank'));resolve(result);}})));
 await assert.doesNotReject(h.run(h.page,'merchantReview','/en/merchant','warm',1,25),'beforeunload currently blocks the real pre-navigation boundary');
 assert.equal(accepted,1);assert.equal(h.samples[0].verified,true);assert.equal(h.samples[0].lcpMs,2000);
 assert.equal(h.samples[0].blankResetDiagnostics.beforeUnloadDialogs,1);
 assert.equal(h.samples[0].blankResetDiagnostics.acceptedBeforeUnloadDialogs,1);
 assert.equal(h.samples[0].blankResetDiagnostics.handlingFailures,0);
 assert.doesNotMatch(JSON.stringify(h.samples),/FIXTURE_SECRET|secret=|11111111/);
 for(const event of ['dialog','framenavigated'])assert.equal(h.page.listenerCount(event),0);
});
test('unexpected dialogs and foreign beforeunload remain unaccepted and failed samples stay immutable',async()=>{
 for(const [type,current] of [['confirm',origin+'/en/merchant'],['prompt',origin+'/en/merchant'],['beforeunload','https://foreign.invalid/private']]){
  let accepted=0,dismissed=0;
  const h=actual(page=>{page.emit('dialog',{type:()=>type,accept:async()=>{accepted++;},dismiss:async()=>{dismissed++;},message:()=> 'PRIVATE_MESSAGE_SECRET'});return new Promise(()=>{});});
  h.page.url=()=>current;
  await assert.rejects(h.run(h.page,'merchantReview','/en/merchant','warm',1,1),/timed out/);
  assert.equal(accepted,0);assert.equal(dismissed,0,'no unrelated confirmation policy may be introduced');
  assert.equal(h.samples[0].blankResetDiagnostics?.unhandledDialogs,1,'must retain safe evidence of the unresolved phase');
  assert.equal(h.samples[0].verified,false);assert.equal(h.samples[0].lcpMs,null);
  const retained=JSON.stringify(h.samples[0]);h.page.emit('dialog',{type:()=> 'beforeunload',accept:async()=>{accepted++;}});
  assert.equal(JSON.stringify(h.samples[0]),retained);assert.equal(accepted,0);
  assert.doesNotMatch(retained,/PRIVATE_MESSAGE_SECRET|foreign\.invalid/);
  for(const event of ['dialog','framenavigated'])assert.equal(h.page.listenerCount(event),0);
 }
});
test('initial blank completion detaches the fixture handler before Lighthouse owns later dialogs',async()=>{
 let early=0,late=0;
 const h=actual(async page=>{
  page.emit('dialog',{type:()=> 'beforeunload',accept:async()=>{early++;}});
  await Promise.resolve();
  page.emit('framenavigated',frame('about:blank'));
  assert.equal(page.listenerCount('dialog'),0,'Lighthouse handles dialogs after its initial blank reset');
  page.emit('dialog',{type:()=> 'beforeunload',accept:async()=>{late++;},message:()=> 'PRIVATE_MESSAGE_SECRET'});
  return result;
 });
 await h.run(h.page,'merchantReview','/en/merchant','warm',1,25);
 assert.equal(early,1);assert.equal(late,0);assert.equal(h.samples[0].blankResetDiagnostics.beforeUnloadDialogs,1);
 assert.equal(h.samples[0].blankResetDiagnostics.blankCompleted,true);
});
test('stopping the reset observation prevents an acceptance still queued at the event boundary',async()=>{
 const page=new EventEmitter();page.url=()=>origin+'/en/merchant';let accepted=0;
 const reset=lab.prepareOwnedBlankReset(page,origin);
 page.emit('dialog',{type:()=> 'beforeunload',accept:async()=>{accepted++;}});
 const retained=reset.stop();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(accepted,0,'a stopped collection must not start a new dialog action');
 assert.equal(retained.acceptedBeforeUnloadDialogs,0);assert.deepEqual(reset.stop(),retained);
 for(const event of ['dialog','framenavigated'])assert.equal(page.listenerCount(event),0);
});
