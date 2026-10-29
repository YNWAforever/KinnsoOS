import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const verifiedLock=JSON.parse(fs.readFileSync(new URL('../scripts/ci-image-lock.json',import.meta.url),'utf8'));
const implementation=await import('../scripts/prefetch-ci-images.mjs').catch(()=>({}));
const env={CI:'true',GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_ARCH:'X64',RUNNER_TEMP:'/owned/runner-temp',DOCKER_CONFIG:'/owned/runner-temp/kinnso-ghcr',GITHUB_SHA:'a'.repeat(40)};
function harness(overrides={}){
 let time=0;const calls=[],waits=[],messages=[];
 return {calls,waits,messages,options:{env,clock:()=>time,random:()=>0,wait:async ms=>{waits.push(ms);time+=ms;},log:x=>messages.push(x),run:(program,args)=>{
  calls.push([program,...args]);
  if(program==='supabase')return {status:0,stdout:'2.107.0\n',stderr:''};
  if(args[0]==='image')return {status:0,stdout:JSON.stringify([args[2]]),stderr:''};
  return {status:0,stdout:'cached',stderr:''};
 },...overrides},advance:ms=>time+=ms};
}
function entry(){assert.equal(typeof implementation.prefetchCiImages,'function','owned CI must prefetch pinned images without replaying database startup');return implementation.prefetchCiImages;}

test('profiles retain the exact pinned CLI and image inventory, with only local type aliasing',()=>{
 assert.equal(typeof implementation.imagePlan,'function');
 const base=implementation.imagePlan('connected'),mail=implementation.imagePlan('mailbox'),root=implementation.imagePlan('root');
 assert.equal(base.length,8);assert.equal(mail.length,9);assert.equal(root.length,9);
 assert.ok(base.some(x=>x.image==='ghcr.io/supabase/postgres:17.6.1.136'));
 assert.ok(mail.some(x=>x.image==='ghcr.io/supabase/mailpit:v1.22.3'));
 assert.deepEqual(root.at(-1),{image:'ghcr.io/supabase/postgres-meta:v0.96.1',alias:'public.ecr.aws/supabase/postgres-meta:v0.96.1'});
 assert.throws(()=>implementation.imagePlan('production'));
 assert.ok(base.every(x=>/^ghcr\.io\/supabase\/[a-z-]+:[a-zA-Z0-9._-]+$/.test(x.image)));
});

test('non-CI, missing auth directory and config outside the owned runner temp stop before any command',async()=>{
 const start=entry();
 for(const change of [{CI:'false'},{GITHUB_ACTIONS:'false'},{DOCKER_CONFIG:''},{DOCKER_CONFIG:'/user/.docker'},{RUNNER_TEMP:''}]){
  const h=harness({env:{...env,...change}});await assert.rejects(()=>start('connected',h.options),/CI_REGISTRY_CONTEXT_REQUIRED/);assert.deepEqual(h.calls,[]);
 }
});

test('CLI version drift fails closed before image acquisition',async()=>{
 const start=entry();const h=harness({run:(program,args)=>{h.calls.push([program,...args]);return {status:0,stdout:'2.108.0',stderr:''};}});
 await assert.rejects(()=>start('connected',h.options),/PINNED_CLI_VERSION_REQUIRED/);assert.deepEqual(h.calls,[['supabase','--version']]);
});

test('successful root prefetch is sequential and records registry digests before its local tag alias',async()=>{
 const start=entry(),h=harness();const r=await start('root',h.options);
 assert.equal(r.status,'PASS');assert.equal(r.images.length,9);assert.ok(r.images.every(x=>x.attempts===1&&x.digests.length===1));
 assert.deepEqual(h.calls.slice(1).map(x=>x[1]),Array.from({length:9},()=>['pull','image','tag']).flat().concat('tag'));
 assert.ok(h.calls.every(x=>x[0]==='docker'||x.join(' ')==='supabase --version'));
 assert.deepEqual(h.waits,[]);
});

test('429 retries keep the same pinned image and use a minimum 15s then 30s backoff',async()=>{
 const start=entry(),h=harness();const actual=h.options.run;let failures=0;
 h.options.run=(program,args,options)=>{if(args[0]==='pull'&&failures++<2){h.calls.push([program,...args]);return {status:1,stdout:'',stderr:'toomanyrequests: retry-after: 49us, allowed: 44000/minute'};}return actual(program,args,options);};
 const r=await start('connected',h.options);
 assert.equal(r.images[0].attempts,3);assert.deepEqual(h.waits,[15000,30000]);
 const pulls=h.calls.filter(x=>x[1]==='pull');assert.equal(pulls[0].at(-1).split('@')[1],pulls[1].at(-1).split('@')[1]);assert.equal(pulls[1].at(-1),pulls[2].at(-1));assert.ok(pulls[0].at(-1).startsWith('ghcr.io/'));assert.ok(pulls[1].at(-1).startsWith('docker.io/'));
});

