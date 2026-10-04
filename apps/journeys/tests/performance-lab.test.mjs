import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessLab, compareLab, localOrigin} from '../scripts/performance/report.mjs';

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
  const baseline = {conditions: {cpu: 4}, samples: complete(), notComparable: ['guide', 'trip']};
  const compared = compareLab(current, baseline);
  assert.equal(compared.status, 'PARTIAL');
  assert.equal(compared.groups.filter(g => g.status === 'COMPARABLE').length, 4);
  assert.equal(compared.groups.filter(g => g.status === 'NOT_COMPARABLE').length, 4);
  assert.equal(compareLab(current, {...baseline, conditions: {cpu: 1}}).status, 'NOT_COMPARABLE');
});
test('lab runner accepts only a loopback HTTP origin without credentials or a path', () => {
  assert.equal(localOrigin('http://127.0.0.1:3521'), 'http://127.0.0.1:3521');
  for (const value of ['https://kinnso-os.vercel.app', 'http://localhost:3521', 'http://user:pass@127.0.0.1:3521', 'http://127.0.0.1:3521/en', 'http://127.0.0.1:3521?x=1'])
    assert.throws(() => localOrigin(value), /loopback/);
});
