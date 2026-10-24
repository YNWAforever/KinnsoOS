import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {verifySourceInputs} from '../scripts/verify-source-inputs.mjs';
import {resolveCandidateRevision} from '../scripts/pilot-preparation.mjs';
const hash = body => createHash('sha256').update(body).digest('hex');
function owned(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kinnso-source-race-')));
  t.after(() => { assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(root).startsWith('kinnso-source-race-')); fs.rmSync(root, {recursive: true}); });
  const app = path.join(root, 'app'), outside = path.join(root, 'unrelated');
  fs.mkdirSync(path.join(app, 'scripts'), {recursive: true}); fs.mkdirSync(path.join(app, 'inputs'));
  fs.mkdirSync(outside); const data = Buffer.from('Owned unrelated source bytes\n');
  fs.writeFileSync(path.join(app, 'inputs/data.mjs'), data); fs.writeFileSync(path.join(outside, 'data.mjs'), data);
  const manifest = Buffer.from(JSON.stringify({version: 1, files: ['scripts/source-manifest.json', 'inputs/data.mjs']}));
  fs.writeFileSync(path.join(app, 'scripts/source-manifest.json'), manifest);
  return {root, app, outside, manifest, data, metadata: {version: 1, sourceRevision: 'd'.repeat(40), dirty: false, sha256: {'scripts/source-manifest.json': hash(manifest), 'inputs/data.mjs': hash(data)}}};
}
function link(t, target, file) {
  try { fs.symlinkSync(target, file, process.platform === 'win32' ? 'junction' : 'dir'); return true; }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Directory links denied; owned Linux CI must exercise this boundary'); return false; } throw error; }
}
function observe(t, x, borrowed = []) {
  const realpath = fs.realpathSync, read = fs.readSync, open = fs.openSync, whole = fs.readFileSync, asyncWhole = fs.promises.readFile;
  const descriptors = new Map(); let outsideBytes = 0;
  const external = file => {
    if (typeof file === 'number') file = descriptors.get(file);
    if (file && typeof file === 'object' && 'fd' in file) file = descriptors.get(file.fd);
    if (typeof file !== 'string') return false;
    let actual; try { actual = realpath(file); } catch { return false; }
    return actual === x.outside || actual.startsWith(x.outside + path.sep) || borrowed.includes(actual);
  };
  t.mock.method(fs, 'openSync', (...args) => { const fd = open(...args); descriptors.set(fd, String(args[0])); return fd; });
  t.mock.method(fs, 'readSync', (...args) => { const n = read(...args); if (external(args[0])) outsideBytes += n; return n; });
  t.mock.method(fs, 'readFileSync', (...args) => { const outside = external(args[0]), data = whole(...args); if (outside) outsideBytes += Buffer.byteLength(data); return data; });
  t.mock.method(fs.promises, 'readFile', async (...args) => { const outside = external(args[0]), data = await asyncWhole(...args); if (outside) outsideBytes += Buffer.byteLength(data); return data; });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return () => outsideBytes;
}
async function result(x) { try { await verifySourceInputs(x.app, x.metadata); return 'VERIFIED'; } catch { return 'REJECTED'; } }

test('source parent exchanged after realpath cannot read unrelated owned bytes', async t => {
  const x = owned(t), folder = path.join(x.app, 'inputs'), file = path.join(folder, 'data.mjs');
  const probe = path.join(x.app, 'link-probe'); if (!link(t, x.outside, probe)) return; fs.unlinkSync(probe);
  const outsideBytes = observe(t, x), original = fs.promises.realpath, originalSync = fs.realpathSync; let swapped = false;
  const swap = name => { if (!swapped && String(name) === file) { swapped = true; fs.renameSync(folder, path.join(x.app, 'retained-inputs')); fs.symlinkSync(x.outside, folder, process.platform === 'win32' ? 'junction' : 'dir'); } };
  t.mock.method(fs.promises, 'realpath', async (...args) => { const value = await original(...args); swap(args[0]); return value; });
  t.mock.method(fs, 'realpathSync', (...args) => { const value = originalSync(...args); swap(args[0]); return value; });
  syncBuiltinESMExports();
  const status = await result(x); assert.equal(swapped, true);
  assert.deepEqual({status, outsideBytes: outsideBytes()}, {status: 'REJECTED', outsideBytes: 0});
});

test('source manifest directory links are refused before reading their payload', async t => {
  const x = owned(t); fs.writeFileSync(path.join(x.outside, 'source-manifest.json'), x.manifest);
  fs.renameSync(path.join(x.app, 'scripts'), path.join(x.app, 'retained-scripts'));
  if (!link(t, x.outside, path.join(x.app, 'scripts'))) return;
  const outsideBytes = observe(t, x); const status = await result(x);
  assert.deepEqual({status, outsideBytes: outsideBytes()}, {status: 'REJECTED', outsideBytes: 0});
});

test('source hardlinks cannot borrow an unrelated file ownership scope', async t => {
  const x = owned(t), file = path.join(x.app, 'inputs/data.mjs'); fs.unlinkSync(file);
  try { fs.linkSync(path.join(x.outside, 'data.mjs'), file); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('Hardlinks denied; owned Linux CI must exercise this boundary'); throw error; }
  const outsideBytes = observe(t, x, [file]), status = await result(x);
  assert.deepEqual({status, outsideBytes: outsideBytes()}, {status: 'REJECTED', outsideBytes: 0});
});

test('linked SOURCE_METADATA cannot qualify a capsule by reading another scope', async t => {
  const x = owned(t), source = path.join(x.outside, 'metadata.json'), destination = path.join(x.app, 'SOURCE_METADATA.json');
  fs.writeFileSync(source, JSON.stringify(x.metadata));
  try { fs.linkSync(source, destination); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('Hardlinks denied; owned Linux CI must exercise this boundary'); throw error; }
  const outsideBytes = observe(t, x, [destination]); const revision = await resolveCandidateRevision(x.app);
  assert.deepEqual({revision, outsideBytes: outsideBytes()}, {revision: null, outsideBytes: 0});
});
