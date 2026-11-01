import test from 'node:test';
import assert from 'node:assert/strict';
import {probeDockerDisk,validateDaemonDiskProof} from './disk-proof.mjs';

const df='Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sdd 1055762868 201262048 800797348 20% /mnt/docker-desktop-disk\n';
const evidence=()=>({engineRoot:'/var/lib/docker',operatingSystem:'Docker Desktop',pid:152,
  daemonBefore:'dockerd',daemonAfter:'dockerd',rootBefore:'2096:24',rootAfter:'2096:24',
  dataBefore:'2096:24',dataAfter:'2096:24',df});
test('daemon namespace and candidate data directory must denote the same filesystem object',()=>{
  const proof=validateDaemonDiskProof(evidence());
  assert.equal(proof.verified,true);
  assert.equal(proof.freeBytes,800797348*1024);
  assert.equal(proof.identity,'2096:24');
  assert.equal(proof.engineRoot,'/var/lib/docker');
  assert.equal(proof.daemonPid,152);
});
test('a side-mounted directory, changed daemon, stale identity or wrong engine cannot qualify',()=>{
  for(const delta of [{rootBefore:'2096:99'},{rootAfter:'2096:99'},{dataAfter:'2096:99'},
    {daemonAfter:'other'},{daemonBefore:'other'},{pid:0},{pid:'152;bad'},
    {operatingSystem:'foreign'},{engineRoot:'/foreign'},{df:'not a filesystem'}]){
    assert.throws(()=>validateDaemonDiskProof({...evidence(),...delta}));
  }
});
test('probe uses the process root for df, rereads identities, and performs no Docker mutation',async()=>{
  const calls=[];
  const result=await probeDockerDisk({engineRoot:'/var/lib/docker',operatingSystem:'Docker Desktop',command:async(file,args)=>{
    calls.push({file,args});
    const a=args.slice(3);
    if(a[0]==='pidof')return '152';
    if(a[0]==='cat')return 'dockerd';
    if(a[0]==='stat')return '2096:24';
    if(a[0]==='df')return df;
    throw Error('Unexpected command');
  }});
  assert.equal(result.verified,true);
  assert(calls.some(c=>c.args.join(' ').includes('df -P /proc/152/root/var/lib/docker')));
  assert.equal(calls.filter(c=>c.args.includes('stat')).length,4);
  assert(calls.every(c=>c.file==='wsl.exe'&&c.args[0]==='-d'&&c.args[1]==='docker-desktop'));
});
test('multiple daemons and unknown ancestry fail closed before capacity can qualify',async()=>{
  let calls=0;
  await assert.rejects(probeDockerDisk({engineRoot:'/var/lib/docker',operatingSystem:'Docker Desktop',
    command:async()=>{calls++;return '152 153';}}),{code:'DOCKER_DAEMON_IDENTITY_INVALID'});
  assert.equal(calls,1);
});