test('authorization, missing manifest and daemon failures do not trigger registry retries',async()=>{
 const start=entry();
 for(const message of ['unauthorized: authentication required','unauthorized with prior429 diagnostic','unauthorized after HTTP 429 Too Many Requests','forbidden','denied: forbidden','manifest unknown','Cannot connect to the Docker daemon','HTTP 401','HTTP 403']){
  for(const failure of [{status:1,stderr:message},{status:null,signal:'SIGTERM',stderr:message,error:Error('timeout')},{status:null,error:Error(message)}]){
   const h=harness(),actual=h.options.run;let pulls=0;
   h.options.run=(program,args,options)=>args[0]==='pull'?(pulls++,failure):actual(program,args,options);
   await assert.rejects(()=>start('connected',h.options),/IMAGE_PULL_FAILED/);assert.equal(pulls,1);assert.deepEqual(h.waits,[]);
  }
 }
});

test('authorization failure after a retryable GHCR failure stops immediately on the mirror',async()=>{
 const start=entry(),h=harness(),actual=h.options.run;let pulls=0;
 h.options.run=(program,args,options)=>args[0]==='pull'?(pulls++,{status:1,stderr:pulls===1?'HTTP 429 Too Many Requests':'unauthorized: authentication required'}):actual(program,args,options);
 await assert.rejects(()=>start('connected',h.options),error=>{
  assert.equal(error.message,'IMAGE_PULL_FAILED');assert.equal(error.receipt.failedImage.attempts,2);assert.equal(error.receipt.failedImage.source,'VERIFIED_DOCKER_HUB');return true;
 });
 assert.equal(pulls,2);assert.deepEqual(h.waits,[15000]);
});

test('transient GHCR connectivity errors retry with backoff and the same verified mirror digest',async()=>{
 const start=entry();
 for(const message of ['Get "https://ghcr.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)','Client.Timeout exceeded','connection timed out','dial tcp: connection refused','read: connection reset by peer','i/o timeout','TLS handshake timeout','temporary failure in name resolution','unexpected EOF','net/http: transport connection broken','context deadline exceeded','ECONNRESET','ECONNREFUSED','EAI_AGAIN','network is unreachable']){
  for(const output of ['stderr','stdout']){
   const h=harness(),actual=h.options.run;let failures=0;
   h.options.run=(program,args,options)=>{
    if(args[0]==='pull'&&failures++<2){h.calls.push([program,...args]);return {status:1,[output]:message};}
    return actual(program,args,options);
   };
   const r=await start('connected',h.options),pin=verifiedLock.images[0],pulls=h.calls.filter(x=>x[1]==='pull');
   assert.equal(r.status,'PASS');assert.equal(r.images[0].attempts,3);assert.equal(r.images[0].source,'VERIFIED_DOCKER_HUB');assert.deepEqual(h.waits,[15000,30000]);
   assert.equal(pulls[0].at(-1),'ghcr.io/supabase/postgres@'+pin.digest);assert.equal(pulls[1].at(-1),pin.mirror+'@'+pin.digest);assert.equal(pulls[2].at(-1),pulls[1].at(-1));
   assert.equal(r.images[0].downloadReference,pulls[1].at(-1));assert.deepEqual(r.images[0].digests,[pulls[1].at(-1)]);
   assert.deepEqual(h.messages.filter(x=>x.startsWith('Pinned image '+pin.image)),[1,2,3].map(n=>`Pinned image ${pin.image}, attempt ${n}/5`));
  }
 }
});

test('persistent throttling stops after five pulls and never launches or retries a database',async()=>{
 const start=entry(),h=harness(),actual=h.options.run;let pulls=0;
 h.options.run=(program,args,options)=>args[0]==='pull'?(pulls++,{status:1,stderr:'HTTP 429 Too Many Requests',stdout:''}):actual(program,args,options);
 await assert.rejects(()=>start('connected',h.options),/REGISTRY_RETRY_EXHAUSTED/);assert.equal(pulls,5);assert.deepEqual(h.waits,[15000,30000,60000,60000]);
 assert.deepEqual(h.calls,[['supabase','--version']]);
});

test('the whole prefetch has an eight-minute budget, including time spent downloading',async()=>{
 const start=entry(),h=harness(),actual=h.options.run;
 h.options.run=(program,args,options)=>{if(args[0]==='pull'){h.advance(481000);return {status:1,stderr:'toomanyrequests',stdout:''};}return actual(program,args,options);};
 await assert.rejects(()=>start('connected',h.options),/REGISTRY_TIME_BUDGET_EXHAUSTED/);assert.deepEqual(h.waits,[]);
});

