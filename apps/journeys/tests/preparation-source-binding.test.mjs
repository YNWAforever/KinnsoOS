import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveCandidateRevision} from '../scripts/pilot-preparation.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = 'c'.repeat(40);
const appSource = fileURLToPath(new URL('../', import.meta.url));
function owned(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kinnso-preparation-source-'));
  t.after(() => {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('kinnso-preparation-source-'));
    fs.rmSync(root, {recursive: true, force: true});
  });
  return root;
}
function put(root, name, bytes) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes);
}
function git(root, ...args) {
  return execFileSync('git', ['-c', 'core.hooksPath=' + path.join(root, 'no-hooks'), '-c', 'commit.gpgsign=false', '-c', 'user.name=Kinnso synthetic source test', '-c', 'user.email=source-test@example.invalid', ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}
function checkout(t) {
  const root = owned(t), app = path.join(root, 'apps/journeys');
  put(root, 'apps/journeys/scripts/input.mjs', 'export const input = 1;\n');
  put(root, 'supabase/migrations/20261024000000_source_test.sql', '-- synthetic bytes, never executed\n');
  put(root, '.gitignore', 'apps/journeys/generated/\n');
  git(root, 'init', '--quiet'); git(root, 'add', '--all'); git(root, 'commit', '--quiet', '-m', 'Synthetic source-binding fixture');
  return {root, app, head: git(root, 'rev-parse', 'HEAD')};
}
function extracted(t, root = owned(t)) {
  const files = ['scripts/pilot-preparation.mjs', 'scripts/subset-recovery-report.mjs', 'scripts/verify-source-inputs.mjs', 'scripts/read-contained-file.mjs', 'scripts/source-manifest.json'];
  for (const name of files.slice(0, -1)) put(root, name, fs.readFileSync(path.join(appSource, name)));
  const destination = 'tests/contracts/20261024000000_source_test.sql';
  const manifest = {version: 1, files, repositoryFiles: {[destination]: 'supabase/migrations/20261024000000_source_test.sql'}};
  put(root, files.at(-1), JSON.stringify(manifest));
  put(root, destination, '-- synthetic packaged SQL bytes, never executed\n');
  const metadata = {version: 1, sourceRevision: revision, dirty: false, sha256: Object.fromEntries([...files, destination].map(name => [name, hash(fs.readFileSync(path.join(root, name)))]))};
  put(root, 'SOURCE_METADATA.json', JSON.stringify(metadata));
  return {root, destination, metadata};
}

test('a clean owned Git fixture resolves HEAD; tracked edits cannot keep its candidate identity', async t => {
  const x = checkout(t); assert.equal(await resolveCandidateRevision(x.app), x.head);
  put(x.root, 'apps/journeys/scripts/input.mjs', 'export const input = 2;\n');
  assert.equal(await resolveCandidateRevision(x.app), null);
});
test('an untracked source file cannot borrow the clean HEAD identity', async t => {
  const x = checkout(t); put(x.root, 'apps/journeys/scripts/new-input.mjs', 'export const added = true;\n');
  assert.equal(await resolveCandidateRevision(x.app), null);
});
test('staged repository SQL edits invalidate the candidate before any rehearsal', async t => {
  const x = checkout(t); put(x.root, 'supabase/migrations/20261024000000_source_test.sql', '-- modified, never executed\n');
  git(x.root, 'add', '--all'); assert.equal(await resolveCandidateRevision(x.app), null);
});
test('ignored generated outputs do not falsely invalidate clean source', async t => {
  const x = checkout(t); put(x.root, 'apps/journeys/generated/output.json', '{}');
  assert.equal(await resolveCandidateRevision(x.app), x.head);
});
test('extracted source verifies all manifest bytes before using its own revision', async t => {
  const x = extracted(t); assert.equal(await resolveCandidateRevision(x.root), revision);
  fs.appendFileSync(path.join(x.root, 'scripts/pilot-preparation.mjs'), '\n// changed source after packaging\n');
  assert.equal(await resolveCandidateRevision(x.root), null);
});
test('packaged repository SQL is part of standalone source identity', async t => {
  const x = extracted(t); put(x.root, x.destination, '-- changed packaged SQL\n');
  assert.equal(await resolveCandidateRevision(x.root), null);
});
test('a dirty flag alone cannot authenticate incomplete standalone metadata', async t => {
  const root = owned(t); put(root, 'SOURCE_METADATA.json', JSON.stringify({version: 1, sourceRevision: revision, dirty: false}));
  assert.equal(await resolveCandidateRevision(root), null);
});
test('an extracted package below another checkout uses verified bytes, never its ancestor HEAD', async t => {
  const x = checkout(t), copy = path.join(x.app, 'generated/extracted');
  extracted(t, copy); assert.equal(await resolveCandidateRevision(copy), revision);
  fs.unlinkSync(path.join(copy, 'SOURCE_METADATA.json')); assert.equal(await resolveCandidateRevision(copy), null);
});
test('both actual CLIs await verified standalone source and reject changed source without granting actions', t => {
  const x = extracted(t), artifacts = owned(t), bytes = Buffer.from('{"synthetic":true}\n');
  put(artifacts, 'subset.json', bytes);
  const packet = {version: 1, sourceRevision: revision, scope: 'SYNTHETIC_SUBSET_ONLY', target: {kind: 'owned_local', projectRef: 'kinnsoos-rehearsal-012345abcdef', unlinked: true, identityRef: 'owned-ci:declaration', ownershipRef: 'owned-ci:marker'}, ownerRef: 'private:owner', backupOwnerRef: 'private:backup', serviceObjective: 'NOT_PROMISED', rpoMinutes: null, rtoMinutes: null, artifacts: [{path: 'subset.json', kind: 'database_subset', bytes: bytes.length, sha256: hash(bytes)}], timing: {snapshotAt: '2026-10-24T00:00:00.000Z', faultAt: '2026-10-24T00:00:01.000Z', declaredAt: '2026-10-24T00:00:02.000Z', readbackAt: '2026-10-24T00:00:03.000Z'}, readback: {status: 'PASS', evidenceRef: 'owned-ci:declared-only'}};
  put(artifacts, 'packet.json', JSON.stringify(packet));
  const invoke = name => spawnSync(process.execPath, [path.join(x.root, 'scripts', name), ...(name.startsWith('subset') ? ['--root', artifacts, '--packet', 'packet.json'] : ['--packet', path.join(artifacts, 'packet.json')])], {cwd: x.root, encoding: 'utf8'});
  let subset = invoke('subset-recovery-report.mjs'); assert.equal(subset.status, 0, subset.stderr); assert.equal(JSON.parse(subset.stdout).sourceRevision, revision);
  let pilot = invoke('pilot-preparation.mjs'); assert.equal(pilot.status, 2, pilot.stderr); assert.equal(JSON.parse(pilot.stdout).checks.find(c => c.id === 'SOURCE_BINDING').status, 'PASS');
  fs.appendFileSync(path.join(x.root, 'scripts/verify-source-inputs.mjs'), '\n// changed packaged source\n');
  subset = invoke('subset-recovery-report.mjs'); assert.equal(subset.status, 2); assert.equal(JSON.parse(subset.stdout).status, 'BLOCKED_INPUTS'); assert.equal(JSON.parse(subset.stdout).sourceRevision, null);
  pilot = invoke('pilot-preparation.mjs'); assert.equal(pilot.status, 2); assert.equal(JSON.parse(pilot.stdout).checks.find(c => c.id === 'SOURCE_BINDING').status, 'BLOCKED');
  for (const result of [subset, pilot]) { const report = JSON.parse(result.stdout); assert.deepEqual(report.authorizedActions, []); assert.equal(report.runtimeStatus, 'NOT_RUN'); }
});

test('standalone metadata cannot mask a dirty canonical Git checkout', async t => {
  const x = checkout(t); extracted(t, x.app);
  assert.equal(await resolveCandidateRevision(x.app), null);
});

for (const change of ['dirty', 'head']) test('late canonical Git '+change+' change cannot pass an awaited source verification', async t => {
 const x=checkout(t), packaged=extracted(t,x.app);
 put(x.root,'.gitignore','apps/journeys/generated/\napps/journeys/SOURCE_METADATA.json\n');
 git(x.root,'add','--all');git(x.root,'commit','--quiet','-m','Complete packaged-source fixture');
 const head=git(x.root,'rev-parse','HEAD'),meta=path.join(x.app,'SOURCE_METADATA.json');
 packaged.metadata.sourceRevision=head;put(x.app,'SOURCE_METADATA.json',JSON.stringify(packaged.metadata));
 assert.equal(await resolveCandidateRevision(x.app),head);
 const originalOpen=fs.openSync,originalRead=fs.readSync,metadataFds=new Set();let changed=false;
 t.mock.method(fs,'openSync',(...args)=>{const fd=originalOpen(...args);if(String(args[0])===meta)metadataFds.add(fd);return fd;});
 t.mock.method(fs,'readSync',(...args)=>{
  const value=originalRead(...args);
  if(!changed&&metadataFds.has(args[0])&&value>0){changed=true;queueMicrotask(()=>{
   if(change==='dirty')put(x.root,'late-note.md','Changed during awaited verification');
   else git(x.root,'commit','--allow-empty','--quiet','-m','Advance source identity during verification');
  });}
  return value;
 });
 const result=await resolveCandidateRevision(x.app);assert.equal(changed,true);assert.equal(result,null);
});
