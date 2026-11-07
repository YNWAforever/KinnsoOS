import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPilotCleanup } from '../scripts/pilot-cleanup.mjs';

test('retry a failed child and parent while still attempting every Auth user', async () => {
  const rows = new Set(['child', 'parent', 'auth1', 'auth2', 'unrelated']);
  const calls = [];
  const step = (label, blocked) => ({ label, run() {
    calls.push(label);
    if (blocked()) throw Error('injected');
    rows.delete(label);
  } });
  await runPilotCleanup([
    step('child', () => calls.filter(x => x === 'child').length === 1),
    step('parent', () => rows.has('child')),
    step('auth1', () => calls.filter(x => x === 'auth1').length === 1),
    step('auth2', () => false),
  ], [{ label: 'exact', run() { assert.deepEqual([...rows], ['unrelated']); } }]);
  assert.deepEqual(calls, ['child', 'parent', 'auth1', 'auth2', 'child', 'parent', 'auth1']);
});

test('persistent SQL and Auth failures still allow independent deletion and final readback', async () => {
  const calls = [];
  const fail = label => ({ label, run() { calls.push(label); throw Error('injected'); } });
  await assert.rejects(runPilotCleanup([fail('sql'), fail('auth1'), { label: 'auth2', run() { calls.push('auth2'); } }],
    [fail('check1'), { label: 'check2', run() { calls.push('check2'); } }], 2), /sql, auth1, residue: check1/);
  assert.deepEqual(calls, ['sql', 'auth1', 'auth2', 'sql', 'auth1', 'check1', 'check2']);
});