test('a successful pull without an exact matching registry digest cannot qualify the cache',async()=>{
 const start=entry();
 for(const digests of [[],['other.example/image@sha256:'+'b'.repeat(64)],['ghcr.io/supabase/postgres@sha256:short']]){
  const h=harness(),actual=h.options.run;h.options.run=(program,args,options)=>args[0]==='image'?{status:0,stdout:JSON.stringify(digests)}:actual(program,args,options);
  await assert.rejects(()=>start('root',h.options),/IMAGE_DIGEST_REQUIRED/);assert.ok(!h.calls.some(x=>x[1]==='tag'));
 }
});

test('tag failures are not retried and never fall back to a remote ECR pull',async()=>{
 const start=entry(),h=harness(),actual=h.options.run;let tags=0;
 h.options.run=(program,args,options)=>args[0]==='tag'?(tags++,{status:1,stderr:'tag failed'}):actual(program,args,options);
 await assert.rejects(()=>start('root',h.options),/LOCAL_IMAGE_ALIAS_FAILED/);assert.equal(tags,1);assert.deepEqual(h.waits,[]);
 assert.ok(h.calls.filter(x=>x[1]==='pull').every(x=>x.at(-1).startsWith('ghcr.io/supabase/')));
});

test('hung or killed Docker pulls retry even without registry stderr',async()=>{
 const start=entry();
 for(const failure of [{status:null,signal:'SIGTERM',stderr:'toomanyrequests',error:Error('timeout')},{status:null,signal:'SIGTERM',error:Object.assign(Error('spawnSync docker ETIMEDOUT'),{code:'ETIMEDOUT'})},{status:null,signal:'SIGKILL'},{status:null},{status:1,error:Error('Client.Timeout exceeded while awaiting headers')}]){
  const h=harness({random:()=>0.5}),actual=h.options.run;let failed=false;const timeouts=[];
  h.options.run=(program,args,options)=>{
   timeouts.push(options.timeout);
   if(args[0]==='pull'&&!failed){failed=true;h.calls.push([program,...args]);return failure;}
   return actual(program,args,options);
  };
  const r=await start('connected',h.options),pulls=h.calls.filter(x=>x[1]==='pull');
  assert.equal(r.images[0].attempts,2);assert.equal(r.images[0].source,'VERIFIED_DOCKER_HUB');assert.deepEqual(h.waits,[17500]);
  assert.equal(pulls[1].at(-1),verifiedLock.images[0].mirror+'@'+verifiedLock.images[0].digest);assert.ok(timeouts.every(ms=>ms===120000));
 }
});

test('unrecognized Docker errors and local spawn failures remain fail-closed',async()=>{
 const start=entry();
 for(const failure of [{status:1,stderr:'unexpected local failure'},{status:null,error:Object.assign(Error('spawnSync docker ENOENT'),{code:'ENOENT'})},{status:null,error:Object.assign(Error('spawnSync docker EACCES'),{code:'EACCES'})}]){
  const h=harness(),actual=h.options.run;let pulls=0;
  h.options.run=(program,args,options)=>args[0]==='pull'?(pulls++,failure):actual(program,args,options);
  await assert.rejects(()=>start('connected',h.options),/IMAGE_PULL_FAILED/);assert.equal(pulls,1);assert.deepEqual(h.waits,[]);
 }
});

test('persistent network and hung pull failures exhaust five attempts and preserve the last diagnostic',async()=>{
 const start=entry();
 for(const failure of [{status:1,stderr:'Client.Timeout exceeded while awaiting headers'},{status:null,signal:'SIGTERM',error:Error('spawnSync docker ETIMEDOUT')}]){
  const h=harness(),actual=h.options.run;let pulls=0;
  h.options.run=(program,args,options)=>args[0]==='pull'?(pulls++,failure):actual(program,args,options);
  await assert.rejects(()=>start('connected',h.options),error=>{
   assert.equal(error.message,'REGISTRY_RETRY_EXHAUSTED');assert.equal(error.receipt.status,'FAIL');assert.equal(error.receipt.failedImage.attempts,5);
   assert.equal(error.receipt.failedImage.source,'VERIFIED_DOCKER_HUB');assert.equal(error.receipt.failedImage.downloadReference,verifiedLock.images[0].mirror+'@'+verifiedLock.images[0].digest);
   assert.match(error.receipt.failedImage.lastError,/Client.Timeout|ETIMEDOUT/);return true;
  });
  assert.equal(pulls,5);assert.deepEqual(h.waits,[15000,30000,60000,60000]);assert.deepEqual(h.calls,[['supabase','--version']]);
 }
});

