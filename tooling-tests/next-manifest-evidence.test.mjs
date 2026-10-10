import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve('scripts/collect-next-manifest-evidence.mjs');
const canary = 'PRIVATE_MANIFEST_VALUE_MUST_NEVER_BE_EMITTED';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kinnso-manifest-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  writeFileSync(join(root, '.gitignore'), 'apps/web/.next/\nevidence/\n');
  execFileSync('git', ['add', '.gitignore'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Local Test', '-c', 'user.email=local@example.test', 'commit', '--quiet', '-m', 'fixture'], { cwd: root });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  return { root, sha };
}

function manifest(root, name, contents) {
  const path = join(root, 'apps/web/.next', name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function collect({ root, sha }, outcome = 'failure', overrides = {}) {
  return spawnSync(process.execPath, [script, '--phase', 'profile-enquiries', '--outcome', outcome], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_SHA: sha,
      GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2', ...overrides },
  });
}

function receipt(root) {
  return JSON.parse(readFileSync(join(root, 'evidence/next-manifests-profile-enquiries.json'), 'utf8'));
}

test('failed suite retains malformed and valid manifest metadata without private values', (t) => {
  const f = fixture(t);
  const malformed = `{"routes":{}}{"private":"${canary}"}`;
  const valid = JSON.stringify({ config: { secret: canary } });
  manifest(f.root, 'dev/server/app-paths-manifest.json', malformed);
  manifest(f.root, 'routes-manifest.json', valid);
  manifest(f.root, 'dev/arbitrary-private.json', JSON.stringify({ secret: canary }));
  const result = collect(f);
  assert.equal(result.status, 0, 'the failed suite needs a diagnostic receipt');
  const report = receipt(f.root);
  assert.equal(report.suiteOutcome, 'failure');
  assert.equal(report.sourceSha, f.sha);
  assert.equal(report.workingTreeDirty, false);
  assert.equal(report.runId, '12345');
  assert.equal(report.runAttempt, '2');
  assert.equal(report.snapshotStatus, 'INVALID_JSON_OBSERVED');
  assert.equal(report.runtimeAcceptance, 'NOT_RUN_DIAGNOSTIC_ONLY');
  assert.equal(report.manifests.find((m) => m.path === 'dev/server/app-paths-manifest.json').status, 'INVALID_JSON');
  assert.equal(report.manifests.find((m) => m.path === 'routes-manifest.json').status, 'VALID_JSON');
  assert.equal(report.manifests.find((m) => m.path === 'dev/server/app-paths-manifest.json').sha256,
    createHash('sha256').update(malformed).digest('hex'));
  assert.equal(report.manifests.some((m) => m.path.includes('arbitrary-private')), false);
  assert.equal(JSON.stringify(report).includes(canary), false);
  assert.equal((result.stdout + result.stderr).includes(canary), false);
});

test('missing Next output is recorded as absent rather than a valid manifest snapshot', (t) => {
  const f = fixture(t);
  const result = collect(f, 'success');
  assert.equal(result.status, 0, 'missing output still needs an explicit diagnostic receipt');
  const report = receipt(f.root);
  assert.equal(report.snapshotStatus, 'NO_MANIFESTS_OBSERVED');
  assert.ok(report.manifests.length > 0);
  assert.ok(report.manifests.every((m) => m.status === 'MISSING'));
  assert.equal(report.runtimeAcceptance, 'NOT_RUN_DIAGNOSTIC_ONLY');
  assert.equal(existsSync(join(f.root, 'apps/web/.next')), false);
});

test('a successful suite only claims JSON parsing for observed files', (t) => {
  const f = fixture(t);
  manifest(f.root, 'dev/build-manifest.json', '{}');
  assert.equal(collect(f, 'success').status, 0);
  const report = receipt(f.root);
  assert.equal(report.snapshotStatus, 'JSON_PARSED_FOR_OBSERVED_FILES');
  assert.equal(report.manifests.filter((m) => m.status === 'VALID_JSON').length, 1);
  assert.equal(report.manifests.filter((m) => m.status === 'MISSING').length, 23);
  assert.equal(report.runtimeAcceptance, 'NOT_RUN_DIAGNOSTIC_ONLY');
});

for (const outcome of ['skipped', 'cancelled']) {
  test(`${outcome} suite has no manifest execution claim`, (t) => {
    const f = fixture(t);
    manifest(f.root, 'routes-manifest.json', canary);
    assert.equal(collect(f, outcome).status, 0);
    assert.equal(receipt(f.root).snapshotStatus, 'NOT_RUN');
    assert.deepEqual(receipt(f.root).manifests, []);
  });
}

test('oversized and non-file manifests produce incomplete evidence without contents', (t) => {
  const f = fixture(t);
  manifest(f.root, 'routes-manifest.json', canary.repeat(100_000));
  mkdirSync(join(f.root, 'apps/web/.next/dev/build-manifest.json'), { recursive: true });
  assert.equal(collect(f).status, 0);
  const report = receipt(f.root);
  assert.equal(report.snapshotStatus, 'INCOMPLETE_SNAPSHOT');
  assert.equal(report.manifests.find((m) => m.path === 'routes-manifest.json').status, 'TOO_LARGE');
  assert.equal(report.manifests.find((m) => m.path === 'dev/build-manifest.json').status, 'NOT_REGULAR_FILE');
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test('a linked Next output directory is never followed', (t) => {
  const f = fixture(t);
  const outside = join(f.root, 'private-outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'routes-manifest.json'), canary);
  mkdirSync(join(f.root, 'apps/web'), { recursive: true });
  symlinkSync(outside, join(f.root, 'apps/web/.next'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(collect(f).status, 0);
  const report = receipt(f.root);
  assert.equal(report.snapshotStatus, 'INCOMPLETE_SNAPSHOT');
  assert.ok(report.manifests.every((m) => m.status === 'UNSAFE_PATH'));
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test('stale workflow SHA is rejected before reading manifests or creating evidence', (t) => {
  const f = fixture(t);
  manifest(f.root, 'routes-manifest.json', canary);
  const result = collect(f, 'failure', { GITHUB_SHA: 'f'.repeat(40) });
  assert.equal(result.status, 1);
  assert.equal(existsSync(join(f.root, 'evidence')), false);
  assert.equal((result.stdout + result.stderr).includes(canary), false);
});

test('invalid run binding is rejected', (t) => {
  const f = fixture(t);
  assert.equal(collect(f, 'failure', { GITHUB_RUN_ATTEMPT: '0' }).status, 1);
  assert.equal(existsSync(join(f.root, 'evidence')), false);
});

test('an existing receipt is retained instead of overwritten by a second invocation', (t) => {
  const f = fixture(t);
  manifest(f.root, 'routes-manifest.json', '{}');
  assert.equal(collect(f).status, 0);
  const file = join(f.root, 'evidence/next-manifests-profile-enquiries.json');
  const first = readFileSync(file, 'utf8');
  manifest(f.root, 'routes-manifest.json', canary);
  assert.equal(collect(f).status, 1);
  assert.equal(readFileSync(file, 'utf8'), first);
});

test('a linked output directory is rejected without writing outside evidence', (t) => {
  const f = fixture(t);
  const outside = join(f.root, 'outside-evidence');
  mkdirSync(outside);
  symlinkSync(outside, join(f.root, 'evidence'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(collect(f).status, 1);
  assert.equal(existsSync(join(outside, 'next-manifests-profile-enquiries.json')), false);
});
