import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessLab, compareLab, localOrigin} from '../scripts/performance/report.mjs';
import * as lab from '../scripts/performance/report.mjs';

function complete() {
  return ['home', 'explore', 'guide', 'trip'].flatMap(page =>
    ['cold', 'warm'].flatMap(cache => [1, 2, 3].map(run => ({
      page, cache, run, status: 200, verified: true,
      lcpMs: 2000 + run, cls: 0.01, tbtMs: 60,
      jsTransferBytes: 150000, imageTransferBytes: 0,
    }))));
}
test('all four pages require three distinct cold and warm measurements', () => {
  assert.equal(assessLab(complete()).status, 'PASS');
  assert.equal(assessLab(complete().slice(1)).status, 'INCOMPLETE');
  const repeated = complete(); repeated[1].run = 1;
  assert.equal(assessLab(repeated).status, 'INCOMPLETE');
});
test('redirects, missing metrics and unverified screens cannot become a pass', () => {
  for (const patch of [{status: 500}, {verified: false}, {lcpMs: null}, {cls: NaN}, {tbtMs: -1}, {jsTransferBytes: undefined}]) {
    const samples = complete(); Object.assign(samples[0], patch);
    assert.equal(assessLab(samples).status, 'INCOMPLETE');
  }
});
test('target failures retain their measurements and honest median result', () => {
  const samples = complete();
  for (const sample of samples.filter(s => s.page === 'trip' && s.cache === 'cold')) sample.lcpMs = 3100;
  const report = assessLab(samples);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.groups.find(g => g.page === 'trip' && g.cache === 'cold').lcpMs, 3100);
  assert.equal(report.groups.find(g => g.page === 'home' && g.cache === 'cold').lcpMs, 2002);
});
test('comparison requires the same measured conditions and records functional limitations', () => {
  const current = {conditions: {cpu: 4}, samples: complete()};
  const baseline = {kind:'foundation',sourceSha:'f181cff22d28a480120c2abaa2dde91c573582bf',conditions: {cpu: 4}, samples: complete(), notComparable: ['guide', 'trip']};
  const compared = compareLab(current, baseline);
  assert.equal(compared.status, 'PARTIAL');
  assert.equal(compared.groups.filter(g => g.status === 'COMPARABLE').length, 4);
  assert.equal(compared.groups.filter(g => g.status === 'NOT_COMPARABLE').length, 4);
  assert.equal(compareLab(current, {...baseline, conditions: {cpu: 1}}).status, 'NOT_COMPARABLE');
});
test('completed navigation cannot hide failed interactions, queries or cleanup',()=>{
 const completeRun={kind:'current',samples:complete(),interactions:['home','explore','guide','trip'].map(page=>({page,status:'PASS',traceFile:page+'.json'})),
   queryLatency:{status:'MEASURED_LOCAL_BACKEND_ROUNDTRIPS',samples:['home','explore','guide','trip'].flatMap(page=>[1,2,3].map(run=>({page,run,durationMs:10,status:'PASS'})))},
   cleanup:'PASS_OWNED_SYNTHETIC_ACTORS_REMOVED'};
 assert.equal(lab.assessRun(completeRun).status,'PASS');
 for(const patch of [{error:'Trip note did not persist'},{interactions:completeRun.interactions.slice(0,3)},{queryLatency:{status:'NOT_MEASURED'}},{cleanup:'PENDING'}])
   assert.equal(lab.assessRun({...completeRun,...patch}).status,'INCOMPLETE');
});
test('candidate/self-comparison cannot masquerade as the frozen foundation',()=>{
 const candidate={kind:'current',sourceSha:'candidate',conditions:{cpu:4},samples:complete()};
 assert.equal(compareLab(candidate,candidate).status,'NOT_COMPARABLE');
 const foundation={...candidate,kind:'foundation',sourceSha:'f181cff22d28a480120c2abaa2dde91c573582bf',notComparable:[]};
 assert.equal(compareLab(candidate,foundation).groups.filter(g=>g.status==='NOT_COMPARABLE').length,4);
});
test('returned navigation artifacts survive runtime and screen-readiness failures',async()=>{
 for(const runtimeError of [undefined,{code:'NO_FCP',message:'No paint'}]){
  const result={lhr:{runtimeError},artifacts:{Trace:{traceEvents:[]}}},saved=[];
  await assert.rejects(()=>lab.retainNavigation(result,async value=>{saved.push(value)},async()=>{throw Error('Wrong screen')}));
  assert.deepEqual(saved,[result]);
 }
});
test('lab runner accepts only a loopback HTTP origin without credentials or a path', () => {
  assert.equal(localOrigin('http://127.0.0.1:3521'), 'http://127.0.0.1:3521');
  for (const value of ['https://kinnso-os.vercel.app', 'http://localhost:3521', 'http://user:pass@127.0.0.1:3521', 'http://127.0.0.1:3521/en', 'http://127.0.0.1:3521?x=1'])
    assert.throws(() => localOrigin(value), /loopback/);
});
