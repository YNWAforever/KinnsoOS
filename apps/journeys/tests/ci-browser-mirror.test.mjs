import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertCiRunner,ubuntuRelease,replaceAzureMirror} from '../scripts/ci-browser-mirror.mjs';
const env={GITHUB_ACTIONS:'true',KINNSO_CI_RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'YNWAforever/KinnsoOS',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:'a'.repeat(40)};
test('mirror list preserves priority, comments, whitespace and other mirrors',()=>{
 const before='http://azure.archive.ubuntu.com/ubuntu/ priority:1\r\nhttps://security.ubuntu.com/ubuntu priority:2\r\n# http://azure.archive.ubuntu.com/ubuntu comment\r\n';
 assert.equal(replaceAzureMirror(before),'https://archive.ubuntu.com/ubuntu/ priority:1\r\nhttps://security.ubuntu.com/ubuntu priority:2\r\n# http://azure.archive.ubuntu.com/ubuntu comment\r\n');
});
test('legacy Ubuntu sources retain every signing option, suite and component',()=>{
 const before='deb [arch=amd64 signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] http://azure.archive.ubuntu.com/ubuntu jammy-updates main restricted universe multiverse\n';
 assert.equal(replaceAzureMirror(before),before.replace('http://azure.archive.ubuntu.com','https://archive.ubuntu.com'));
});
test('deb822 Ubuntu URI changes without touching signed-by or security sources',()=>{
 const before='Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble noble-updates noble-backports\nComponents: main universe restricted multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: http://security.ubuntu.com/ubuntu\nSuites: noble-security\n';
 assert.equal(replaceAzureMirror(before),before.replace('http://azure.archive.ubuntu.com','https://archive.ubuntu.com'));
});
test('third-party hosts, deceptive suffixes, paths and official sources stay byte-for-byte unchanged',()=>{
 for(const value of ['https://archive.ubuntu.com/ubuntu noble main','https://azure.archive.ubuntu.com.evil/ubuntu noble main','https://azure.archive.ubuntu.com/ubuntu-extra noble main','https://packages.microsoft.com/ubuntu/24.04/prod noble main'])assert.equal(replaceAzureMirror(value),value);
});
test('only a source-bound owned GitHub Ubuntu runner attestation is admitted',()=>{
 assert.doesNotThrow(()=>assertCiRunner('linux',env));
 assert.doesNotThrow(()=>assertCiRunner('linux',{...env,GITHUB_REPOSITORY:'ynwaforever/kinnsoos'}));
});
test('desktop, self-hosted, foreign repo and missing run or source are rejected before any writes',()=>{
 for(const platform of ['win32','darwin'])assert.throws(()=>assertCiRunner(platform,env),/CI_MIRROR/);
 for(const delta of [{GITHUB_ACTIONS:'false'},{KINNSO_CI_RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_REPOSITORY:'someone/else'},{GITHUB_RUN_ID:''},{GITHUB_RUN_ATTEMPT:'0'},{GITHUB_SHA:'main'}])assert.throws(()=>assertCiRunner('linux',{...env,...delta}),/CI_MIRROR/);
});
test('only the observed Ubuntu22.04 and24.04 release and codename pairs are supported',()=>{
 assert.deepEqual(ubuntuRelease('ID=ubuntu\nVERSION_ID="24.04"\nVERSION_CODENAME=noble\n'),{id:'ubuntu',version:'24.04',codename:'noble'});
 assert.equal(ubuntuRelease('ID=ubuntu\nVERSION_ID="22.04"\nVERSION_CODENAME=jammy\n').codename,'jammy');
 for(const value of ['ID=debian\nVERSION_ID="24.04"\nVERSION_CODENAME=noble','ID=ubuntu\nVERSION_ID="26.04"\nVERSION_CODENAME=resolute','ID=ubuntu\nVERSION_ID="24.04"\nVERSION_CODENAME=jammy'])assert.throws(()=>ubuntuRelease(value),/UNSUPPORTED_UBUNTU/);
});
test('direct off-target invocation fails before creating evidence or changing local state',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'kinnso-ci-mirror-refusal-'));
 try{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/ci-browser-mirror.mjs',import.meta.url))],{cwd:directory,env:{PATH:process.env.PATH??'',GITHUB_ACTIONS:'false'},encoding:'utf8',windowsHide:true});
  assert.equal(result.status,1);assert.match(result.stderr,/CI_MIRROR_REQUIRES_OWNED_GITHUB_RUNNER/);assert.deepEqual(await readdir(directory),[]);
 }finally{const target=path.resolve(directory);assert.equal(path.dirname(target),path.resolve(tmpdir()));assert.ok(path.basename(target).startsWith('kinnso-ci-mirror-refusal-'));await rm(target,{recursive:true,force:true});}
});
