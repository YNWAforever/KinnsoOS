import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {setTimeout} from 'node:timers';
import {waitChild} from '../../scripts/owned-child-lifecycle.mjs';

const mode=process.argv[2],behavior=process.argv[3]??'normal';
if(mode==='relay'){
 assert.ok(process.send,'IPC_ONLY_PROBE');
 process.on('disconnect',()=>{
  process.stdout.write('synthetic relay final stdout\n');
  process.stderr.write('synthetic relay final stderr\n');
  setTimeout(()=>process.exit(behavior==='nonzero'?7:0),behavior==='slow'?200:20);
 });
 process.send({kind:'ready'});
}else if(mode==='wrapper'){
 const child=fork(fileURLToPath(import.meta.url),['relay',behavior],{
  execArgv:['--max-old-space-size=64'],windowsHide:true,
  stdio:['ignore','pipe','pipe','ipc'],
 });
 const events=[];
 for(const event of ['disconnect','exit','close'])child.on(event,()=>events.push(event));
 child.stdout.on('close',()=>events.push('stdout-close'));
 child.stderr.on('close',()=>events.push('stderr-close'));
 let resolved=false;
 process.once('beforeExit',()=>{
  if(!resolved)console.error(JSON.stringify({unsettled:true,events,
   childExitCode:child.exitCode,stdoutClosed:child.stdout.closed,stderrClosed:child.stderr.closed}));
 });
 const completed=waitChild(child);
 const ready=await once(child,'message');
 assert.equal(ready[0].kind,'ready');
 child.disconnect();
 const result=await completed;
 resolved=true;
 console.log(JSON.stringify(result));
 process.exitCode=result.code??1;
}else throw Error('EXPLICIT_PROBE_MODE_REQUIRED');
