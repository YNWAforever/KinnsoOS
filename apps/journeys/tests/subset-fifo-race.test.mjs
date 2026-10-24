import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('POSIX FIFO substitution is blocked without a writer; exact f18 reader is a watchdog negative control', {skip: process.platform === 'win32' ? 'POSIX FIFO is not available on Windows; owned Linux CI must execute this case' : false}, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kinnso-fifo-race-')));
  t.after(() => { assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(root).startsWith('kinnso-fifo-race-')); fs.rmSync(root, {recursive: true}); });
  const file = path.join(root, 'artifact.json');
  const baseline = path.join(root, 'baseline.mjs');
  const original = fs.readFileSync(new URL('./fixtures/subset-reader-f18a3a63.txt', import.meta.url), 'utf8');
  fs.writeFileSync(baseline, "import fs from 'node:fs'; import path from 'node:path';\nexport " + original);
  const current = fileURLToPath(new URL('../scripts/subset-recovery-report.mjs', import.meta.url));
  const run = legacy => {
    fs.rmSync(file, {force: true}); fs.writeFileSync(file, 'Owned example bytes\n');
    const code = `
      import fs from 'node:fs'; import path from 'node:path';
      import {execFileSync} from 'node:child_process'; import {createHash} from 'node:crypto';
      const root=${JSON.stringify(root)},file=${JSON.stringify(file)};
      const content=fs.readFileSync(file),open=fs.openSync;let exchanged=false;
      fs.openSync=(name,...args)=>{
        if(!exchanged&&path.resolve(String(name))===file){
          exchanged=true;fs.unlinkSync(file);execFileSync('mkfifo',[file]);fs.writeSync(1,'FIFO_READY'+String.fromCharCode(10));
        }
        return open(name,...args);
      };
      ${legacy ? `const {artifactFile}=await import(${JSON.stringify(pathToFileURL(baseline).href)});artifactFile(root,'artifact.json',262144);` : `
        const {assessSubsetRecovery}=await import(${JSON.stringify(pathToFileURL(current).href)});
        const sourceRevision='a'.repeat(40);
        const p={version:1,sourceRevision,scope:'SYNTHETIC_SUBSET_ONLY',
          target:{kind:'owned_local',projectRef:'kinnsoos-rehearsal-012345abcdef',unlinked:true,identityRef:'owned-ci:declared-only',ownershipRef:'owned-ci:owned-file-only'},
          ownerRef:'owned-ci:primary',backupOwnerRef:'owned-ci:backup',serviceObjective:'NOT_PROMISED',rpoMinutes:null,rtoMinutes:null,
          artifacts:[{path:'artifact.json',kind:'database_subset',bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')}],
          timing:null,readback:{status:'NOT_RUN',evidenceRef:'owned-ci:no-restore'}};
        const report=assessSubsetRecovery(p,{root,sourceRevision});process.stdout.write(JSON.stringify(report));
      `}
    `;
    return spawnSync(process.execPath, ['--max-old-space-size=64','--input-type=module','-e',code], {cwd:root,encoding:'utf8',timeout:legacy?1500:4000,maxBuffer:65536});
  };
  const prior=run(true); assert.match(prior.stdout,/FIFO_READY/); assert.equal(prior.error?.code,'ETIMEDOUT','Exact f18 reader must demonstrate the blocking precondition');
  const fixed=run(false); assert.match(fixed.stdout,/FIFO_READY/); assert.equal(fixed.error,undefined); assert.equal(fixed.status,0,fixed.stderr);
  const report=JSON.parse(fixed.stdout.slice(fixed.stdout.indexOf('{')).trim());
  assert.equal(report.status,'BLOCKED_ARTIFACTS'); assert.equal(report.runtimeStatus,'NOT_RUN'); assert.deepEqual(report.authorizedActions,[]);
});
