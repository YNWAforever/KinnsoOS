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

const sampleId = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const known = {
  users: ['operator', 'traveller', 'creator', 'merchant'].map((role, index) => ({ role, id: sampleId(index + 1) })),
  runIds: [sampleId(5)], missions: [sampleId(6)], guides: [sampleId(7)],
};
const cases = [
  ['public.trips', ['public.trips'], ['traveller']],
  ['kinnso_internal.pilot_participants', ['kinnso_internal.pilot_participants', 'kinnso_internal.pilot_runs'], ['operator']],
  ['public.mission_participants', ['public.mission_participants', 'public.missions', 'public.merchant_profiles'], ['creator', 'merchant']],
  ['kinnso_internal.support_cases', ['kinnso_internal.support_cases'], ['traveller']],
  ['public.merchant_profiles', ['public.merchant_profiles'], ['merchant']],
];

for (const [failedTable, parents, blockedRoles] of cases) {
  test('capture outage preserves recovery paths for ' + failedTable, async () => {
    const { cleanupPilotFixture } = await import('../scripts/pilot-cleanup.mjs');
    const journals = [], deleted = new Set(), auth = new Set(), verified = new Set();
    const unrelated = sampleId(999);
    let failed = true;
    const port = {
      known, save: value => journals.push(structuredClone(value)), verifyTarget() {},
      sql(statement) {
        const [, action, table, where] = /^(select id from|select count\(\*\) from|delete from) ([\w.]+) where (.+)$/.exec(statement);
        assert.ok(!where.includes(unrelated));
        assert.match(where, / = any\(array\[/);
        if (action === 'select id from') {
          if (table === failedTable && failed) throw Error('injected capture outage');
          return sampleId(8);
        }
        if (action === 'select count(*) from') { verified.add(table); return '0'; }
        deleted.add(table);
        return '';
      },
      deleteUser(id) { assert.notEqual(id, unrelated); auth.add(id); },
    };
    await assert.rejects(cleanupPilotFixture(port), /uncaptured/);
    assert.deepEqual(journals[0], known);
    assert.equal(journals[1].captures.find(row => row.table === failedTable).status, 'failed');
    for (const parent of parents) assert.ok(!deleted.has(parent), parent + ' retained');
    for (const { id, role } of known.users) assert.equal(auth.has(id), !blockedRoles.includes(role), role);
    assert.ok(deleted.has('public.guide_saves'), 'independent SQL continued');
    assert.ok(verified.has('public.guide_saves'), 'independent readback continued');
    failed = false;
    await cleanupPilotFixture(port);
    for (const parent of parents) assert.ok(deleted.has(parent), parent + ' cleaned after recapture');
    assert.equal(auth.size, known.users.length);
  });
}

test('target verification outage leaves known IDs and performs no SQL or Auth work', async () => {
  const { cleanupPilotFixture } = await import('../scripts/pilot-cleanup.mjs');
  const calls = [];
  await assert.rejects(cleanupPilotFixture({
    known, save(value) { calls.push(value); }, verifyTarget() { calls.push('guard'); throw Error('target offline'); },
    sql() { assert.fail('SQL called'); }, deleteUser() { assert.fail('Auth called'); },
  }), /target offline/);
  assert.deepEqual(calls, [known, 'guard']);
});
