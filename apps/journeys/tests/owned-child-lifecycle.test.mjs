import test from 'node:test';
import assert from 'node:assert/strict';
import {fork,spawn,spawnSync} from 'node:child_process';
import {EventEmitter,once} from 'node:events';
import {PassThrough} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {waitChild} from '../scripts/owned-child-lifecycle.mjs';

const probe=fileURLToPath(new URL('./helpers/owned-child-probe.mjs',import.meta.url));
test('manually disconnected real IPC relay completes wrapper await and preserves final output',()=>{
 const child=spawnSync(process.execPath,['--max-old-space-size=64',probe,'wrapper'],{
  encoding:'utf8',windowsHide:true,timeout:10000,
 });
 assert.equal(child.error,undefined,'probe must exit without a timeout or spawn error');
 assert.equal(child.status,0,child.stderr);
 assert.doesNotMatch(child.stderr,/unsettled top-level await/i);
 const result=JSON.parse(child.stdout.trim());
 assert.equal(result.code,0);assert.equal(result.signal,null);
 assert.equal(result.stdout,'synthetic relay final stdout\n');
 assert.equal(result.stderr,'synthetic relay final stderr\n');
});

test('manually disconnected relay retains its nonzero result and final output',()=>{
 const child=spawnSync(process.execPath,['--max-old-space-size=64',probe,'wrapper','nonzero'],{
  encoding:'utf8',windowsHide:true,timeout:10000,
 });
 assert.equal(child.error,undefined);
 assert.equal(child.status,7,child.stderr);
 assert.doesNotMatch(child.stderr,/unsettled top-level await/i);
 const result=JSON.parse(child.stdout.trim());
 assert.equal(result.code,7);
 assert.equal(result.stdout,'synthetic relay final stdout\n');
 assert.equal(result.stderr,'synthetic relay final stderr\n');
});

test('ordinary spawned process retains code and both output streams',async()=>{
 const child=spawn(process.execPath,['--max-old-space-size=64','--input-type=module','-e',
  'process.stdout.write("synthetic stdout");process.stderr.write("synthetic stderr");process.exitCode=5;'],
 {windowsHide:true,stdio:['ignore','pipe','pipe']});
 assert.deepEqual(await waitChild(child),{code:5,signal:null,stdout:'synthetic stdout',stderr:'synthetic stderr'});
});

test('exit alone cannot complete before trailing stdout and stderr close',async()=>{
 const child=new EventEmitter();
 Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),exitCode:null,signalCode:null});
 let completed=false;
 const result=waitChild(child).then(value=>{completed=true;return value});
 child.emit('exit',0,null);
 await delay(20);assert.equal(completed,false);
 child.stdout.end('synthetic tail');await delay(20);assert.equal(completed,false);
 child.stderr.end('synthetic diagnostic');
 assert.deepEqual(await result,{code:0,signal:null,stdout:'synthetic tail',stderr:'synthetic diagnostic'});
});

test('closed output alone cannot complete before the owned process exits',async()=>{
 const child=new EventEmitter();
 Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),exitCode:null,signalCode:null});
 let completed=false;
 const result=waitChild(child).then(value=>{completed=true;return value});
 child.stdout.end();child.stderr.end();
 await delay(20);assert.equal(completed,false);
 child.emit('exit',null,'SIGTERM');
 assert.deepEqual(await result,{code:null,signal:'SIGTERM',stdout:'',stderr:''});
});

test('spawn errors are observed immediately and expose only a safe platform code',async()=>{
 const child=new EventEmitter();
 Object.assign(child,{stdout:null,stderr:null,exitCode:null,signalCode:null});
 const result=waitChild(child);
 child.emit('error',Object.assign(Error('synthetic private argv must stay private'),{code:'ENOENT'}));
 await assert.rejects(result,error=>{
  assert.equal(error.code,'OWNED_CHILD_SPAWN_FAILED_ENOENT');
  assert.doesNotMatch(error.message,/private argv/);return true;
 });
});

test('disconnect wait has a deadline without killing the owned relay',async()=>{
 const child=fork(probe,['relay','slow'],{execArgv:['--max-old-space-size=64'],
  windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 const exited=once(child,'exit');
 const closed=waitChild(child,{closeTimeoutMs:40});
 await once(child,'message');
 child.disconnect();
 await assert.rejects(closed,{code:'OWNED_CHILD_CLOSE_TIMEOUT'});
 assert.equal(child.killed,false);
 assert.deepEqual(await exited,[0,null]);
});

test('the shutdown deadline does not cap a healthy running process lifetime',async()=>{
 const child=new EventEmitter();
 Object.assign(child,{stdout:null,stderr:null,exitCode:null,signalCode:null});
 let settled=false;
 const closed=waitChild(child,{closeTimeoutMs:10}).then(value=>{settled=true;return value});
 await delay(30);assert.equal(settled,false);
 child.emit('exit',0,null);
 assert.equal((await closed).code,0);
});
