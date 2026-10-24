import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {verifySourceInputs} from '../scripts/verify-source-inputs.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function owned(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kinnso-source-boundary-'));
  const actual = fs.realpathSync(root), parent = fs.realpathSync(os.tmpdir());
  t.after(() => {
    assert.equal(path.dirname(actual).toLowerCase(), parent.toLowerCase());
    assert.ok(path.basename(actual).startsWith('kinnso-source-boundary-'));
    fs.rmSync(actual, {recursive: true});
  });
  const app = path.join(actual, 'app');
  fs.mkdirSync(path.join(app, 'scripts'), {recursive: true});
  const bytes = Buffer.from('Owned synthetic source, never a credential\n');
  const outside = path.join(actual, 'unrelated-owned.txt');
  fs.writeFileSync(outside, bytes);
  for (const file of ['input.mjs', 'scripts/input.mjs', '.env.example']) fs.writeFileSync(path.join(app, file), bytes);
  return {app, outside, bytes};
}
function packet(x, name) {
  const manifest = Buffer.from(JSON.stringify({version: 1, files: ['scripts/source-manifest.json', name]}));
  fs.writeFileSync(path.join(x.app, 'scripts/source-manifest.json'), manifest);
  return {sha256: {'scripts/source-manifest.json': hash(manifest), [name]: hash(x.bytes)}};
}
for (const kind of ['parent', 'absolute', 'dot-alias', 'empty-segment']) {
  test(`PD17 source ${kind} path cannot qualify a capsule or read outside the app`, async t => {
    const x = owned(t);
    const name = {parent: '../unrelated-owned.txt', absolute: x.outside.split(path.sep).join('/'), 'dot-alias': 'scripts/../input.mjs', 'empty-segment': 'scripts//input.mjs'}[kind];
    const metadata = packet(x, name), read = fs.promises.readFile;
    let outsideReads = 0, manifestReads = 0;
    const open=fs.openSync,readDescriptor=fs.readSync,names=new Map();
    t.mock.method(fs,'openSync',(...args)=>{const fd=open(...args);names.set(fd,String(args[0]));return fd;});
    t.mock.method(fs,'readSync',(...args)=>{const n=readDescriptor(...args);if(n>0&&names.get(args[0])===x.outside)outsideReads++;if(n>0&&names.get(args[0])===path.join(x.app,'scripts/source-manifest.json'))manifestReads++;return n;});
    t.mock.method(fs.promises, 'readFile', async (file, ...args) => {
      if (String(file) === x.outside) outsideReads++;
      if (String(file) === path.join(x.app, 'scripts/source-manifest.json')) manifestReads++;
      return read(file, ...args);
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    let status = 'VERIFIED';
    try { await verifySourceInputs(x.app, metadata); }
    catch (error) { assert.match(error.message, /Build source differs/); status = 'REJECTED'; }
    assert.ok(manifestReads >= 1, 'Instrument the real source verifier read boundary');
    assert.deepEqual({status, outsideReads}, {status: 'REJECTED', outsideReads: 0});
  });
}
test('canonical source paths including the public env example retain their exact byte checks', async t => {
  const x = owned(t), metadata = packet(x, '.env.example');
  assert.equal(await verifySourceInputs(x.app, metadata), 2);
  fs.appendFileSync(path.join(x.app, '.env.example'), 'Changed owned example\n');
  await assert.rejects(() => verifySourceInputs(x.app, metadata), /Build source differs/);
});
