import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
let assess;
try { ({assessSubsetRecovery: assess} = await import('../scripts/subset-recovery-report.mjs')); }
catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
const revision = 'a'.repeat(40);
function example(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kinnso-a0-subset-'));
  const actual = fs.realpathSync(root), parent = fs.realpathSync(os.tmpdir());
  t.after(() => {
    assert.equal(path.dirname(actual).toLowerCase(), parent.toLowerCase());
    assert.ok(path.basename(actual).startsWith('kinnso-a0-subset-'));
    fs.rmSync(actual, {recursive: true});
  });
  const data = Buffer.from('{"ownedRows":["test-only"]}\n');
  fs.writeFileSync(path.join(root, 'subset.json'), data);
  return {root, packet: {version: 1, sourceRevision: revision, scope: 'SYNTHETIC_SUBSET_ONLY',
    target: {kind: 'owned_local', projectRef: 'kinnsoos-rehearsal-012345abcdef', unlinked: true, identityRef: 'private:identity', ownershipRef: 'private:ownership'},
    ownerRef: 'private:primary', backupOwnerRef: 'private:backup',
    serviceObjective: 'NOT_PROMISED', rpoMinutes: null, rtoMinutes: null,
    artifacts: [{path: 'subset.json', kind: 'database_subset', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')}],
    timing: {snapshotAt: '2026-10-24T00:00:00.000Z', faultAt: '2026-10-24T00:00:05.000Z', declaredAt: '2026-10-24T00:00:07.000Z', readbackAt: '2026-10-24T00:00:20.000Z'},
    readback: {status: 'PASS', evidenceRef: 'private:readback'},
  }};
}
function run(x) { assert.equal(typeof assess, 'function', 'subset artifact review must be implemented'); return assess(x.packet, {root: x.root, sourceRevision: revision}); }

test('verified bytes and declared timing produce reviewable preparation, never restore or authority', t => {
  const r = run(example(t));
  assert.equal(r.status, 'REVIEWABLE_NOT_EXECUTABLE');
  assert.equal(r.sourceRevision, revision);
  assert.equal(r.artifactsChecked, 1); assert.equal(r.declaredSubsetRpoMs, 5000); assert.equal(r.declaredSubsetRtoMs, 13000);
  assert.equal(r.measurementLevel, 'DECLARED_TIMING_ARITHMETIC_ONLY');
  assert.equal(r.runtimeStatus, 'NOT_RUN'); assert.equal(r.fullRestoreStatus, 'NOT_RUN');
  assert.equal(r.rpoMinutes, null); assert.equal(r.rtoMinutes, null); assert.deepEqual(r.authorizedActions, []);
});
test('a changed byte fails integrity despite an unchanged manifest', t => {
  const x = example(t); fs.writeFileSync(path.join(x.root, 'subset.json'), 'x'.repeat(x.packet.artifacts[0].bytes));
  const r = run(x); assert.equal(r.status, 'BLOCKED_ARTIFACTS'); assert.equal(r.declaredSubsetRtoMs, null);
});
test('missing snapshot does not become an empty successful restore', t => {
  const x = example(t); x.packet.artifacts[0].path = 'missing.json'; assert.equal(run(x).status, 'BLOCKED_ARTIFACTS');
});
test('wrong declared length cannot conceal truncation', t => {
  const x = example(t); x.packet.artifacts[0].bytes++; assert.equal(run(x).status, 'BLOCKED_ARTIFACTS');
});
test('path traversal is rejected without exposing the external file', t => {
  const x = example(t); x.packet.artifacts[0].path = '../outside-secret';
  const r = run(x); assert.equal(r.status, 'BLOCKED_ARTIFACTS'); assert.ok(!JSON.stringify(r).includes('outside-secret'));
});
test('absolute, Windows and hidden paths cannot select arbitrary inputs', t => {
  for (const value of ['/tmp/secret', 'C:/secret', 'nested\\secret', '.env']) {
    const x = example(t); x.packet.artifacts[0].path = value; assert.equal(run(x).status, 'BLOCKED_ARTIFACTS');
  }
});
test('duplicate artifact aliases are rejected instead of inflating backup coverage', t => {
  const x = example(t); x.packet.artifacts.push({...x.packet.artifacts[0], path: 'SUBSET.json'}); assert.equal(run(x).status, 'BLOCKED_ARTIFACTS');
});
test('an object-only backup does not pretend to contain database rows', t => {
  const x = example(t); x.packet.artifacts[0].kind = 'storage_bytes'; assert.equal(run(x).status, 'BLOCKED_ARTIFACTS');
});
test('shared project and linked target declarations cannot enter the local preparation path', t => {
  for (const patch of [{kind: 'existing_shared_project'}, {unlinked: false}, {projectRef: 'scryfkefedzuetfdtrvl'}]) {
    const x = example(t); Object.assign(x.packet.target, patch); assert.equal(run(x).status, 'BLOCKED_INPUTS');
  }
});
test('older source evidence cannot qualify the current candidate', t => {
  const x = example(t); x.packet.sourceRevision = 'b'.repeat(40); assert.equal(run(x).status, 'BLOCKED_INPUTS');
});
test('missing or identical recovery owners remain an explicit preparation gap', t => {
  for (const value of [null, 'private:primary']) { const x = example(t); x.packet.backupOwnerRef = value; assert.equal(run(x).status, 'BLOCKED_INPUTS'); }
});
test('D06 does not turn preparation into promised non-null service objectives', t => {
  const x = example(t); x.packet.rpoMinutes = 0; assert.equal(run(x).status, 'BLOCKED_INPUTS');
});
test('failed readback is retained as FAIL and cannot yield an RTO', t => {
  const x = example(t); x.packet.readback.status = 'FAIL'; const r = run(x);
  assert.equal(r.status, 'READBACK_FAIL'); assert.equal(r.readbackStatus, 'FAIL'); assert.equal(r.declaredSubsetRtoMs, null);
});
test('not-run readback and missing clocks stay unknown instead of zero', t => {
  const x = example(t); x.packet.readback.status = 'NOT_RUN'; x.packet.timing = null;
  const r = run(x); assert.equal(r.status, 'READBACK_NOT_RUN'); assert.equal(r.declaredSubsetRpoMs, null); assert.equal(r.declaredSubsetRtoMs, null);
});
test('out-of-order or non-UTC clocks cannot manufacture recovery measurements', t => {
  for (const patch of [{snapshotAt: '2026-10-24T00:00:06.000Z'}, {declaredAt: '2026-10-24T00:00:04.000Z'}, {readbackAt: '2026-10-24T00:00:06.000Z'}, {faultAt: '2026-10-24 00:00:05'}]) {
    const x = example(t); Object.assign(x.packet.timing, patch); assert.equal(run(x).status, 'BLOCKED_TIMING');
  }
});
test('genuine equal declared boundaries allow zero arithmetic while objectives remain null', t => {
  const x = example(t); Object.keys(x.packet.timing).forEach(k => x.packet.timing[k] = '2026-10-24T00:00:00.000Z');
  const r = run(x); assert.equal(r.declaredSubsetRpoMs, 0); assert.equal(r.declaredSubsetRtoMs, 0); assert.equal(r.rpoMinutes, null);
});
test('unexpected credential fields are rejected and never echoed', t => {
  const x = example(t); x.packet.credentials = 'DO_NOT_ECHO'; const r = run(x);
  assert.equal(r.status, 'BLOCKED_INPUTS'); assert.ok(!JSON.stringify(r).includes('DO_NOT_ECHO'));
});
test('an oversized artifact declaration is rejected before reading bytes', t => {
  const x = example(t); x.packet.artifacts[0].bytes = 16 * 1024 * 1024 + 1; assert.equal(run(x).status, 'BLOCKED_ARTIFACTS');
});
test('symlink artifacts cannot escape the declared artifact root', t => {
  const x = example(t); fs.mkdirSync(path.join(x.root, 'nested'));
  try { fs.symlinkSync(path.join(x.root, 'subset.json'), path.join(x.root, 'nested/link.json')); }
  catch (e) { if (['EPERM', 'EACCES'].includes(e.code)) return t.skip('Windows does not grant symlink creation; owned Linux CI exercises this'); throw e; }
  x.packet.artifacts[0].path = 'nested/link.json'; assert.equal(run(x).status, 'BLOCKED_ARTIFACTS');
});
test('CLI malformed input has a stable non-echoing failure and no action', () => {
  const result = spawnSync(process.execPath, ['scripts/subset-recovery-report.mjs', '--invalid', 'DO_NOT_ECHO'], {encoding: 'utf8'});
  assert.equal(result.status, 1); assert.match(result.stdout, /^\{/); const r = JSON.parse(result.stdout); assert.equal(r.status, 'INVALID_PACKET');
  assert.deepEqual(r.authorizedActions, []); assert.ok(!result.stdout.includes('DO_NOT_ECHO'));
});
test('hard-linked artifacts cannot borrow files from another ownership scope', t => {
  const x = example(t); fs.linkSync(path.join(x.root, 'subset.json'), path.join(x.root, 'alias.json'));
  assert.equal(run(x).status, 'BLOCKED_ARTIFACTS');
});
test('malformed nested target values return a blocked report without throwing', t => {
  const x = example(t); x.packet.target.projectRef = {toString: null}; assert.equal(run(x).status, 'BLOCKED_INPUTS');
});
