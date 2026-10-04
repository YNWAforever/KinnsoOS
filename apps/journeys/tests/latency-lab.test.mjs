import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as lab from '../scripts/performance/report.mjs';

function complete() {
  return {cleanup: 'PASS_OWNED_SYNTHETIC_ACTORS_REMOVED', error: null,
    dataset: {guides: 2401, observedRowCap: 1000, tripDays: 1, tripStops: 1},
    samples: ['api', 'postgrest', 'postgres'].flatMap(layer =>
      ['home', 'explore', 'guide', 'trip'].flatMap(operation =>
        Array.from({length: 40}, (_, i) => ({layer, operation, run: i+1,
          status: 'PASS', verified: true, durationMs: i+1}))))};
}
const budgets = {api: 500, postgrest: 250, postgres: 50};
test('latency summaries retain the nearest-rank tail instead of reporting a mean', () => {
  assert.equal(typeof lab.assessLatency, 'function');
  const result = lab.assessLatency(complete(), budgets);
  assert.equal(result.status, 'PASS');
  assert.equal(result.groups.length, 12);
  assert.equal(result.groups[0].p95Ms, 38);
  assert.equal(result.groups[0].medianMs, 20.5);
});
test('latency baseline collection does not invent an accepted budget', () => {
  assert.equal(typeof lab.assessLatency, 'function');
  const result = lab.assessLatency(complete());
  assert.equal(result.status, 'MEASURED_BUDGET_NOT_SET');
  assert.equal(result.groups[0].p95Ms, 38);
});
test('missing, repeated, failed or unverified reads cannot pass a latency gate', () => {
  assert.equal(typeof lab.assessLatency, 'function');
  for (const patch of [{run: 2}, {status: 'FAIL'}, {verified: false}, {durationMs: NaN}, {durationMs: -1}]) {
    const report = complete(); Object.assign(report.samples[0], patch);
    assert.equal(lab.assessLatency(report, budgets).status, 'INCOMPLETE');
  }
  const report = complete(); report.samples.pop();
  assert.equal(lab.assessLatency(report, budgets).status, 'INCOMPLETE');
});
test('a slow tail is retained as a measured failure and cleanup remains required', () => {
  assert.equal(typeof lab.assessLatency, 'function');
  const report = complete();
  for (const sample of report.samples.filter(s => s.layer === 'api' && s.operation === 'trip')) sample.durationMs = 501;
  const result = lab.assessLatency(report, budgets);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.groups.find(g => g.layer === 'api' && g.operation === 'trip').p95Ms, 501);
  assert.equal(lab.assessLatency({...report, cleanup: 'PENDING'}, budgets).status, 'INCOMPLETE');
});
test('scale evidence and every numeric layer budget are required', () => {
  assert.equal(typeof lab.assessLatency, 'function');
  for (const dataset of [{guides: 1999, observedRowCap: 1000}, {guides: 2401, observedRowCap: 0}])
    assert.equal(lab.assessLatency({...complete(), dataset}, budgets).status, 'INCOMPLETE');
  for (const budget of [{api: 500}, {...budgets, postgres: NaN}, {...budgets, api: -1}])
    assert.equal(lab.assessLatency(complete(), budget).status, 'INCOMPLETE');
});