test('hung pulls share the eight-minute budget and each timeout is capped by remaining time',async()=>{
 const start=entry(),h=harness(),actual=h.options.run,timeouts=[];let pulls=0;
 h.options.run=(program,args,options)=>{
  if(args[0]==='pull'){pulls++;timeouts.push(options.timeout);h.advance(options.timeout);return {status:null,signal:'SIGTERM',error:Error('spawnSync docker ETIMEDOUT')};}
  return actual(program,args,options);
 };
 await assert.rejects(()=>start('connected',h.options),error=>{
  assert.equal(error.message,'REGISTRY_TIME_BUDGET_EXHAUSTED');assert.equal(error.receipt.failedImage.attempts,4);return true;
 });
 assert.equal(pulls,4);assert.deepEqual(h.waits,[15000,30000,60000]);assert.deepEqual(timeouts,[120000,120000,120000,15000]);
});


test('an incomplete, duplicate, unpinned or unapproved mirror lock stops before CLI or Docker',async()=>{
 const start=entry();
 for(const change of [p=>p.images.pop(),p=>p.images.push(p.images[0]),p=>p.images[0].digest='sha256:short',p=>p.images[0].mirror='docker.io/outsider/replacement',p=>p.cliVersion='latest']){
  const lock=structuredClone(verifiedLock);change(lock);const h=harness({lock});
  await assert.rejects(()=>start('connected',h.options),/VERIFIED_IMAGE_LOCK_REQUIRED/);assert.deepEqual(h.calls,[]);
 }
});

test('platform-specific locks cannot run against an unknown or different runner architecture',async()=>{
 const start=entry();
 for(const change of [{RUNNER_OS:'Windows'},{RUNNER_ARCH:'ARM64'},{RUNNER_ARCH:''}]){const h=harness({env:{...env,...change}});await assert.rejects(()=>start('connected',h.options),/CI_REGISTRY_CONTEXT_REQUIRED/);assert.deepEqual(h.calls,[]);}
});

test('a throttled GHCR pull cannot accept a mirror digest from a different repository or content',async()=>{
 const start=entry(),h=harness(),actual=h.options.run;let failed=false;
 h.options.run=(program,args,options)=>{
  if(args[0]==='pull'&&!failed){failed=true;return {status:1,stderr:'toomanyrequests',stdout:''};}
  if(args[0]==='image'&&args[2].startsWith('docker.io/'))return {status:0,stdout:JSON.stringify(['other.example/outsider@'+verifiedLock.images[0].digest]),stderr:''};
  return actual(program,args,options);
 };
 await assert.rejects(()=>start('connected',h.options),/IMAGE_DIGEST_REQUIRED/);assert.ok(!h.calls.some(x=>x[1]==='tag'));
});

test('verified publisher fallback accepts Docker Hub canonical library names and retains the original service tag',async()=>{
 const start=entry(),h=harness(),actual=h.options.run;let failed=false;
 h.options.run=(program,args,options)=>{
  if(args[0]==='pull'&&args.at(-1).startsWith('ghcr.io/supabase/kong')&&!failed){failed=true;h.calls.push([program,...args]);return {status:1,stderr:'HTTP429 toomanyrequests',stdout:''};}
  if(args[0]==='image'&&args[2].startsWith('docker.io/library/kong@')){h.calls.push([program,...args]);return {status:0,stdout:JSON.stringify([args[2].replace('docker.io/library/','')]),stderr:''};}
  return actual(program,args,options);
 };
 const r=await start('connected',h.options),kong=r.images.find(x=>x.image==='ghcr.io/supabase/kong:2.8.1');
 assert.equal(kong.source,'VERIFIED_DOCKER_HUB');assert.ok(kong.downloadReference.startsWith('docker.io/library/kong@sha256:'));assert.ok(h.calls.some(x=>x[1]==='tag'&&x.at(-1)==='ghcr.io/supabase/kong:2.8.1'));
});

test('every image is acquired by its verified digest and only then assigned its unchanged CLI tag',async()=>{
 const start=entry(),h=harness();await start('mailbox',h.options);
 const pulls=h.calls.filter(x=>x[1]==='pull');assert.equal(pulls.length,9);
 for(const call of pulls){assert.deepEqual(call.slice(2,4),['--platform','linux/amd64']);assert.match(call.at(-1),/@sha256:[a-f0-9]{64}$/);assert.ok(verifiedLock.images.some(x=>call.at(-1).endsWith('@'+x.digest)));}
 assert.equal(h.calls.filter(x=>x[1]==='tag').length,9);
});
