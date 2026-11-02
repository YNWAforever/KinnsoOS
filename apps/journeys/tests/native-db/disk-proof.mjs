import {gate} from './target.mjs';
import {parseDockerDisk} from './live-support.mjs';

const dataPath='/mnt/docker-desktop-disk/data/docker';
export function validateDaemonDiskProof(e){
  gate(e?.engineRoot==='/var/lib/docker'&&e.operatingSystem==='Docker Desktop','DOCKER_ENGINE_IDENTITY_INVALID');
  gate(Number.isSafeInteger(e.pid)&&e.pid>0&&e.daemonBefore==='dockerd'&&e.daemonAfter==='dockerd','DOCKER_DAEMON_IDENTITY_INVALID');
  const identities=[e.rootBefore,e.rootAfter,e.dataBefore,e.dataAfter];
  gate(identities.every(v=>typeof v==='string'&&/^[1-9]\d*:[1-9]\d*$/.test(v))&&
    identities.every(v=>v===identities[0]),'DOCKER_DISK_ANCESTRY_MISMATCH');
  const disk=parseDockerDisk(e.df);
  gate(disk.mount==='/mnt/docker-desktop-disk'&&/^\/dev\/[a-z0-9]+$/.test(disk.source)&&
    Number.isSafeInteger(disk.availableBytes)&&disk.availableBytes>=0,'DOCKER_DISK_INVALID');
  return Object.freeze({verified:true,freeBytes:disk.availableBytes,totalBytes:disk.totalBytes,
    engineRoot:e.engineRoot,daemonPid:e.pid,identity:identities[0],source:disk.source,
    mount:disk.mount,dataPath,proof:'daemon-root-device-inode-before-after'});
}

export async function probeDockerDisk({engineRoot,operatingSystem,command}){
  gate(engineRoot==='/var/lib/docker'&&operatingSystem==='Docker Desktop','DOCKER_ENGINE_IDENTITY_INVALID');
  const read=async args=>String(await command('wsl.exe',['-d','docker-desktop','-e',...args])).trim();
  const pidText=await read(['pidof','dockerd']);
  gate(/^[1-9]\d*$/.test(pidText),'DOCKER_DAEMON_IDENTITY_INVALID');
  const pid=Number(pidText),rootPath=`/proc/${pid}/root${engineRoot}`;
  const daemonBefore=await read(['cat',`/proc/${pid}/comm`]);
  const rootBefore=await read(['stat','-c','%d:%i',rootPath]);
  const dataBefore=await read(['stat','-c','%d:%i',dataPath]);
  const df=await read(['df','-P',rootPath]);
  const rootAfter=await read(['stat','-c','%d:%i',rootPath]);
  const dataAfter=await read(['stat','-c','%d:%i',dataPath]);
  const daemonAfter=await read(['cat',`/proc/${pid}/comm`]);
  return validateDaemonDiskProof({engineRoot,operatingSystem,pid,daemonBefore,daemonAfter,rootBefore,rootAfter,dataBefore,dataAfter,df});
}
